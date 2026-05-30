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

// Lista canônica de capítulos (book_id, osis, chapter) derivada do corpus já
// carregado — define quais (livro, capítulo) buscar na fonte.
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

  const verses = await readAll<{ book_id: number; chapter: number }>(
    client,
    'verses',
    'book_id,chapter',
    'book_id',
  );
  const seen = new Set<string>();
  const out: Array<{ bookId: number; osis: string; chapter: number }> = [];
  for (const v of verses) {
    const key = `${v.book_id}:${v.chapter}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const osis = osisById.get(v.book_id);
    if (!osis) continue; // versículo sem livro correspondente — ignora
    out.push({ bookId: v.book_id, osis, chapter: v.chapter });
  }
  return out.sort((a, b) => a.bookId - b.bookId || a.chapter - b.chapter);
}

async function fetchGetbibleChapter(
  getbibleKey: string,
  bookId: number,
  chapter: number,
): Promise<GetbibleVerse[]> {
  const res = await fetch(`https://api.getbible.net/v2/${getbibleKey}/${bookId}/${chapter}.json`);
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
