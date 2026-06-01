/**
 * Backfill de verse_texts a partir do corpus tokenizado (Fase do comparador).
 *
 * A tradução original (grego SBLGNT) não é "carregada" de uma fonte de texto
 * corrido — ela é DERIVADA do corpus já presente em public.tokens, concatenando
 * as superfícies (token.surface) de cada versículo na ordem de `position`. Assim
 * a versão grega do comparador fica sempre coerente com o leitor interlinear
 * (mesma fonte), sem duplicar a fonte de verdade.
 *
 * Idempotente: upsert por (translation_code, ref). Reexecutar regrava o texto.
 * Nota: o upsert não remove linhas órfãs — se o corpus for reingerido com MENOS
 * versículos (improvável; o NT não encolhe), os verse_texts antigos persistem.
 * Para um reset limpo, apague verse_texts de grc-sblgnt antes de rodar.
 *
 * Requer SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (escreve via service_role,
 * contornando a RLS de leitura pública).
 */

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const GRC_CODE = 'grc-sblgnt';

interface VerseRow {
  id: number;
  ref: string;
  book_id: number | null;
  chapter: number;
  verse: number;
}

interface TokenRow {
  verse_id: number;
  position: number;
  surface: string;
}

/** Lê todas as linhas de uma query paginada (PostgREST limita ~1000 por página). */
async function readAll<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  table: string,
  columns: string,
  orderBy: string,
): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .order(orderBy)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`ler ${table}: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function backfillGreek(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');

  const client = createClient(url, key, { auth: { persistSession: false } });

  // garante que a tradução original está registrada (a migração já faz o seed,
  // mas reexecutar aqui torna o passo autossuficiente).
  const { error: tErr } = await client.from('translations').upsert(
    {
      code: GRC_CODE,
      name: 'SBL Greek New Testament',
      language: 'grc',
      license: 'CC BY 4.0',
      source_url: 'https://github.com/Clear-Bible/macula-greek',
      text_type: 'critical',
      is_original: true,
      sort_order: 0,
    },
    { onConflict: 'code' },
  );
  if (tErr) throw new Error(`upsert translations: ${tErr.message}`);

  console.log('lendo versículos e tokens do corpus...');
  const verses = await readAll<VerseRow>(client, 'verses', 'id,ref,book_id,chapter,verse', 'id');
  const tokens = await readAll<TokenRow>(client, 'tokens', 'verse_id,position,surface', 'verse_id');
  console.log(`  versículos: ${verses.length}  tokens: ${tokens.length}`);

  // agrupa tokens por versículo, preservando a ordem de posição
  const byVerse = new Map<number, TokenRow[]>();
  for (const t of tokens) {
    const arr = byVerse.get(t.verse_id);
    if (arr) arr.push(t);
    else byVerse.set(t.verse_id, [t]);
  }

  const rows: Array<Record<string, unknown>> = [];
  let empty = 0;
  for (const v of verses) {
    const list = byVerse.get(v.id);
    if (!list || list.length === 0) {
      empty++;
      continue;
    }
    list.sort((a, b) => a.position - b.position);
    const text = list.map((t) => t.surface).join(' ').trim();
    if (!text) {
      empty++;
      continue;
    }
    rows.push({
      translation_code: GRC_CODE,
      ref: v.ref,
      book_id: v.book_id,
      chapter: v.chapter,
      verse: v.verse,
      text,
    });
  }

  console.log(`montados ${rows.length} versículos (vazios ignorados: ${empty})`);

  const SIZE = 500;
  let applied = 0;
  for (let i = 0; i < rows.length; i += SIZE) {
    const batch = rows.slice(i, i + SIZE);
    const { error } = await client
      .from('verse_texts')
      .upsert(batch, { onConflict: 'translation_code,ref' });
    if (error) throw new Error(`upsert verse_texts @${i}: ${error.message}`);
    applied += batch.length;
    process.stdout.write(`\r  verse_texts (${GRC_CODE}): ${applied}/${rows.length}`);
  }
  process.stdout.write('\n');
  console.log(`grego SBLGNT carregado em public.verse_texts (${applied} versículos).`);
}

// ── Ingestão de versões livres (PT/EN) via getbible.net v2 ────────────────
//
// Fonte: getbible.net v2 (JSON por capítulo). A numeração de livros do getbible
// coincide com books.id no NT (Mateus=40 … Apocalipse=66), então usamos book.id
// direto na URL. Só ingerimos versões de licença aberta/domínio público — nunca
// versões protegidas (ARA/NVI/ACF etc.).
//
// O `ref` é montado a partir do nosso osis_code (não do name_pt do getbible),
// mantendo a chave de junção idêntica à do grego. Versões baseadas no Texto
// Recebido trazem versículos ausentes no texto crítico (ex.: João 5:4) — eles
// entram normalmente e o comparador os exibe com "—" na coluna do grego.

interface VersionSource {
  code: string; // nosso código (ex.: 'pt-blivre')
  getbible: string; // chave na getbible.net (ex.: 'livre')
  name: string;
  language: string;
  license: string;
  source_url: string;
  text_type: string;
  sort_order: number;
}

// sort_order: grego = 0; PT primeiro (audiência PT-BR), depois EN.
const VERSION_SOURCES: VersionSource[] = [
  {
    code: 'pt-blivre',
    getbible: 'livre',
    name: 'Bíblia Livre',
    language: 'pt',
    license: 'CC BY 3.0 BR',
    source_url: 'https://getbible.net',
    text_type: 'translation',
    sort_order: 10,
  },
  {
    code: 'en-web',
    getbible: 'web',
    name: 'World English Bible',
    language: 'en',
    license: 'Domínio Público',
    source_url: 'https://worldenglish.bible',
    text_type: 'translation',
    sort_order: 20,
  },
];

interface GetbibleVerse {
  chapter: number;
  verse: number;
  text: string;
}

// Línguas originais que definem o cânone a buscar: grego (NT) + hebraico (AT).
// A lista canônica deriva de verse_texts destes códigos — não da tabela `verses`
// (só NT) — para que as versões livres (getbible) também cubram o AT.
const ORIGINAL_CODES = [GRC_CODE, 'hbo-wlc'];

// Lista canônica de capítulos (book_id, osis, chapter) derivada dos textos
// originais já carregados — define quais (livro, capítulo) buscar na fonte.
async function readChapterList(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
): Promise<Array<{ bookId: number; osis: string; chapter: number }>> {
  const books = await readAll<{ id: number; osis_code: string }>(
    client,
    'books',
    'id,osis_code',
    'id',
  );
  const osisById = new Map(books.map((b) => [b.id, b.osis_code]));

  // distinct (book_id, chapter) sobre os textos originais (grc NT + hbo AT).
  // Paginado com ordem determinística por (translation_code, ref) — combo único
  // de verse_texts — para que o range não embaralhe linhas entre páginas.
  const seen = new Set<string>();
  const out: Array<{ bookId: number; osis: string; chapter: number }> = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from('verse_texts')
      .select('book_id,chapter')
      .in('translation_code', ORIGINAL_CODES)
      .order('translation_code')
      .order('ref')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`ler verse_texts (originais): ${error.message}`);
    const page = (data ?? []) as Array<{ book_id: number | null; chapter: number }>;
    for (const v of page) {
      if (v.book_id == null) continue;
      const key = `${v.book_id}:${v.chapter}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const osis = osisById.get(v.book_id);
      if (!osis) continue; // versículo sem livro correspondente — ignora
      out.push({ bookId: v.book_id, osis, chapter: v.chapter });
    }
    if (page.length < PAGE) break;
  }
  return out.sort((a, b) => a.bookId - b.bookId || a.chapter - b.chapter);
}

