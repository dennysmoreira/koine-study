/**
 * Conversor de JSON "thiagobodruk/bible" → JSON do cadastro de versões
 * (data/versions/*.json).
 *
 * É o formato JSON mais difundido para Bíblias em português (usado pelo repo
 * thiagobodruk/bible e derivados): um array de livros, cada um com `abbrev`
 * (abreviação PT-BR) e `chapters` — uma matriz [capítulo][versículo] de strings.
 *
 *   [ { "abbrev": "gn", "chapters": [ ["v1", "v2", ...], ... ] }, ... ]
 *
 * Este passo NÃO baixa nada — apenas CONVERTE um arquivo que VOCÊ já possui
 * (sob a licença do detentor dos direitos: NVI/ACF etc. são protegidas) para o
 * formato que `ingest-version-file` carrega no banco. O gargalo nunca foi
 * técnico, e sim jurídico.
 *
 * Como o corpus do koiné é só o NT (books.id 40–66), só os 27 livros do NT são
 * convertidos; os livros do AT presentes no arquivo são ignorados silenciosamente
 * (não há correspondência em public.books, então o load os descartaria de toda
 * forma).
 *
 * Fluxo:
 *   1) você obtém o JSON (sob licença), ex.: nvi.json
 *   2) npm run ingest:convert-bible-json -- --input=nvi.json --code=pt-nvi \
 *        --name="Nova Versão Internacional" --language=pt \
 *        --sort-order=11
 *   3) gera data/versions/pt-nvi.json
 *   4) npm run ingest:version-file -- --file=data/versions/pt-nvi.json
 *
 * É um Adapter: isola as idiossincrasias do formato thiagobodruk do modelo interno.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { OT_BOOKS } from './ot-books.ts';

// Abreviações PT-BR (thiagobodruk) dos 27 livros do NT → nosso osis_code.
// Inclui aliases tolerantes ("at"/"atos", "tt"/"tit") porque variantes do mesmo
// formato divergem em alguns códigos.
const NT_ABBREV_TO_OSIS: Record<string, string> = {
  mt: 'Matt',
  mc: 'Mark',
  lc: 'Luke',
  jo: 'John',
  at: 'Acts',
  atos: 'Acts',
  rm: 'Rom',
  '1co': '1Cor',
  '2co': '2Cor',
  gl: 'Gal',
  ef: 'Eph',
  fp: 'Phil',
  cl: 'Col',
  '1ts': '1Thess',
  '2ts': '2Thess',
  '1tm': '1Tim',
  '2tm': '2Tim',
  tt: 'Titus',
  tit: 'Titus',
  fm: 'Phlm',
  hb: 'Heb',
  tg: 'Jas',
  '1pe': '1Pet',
  '2pe': '2Pet',
  '1jo': '1John',
  '2jo': '2John',
  '3jo': '3John',
  jd: 'Jude',
  ap: 'Rev',
};

// Mapa completo (NT + AT). As abreviações do AT vêm de ot-books.ts (campo `tb`).
// ATENÇÃO: Jó é "jó" COM acento no thiagobodruk; "job" é alias tolerante. Não
// normalizamos removendo acentos (isso colapsaria "jó" em "jo" = João, NT).
const PT_ABBREV_TO_OSIS: Record<string, string> = {
  ...NT_ABBREV_TO_OSIS,
  ...Object.fromEntries(OT_BOOKS.map((b) => [b.tb, b.osis])),
  job: 'Job',
};

interface OutVerse {
  ref: string;
  text: string;
}

interface SourceBook {
  abbrev?: string;
  chapters?: string[][];
}

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
}

/** Converte UM livro (matriz capítulo→versículo) em versículos {ref, text}. */
export function convertBook(book: SourceBook): { osis: string; verses: OutVerse[] } | null {
  const abbrev = (book.abbrev ?? '').trim().toLowerCase();
  const osis = PT_ABBREV_TO_OSIS[abbrev];
  if (!osis) return null; // livro do AT (fora do corpus) ou abreviação desconhecida
  if (!Array.isArray(book.chapters)) return null;

  const verses: OutVerse[] = [];
  book.chapters.forEach((chapterVerses, chIdx) => {
    if (!Array.isArray(chapterVerses)) return;
    const chapter = chIdx + 1;
    chapterVerses.forEach((raw, vIdx) => {
      const text = (raw ?? '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      verses.push({ ref: `${osis} ${chapter}:${vIdx + 1}`, text });
    });
  });
  return { osis, verses };
}

/**
 * Converte um JSON thiagobodruk/bible para data/versions/<code>.json. Os
 * metadados (code/name/language...) vêm de flags, pois não estão no arquivo
 * de texto.
 */
export function convertBibleJson(): void {
  const input = arg('input');
  if (!input) {
    throw new Error(
      'informe a entrada: npm run ingest:convert-bible-json -- --input=nvi.json --code=pt-nvi --name="..." --language=pt',
    );
  }
  if (!existsSync(input)) throw new Error(`entrada não encontrada: ${input}`);

  const code = arg('code');
  const name = arg('name');
  const language = arg('language');
  const missing = [
    ['code', code],
    ['name', name],
    ['language', language],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(`flags obrigatórias ausentes: ${missing.map((m) => `--${m}`).join(' ')}`);
  }

  let parsed: unknown;
  try {
    // remove BOM (UTF-8 BOM é comum nestes dumps) antes do parse
    parsed = JSON.parse(readFileSync(input, 'utf-8').replace(/^﻿/, ''));
  } catch (e) {
    throw new Error(`não consegui ler/parsear ${input}: ${e instanceof Error ? e.message : e}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error('formato inesperado: esperado um array de livros [{abbrev, chapters}]');
  }

  console.log(`convertendo ${parsed.length} livro(s) do JSON thiagobodruk...`);
  const allVerses: OutVerse[] = [];
  let books = 0;
  for (const book of parsed as SourceBook[]) {
    const res = convertBook(book);
    if (!res) continue;
    books++;
    allVerses.push(...res.verses);
    console.log(`  ${res.osis.padEnd(8)} ${res.verses.length} versículos`);
  }
  if (allVerses.length === 0) {
    throw new Error(
      'nenhum versículo extraído — verifique se o arquivo segue o formato {abbrev, chapters} com abreviações PT-BR.',
    );
  }
  console.log(`livros convertidos: ${books}/66`);

  const out = arg('out') ?? join('data', 'versions', `${code}.json`);
  const outDir = join(out, '..');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const payload = {
    code,
    name,
    language,
    source_url: arg('source-url') ?? null,
    text_type: arg('text-type') ?? 'translation',
    sort_order: Number(arg('sort-order') ?? 50),
    verses: allVerses,
  };
  writeFileSync(out, JSON.stringify(payload, null, 0), 'utf-8');
  console.log(`\n${allVerses.length} versículos → ${out}`);
  console.log(`próximo passo: npm run ingest:version-file -- --file=${out}`);
}