async function fetchGetbibleChapter(
  getbibleKey: string,
  bookId: number,
  chapter: number,
): Promise<GetbibleVerse[]> {
  const res = await fetch(`https://api.getbible.net/v2/${getbibleKey}/${bookId}/${chapter}.json`);
  // 404 = capítulo inexistente NESTA versão (diferença de versificação: o cânone
  // é guiado pelo original hebraico/grego, que numera alguns livros com mais
  // capítulos que as traduções cristãs — ex.: Joel tem 4 capítulos no WLC e 3 na
  // maioria das traduções). Tratamos como "sem versículos" em vez de abortar.
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`getbible ${getbibleKey} ${bookId}/${chapter}: HTTP ${res.status}`);
  const data = (await res.json()) as { verses?: GetbibleVerse[] };
  return data.verses ?? [];
}

/** Ingere uma versão livre da getbible.net no esquema do comparador. */
async function ingestVersion(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  src: VersionSource,
  chapterList: Array<{ bookId: number; osis: string; chapter: number }>,
): Promise<void> {
  console.log(`\n── ingerindo ${src.code} (${src.name}) ──`);

  const { error: tErr } = await client.from('translations').upsert(
    {
      code: src.code,
      name: src.name,
      language: src.language,
      license: src.license,
      source_url: src.source_url,
      text_type: src.text_type,
      is_original: false,
      sort_order: src.sort_order,
    },
    { onConflict: 'code' },
  );
  if (tErr) throw new Error(`upsert translations[${src.code}]: ${tErr.message}`);

  // busca capítulos com concorrência limitada (educado com a API e rápido)
  const CONCURRENCY = 8;
  const rows: Array<Record<string, unknown>> = [];
  let fetched = 0;
  for (let i = 0; i < chapterList.length; i += CONCURRENCY) {
    const batch = chapterList.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (c) => {
        const verses = await fetchGetbibleChapter(src.getbible, c.bookId, c.chapter);
        return { c, verses };
      }),
    );
    for (const { c, verses } of results) {
      for (const v of verses) {
        const text = v.text.replace(/\s+/g, ' ').trim();
        if (!text) continue;
        rows.push({
          translation_code: src.code,
          ref: `${c.osis} ${c.chapter}:${v.verse}`,
          book_id: c.bookId,
          chapter: c.chapter,
          verse: v.verse,
          text,
        });
      }
    }
    fetched += batch.length;
    process.stdout.write(`\r  capítulos: ${fetched}/${chapterList.length}`);
  }
  process.stdout.write('\n');

  const SIZE = 500;
  let applied = 0;
  for (let i = 0; i < rows.length; i += SIZE) {
    const batch = rows.slice(i, i + SIZE);
    const { error } = await client
      .from('verse_texts')
      .upsert(batch, { onConflict: 'translation_code,ref' });
    if (error) throw new Error(`upsert verse_texts[${src.code}] @${i}: ${error.message}`);
    applied += batch.length;
    process.stdout.write(`\r  verse_texts (${src.code}): ${applied}/${rows.length}`);
  }
  process.stdout.write('\n');
  console.log(`${src.code}: ${applied} versículos carregados.`);
}

/**
 * Ingere uma ou todas as versões livres conhecidas. `codeFilter` (opcional)
 * restringe a um único código (ex.: 'pt-blivre').
 */
export async function ingestFreeVersions(codeFilter?: string): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');

  const targets = codeFilter
    ? VERSION_SOURCES.filter((s) => s.code === codeFilter)
    : VERSION_SOURCES;
  if (targets.length === 0) {
    throw new Error(
      `código desconhecido: ${codeFilter}. Disponíveis: ${VERSION_SOURCES.map((s) => s.code).join(', ')}`,
    );
  }

  const client = createClient(url, key, { auth: { persistSession: false } });
  const chapterList = await readChapterList(client);
  console.log(`capítulos canônicos no corpus: ${chapterList.length}`);

  for (const src of targets) {
    await ingestVersion(client, src, chapterList);
  }
}

// ── Cadastro de versões a partir de arquivo (texto fornecido pelo usuário) ──
//
// IMPORTANTE — DIREITOS AUTORAIS: este passo NÃO baixa nem busca nenhum texto.
// Ele apenas CARREGA um arquivo que VOCÊ fornece. Para versões protegidas
// (NVI, ACF, NAA, ARA, NTLH etc.), o arquivo só pode ser usado se você possuir
// a licença do detentor dos direitos (editora/sociedade bíblica). A estrutura
// é agnóstica: o gargalo nunca foi técnico, e sim jurídico.
//
// Formato do arquivo (JSON):
// {
//   "code": "pt-nvi",                  // identificador único (kebab-case)
//   "name": "Nova Versão Internacional",
//   "language": "pt",                  // pt | en | grc | ...
//   "license": "© Biblica — uso licenciado",
//   "source_url": "https://...",       // opcional
//   "text_type": "translation",        // translation | critical | paraphrase ...
//   "sort_order": 15,                  // ordem nas colunas (grego=0, livres=10/20)
//   "verses": [
//     { "ref": "John 1:1", "text": "..." }
//     // — ou — { "book": "John", "chapter": 1, "verse": 1, "text": "..." }
//     // "book" aceita osis_code (ex.: "1John") ou o id numérico do livro.
//   ]
// }

interface VersionFileVerse {
  ref?: string;
  book?: string | number;
  chapter?: number;
  verse?: number;
  text: string;
}

interface VersionFile {
  code?: string;
  name?: string;
  language?: string;
  license?: string;
  source_url?: string;
  text_type?: string;
  sort_order?: number;
  verses?: VersionFileVerse[];
}

/** Divide "1 John 2:3" em { osis: "1 John", chapter: 2, verse: 3 }. */
function parseRef(ref: string): { osis: string; chapter: number; verse: number } | null {
  const at = ref.lastIndexOf(' ');
  if (at <= 0) return null;
  const osis = ref.slice(0, at).trim();
  const cv = ref.slice(at + 1).split(':');
  if (cv.length !== 2) return null;
  const chapter = Number(cv[0]);
  const verse = Number(cv[1]);
  if (!Number.isFinite(chapter) || !Number.isFinite(verse)) return null;
  return { osis, chapter, verse };
}

/**
 * Cadastra/atualiza UMA versão a partir de um arquivo JSON local fornecido pelo
 * usuário. Idempotente: upsert por (translation_code, ref). Não baixa nada da
 * internet — o conteúdo vem exclusivamente do arquivo.
 */
export async function ingestVersionFromFile(filePath?: string): Promise<void> {
  if (!filePath) {
    throw new Error(
      'informe o arquivo: npm run ingest:version-file -- --file=data/versions/pt-nvi.json',
    );
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');

  let parsed: VersionFile;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as VersionFile;
  } catch (e) {
    throw new Error(`não consegui ler/parsear ${filePath}: ${e instanceof Error ? e.message : e}`);
  }

  // valida metadados obrigatórios
  const required: Array<keyof VersionFile> = ['code', 'name', 'language', 'license'];
  const missing = required.filter((k) => !parsed[k]);
  if (missing.length) throw new Error(`campos obrigatórios ausentes no arquivo: ${missing.join(', ')}`);
  if (!Array.isArray(parsed.verses) || parsed.verses.length === 0) {
    throw new Error('o arquivo não contém "verses" (array não-vazio)');
  }

  const code = parsed.code as string;
  const client = createClient(url, key, { auth: { persistSession: false } });

  console.log(`\n── cadastrando ${code} (${parsed.name}) a partir de ${filePath} ──`);
  console.log('  NOTA: este passo só carrega o arquivo fornecido; não baixa texto da internet.');

  // mapeia osis_code -> id e id -> osis_code (aceita ambos no campo "book")
  const books = await readAll<{ id: number; osis_code: string }>(client, 'books', 'id,osis_code', 'id');
  const idByOsis = new Map(books.map((b) => [b.osis_code, b.id]));
  const osisById = new Map(books.map((b) => [b.id, b.osis_code]));

  const { error: tErr } = await client.from('translations').upsert(
    {
      code,
      name: parsed.name,
      language: parsed.language,
      license: parsed.license,
      source_url: parsed.source_url ?? null,
      text_type: parsed.text_type ?? 'translation',
      is_original: false,
      sort_order: parsed.sort_order ?? 50,
    },
    { onConflict: 'code' },
  );
  if (tErr) throw new Error(`upsert translations[${code}]: ${tErr.message}`);

  // monta linhas resolvendo book_id e ref canônica
  const rows: Array<Record<string, unknown>> = [];
  let skipped = 0;
  for (const v of parsed.verses) {
    const text = (v.text ?? '').replace(/\s+/g, ' ').trim();
    if (!text) {
      skipped++;
      continue;
    }

    let osis: string | undefined;
    let chapter: number | undefined;
    let verse: number | undefined;
    let bookId: number | undefined;

    if (v.ref) {
      const p = parseRef(v.ref);
      if (!p) {
        skipped++;
        continue;
      }
      osis = p.osis;
      chapter = p.chapter;
      verse = p.verse;
      bookId = idByOsis.get(osis);
    } else {
      chapter = Number(v.chapter);
      verse = Number(v.verse);
      if (typeof v.book === 'number') {
        bookId = v.book;
        osis = osisById.get(v.book);
      } else if (typeof v.book === 'string') {
        bookId = idByOsis.get(v.book);
        osis = v.book;
      }
    }

    if (!osis || !bookId || !Number.isFinite(chapter) || !Number.isFinite(verse)) {
      skipped++;
      continue;
    }

    rows.push({
      translation_code: code,
      ref: `${osis} ${chapter}:${verse}`,
      book_id: bookId,
      chapter,
      verse,
      text,
    });
  }

  console.log(`  versículos válidos: ${rows.length} (ignorados: ${skipped})`);
  if (rows.length === 0) {
    throw new Error(
      'nenhum versículo válido — verifique o campo "ref"/"book" (osis_code deve bater com a tabela books).',
    );
  }

  const SIZE = 500;
  let applied = 0;
  for (let i = 0; i < rows.length; i += SIZE) {
    const batch = rows.slice(i, i + SIZE);
    const { error } = await client
      .from('verse_texts')
      .upsert(batch, { onConflict: 'translation_code,ref' });
    if (error) throw new Error(`upsert verse_texts[${code}] @${i}: ${error.message}`);
    applied += batch.length;
    process.stdout.write(`\r  verse_texts (${code}): ${applied}/${rows.length}`);
  }
  process.stdout.write('\n');
  console.log(`${code}: ${applied} versículos cadastrados.`);
}
