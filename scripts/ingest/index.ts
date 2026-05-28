/**
 * Pipeline de ingestão (ETL) do corpus koiné — Fase 0.
 *
 * Fontes (domínio público, em data/sources/):
 *   - byztxt/byzantine-majority-text  -> texto + morfologia + Strong's
 *       usa csv-unicode/strongs/with-parsing/<BOOK>.csv
 *       (texto SEM acentos; acentos virão por alinhamento com ccat numa etapa futura)
 *   - biblicalhumanities/Dodson-Greek-Lexicon -> glosas EN (dodson.csv, TSV)
 *
 * Passos:
 *   download  -> garante que as fontes existem (clona se faltar)
 *   build     -> lemmas + text + link + frequency -> grava data/build/*.json
 *   translate -> gloss_en -> gloss_pt (LLM, em lote)   [requer ANTHROPIC_API_KEY]
 *   load      -> data/build/*.json -> Supabase          [requer SUPABASE_*]
 *
 * Uso:
 *   npm run ingest                  # download + build (gera artefatos locais)
 *   npm run ingest -- --step=build
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import { decodeMorph } from './morph-decoder.ts';
import { BOOKS, normalizeStrongs } from './books.ts';
import { translate } from './translate.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCES = join(ROOT, 'data', 'sources');
const BUILD = join(ROOT, 'data', 'build');
const DODSON_CSV = join(SOURCES, 'dodson', 'dodson.csv');
const DODSON_XML = join(SOURCES, 'dodson', 'dodson.xml');
const PARSED_DIR = join(SOURCES, 'byztxt', 'csv-unicode', 'strongs', 'with-parsing');

const REPOS = {
  dodson: 'https://github.com/biblicalhumanities/Dodson-Greek-Lexicon.git',
  byztxt: 'https://github.com/byztxt/byzantine-majority-text.git',
} as const;

// ── Tipos do modelo construído ──────────────────────────────────────────
interface Lemma {
  id: number; lemma: string; strongs: string | null; gk_number: string | null;
  gloss_en: string | null; gloss_long_en: string | null; frequency: number;
}
interface Verse { id: number; book_id: number; chapter: number; verse: number; ref: string }
interface Token {
  verse_id: number; position: number; surface: string; lemma_id: number | null;
  strongs: string | null; morph_code: string;
  m_pos: string | null; m_tense: string | null; m_voice: string | null; m_mood: string | null;
  m_case: string | null; m_number: string | null; m_gender: string | null; m_person: string | null;
}

function arg(name: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
}

// ── download: garante fontes ───────────────────────────────────────────
async function download(): Promise<void> {
  mkdirSync(SOURCES, { recursive: true });
  const need: Array<[string, string]> = [];
  if (!existsSync(DODSON_CSV)) need.push(['dodson', REPOS.dodson]);
  if (!existsSync(PARSED_DIR)) need.push(['byztxt', REPOS.byztxt]);
  if (need.length === 0) { console.log('fontes já presentes em data/sources/'); return; }
  for (const [dir, url] of need) {
    console.log(`clonando ${dir}...`);
    execSync(`git clone --depth 1 -q "${url}" "${join(SOURCES, dir)}"`, { stdio: 'inherit' });
  }
}

// ── lema Unicode (dodson.xml) por strongs ───────────────────────────────
// O CSV traz o "Greek Word" em beta-code (ex.: "bi/blos, ou, h("); o XML expõe a
// forma de dicionário já em Unicode no atributo `entry n="<lema> | <strongs>"`
// (ex.: n="βίβλος | 0976"). Usamos o XML para o lema limpo, mantendo o CSV como
// fonte de id/gk_number/glosas.
function parseUnicodeLemmas(): Map<string, string> {
  if (!existsSync(DODSON_XML)) return new Map();
  const xml = readFileSync(DODSON_XML, 'utf8');
  const re = /<entry n="([^"]*?) \| ([^"]*?)">/g;
  const byStrongs = new Map<string, string>();
  for (let m = re.exec(xml); m !== null; m = re.exec(xml)) {
    const strongs = normalizeStrongs(m[2]);
    const lemma = (m[1] ?? '').trim();
    if (!strongs || !lemma || byStrongs.has(strongs)) continue;
    byStrongs.set(strongs, lemma);
  }
  return byStrongs;
}

// ── parse Dodson -> lemmas (chave: strongs normalizado) ─────────────────
function parseLemmas(): Map<string, Lemma> {
  const raw = readFileSync(DODSON_CSV, 'utf8');
  const rows = parse(raw, { delimiter: '\t', quote: '"', columns: true, skip_empty_lines: true });
  const unicodeByStrongs = parseUnicodeLemmas();
  const byStrongs = new Map<string, Lemma>();
  let id = 0;
  for (const r of rows as Record<string, string>[]) {
    const strongs = normalizeStrongs(r["Strong's"]);
    if (!strongs || byStrongs.has(strongs)) continue;
    const betaCode = (r['Greek Word'] ?? '').trim();
    byStrongs.set(strongs, {
      id: ++id,
      lemma: unicodeByStrongs.get(strongs) ?? betaCode, // Unicode do XML; fallback p/ beta-code do CSV
      strongs,
      gk_number: (r['Goodrick-Kohlenberger'] ?? '').trim() || null,
      gloss_en: (r['English Definition (brief)'] ?? '').trim() || null,
      gloss_long_en: (r['English Definition (longer)'] ?? '').trim() || null,
      frequency: 0,
    });
  }
  return byStrongs;
}

// ── parse byztxt -> verses + tokens (+ decode morfológico + link) ───────
const TOKEN_RE = /([^\s{}]+)\s+(\d+)\s+\{([^}]+)\}/g;

function build(): void {
  mkdirSync(BUILD, { recursive: true });
  const lemmasByStrongs = parseLemmas();

  const verses: Verse[] = [];
  const tokens: Token[] = [];
  let verseId = 0;
  let unmatchedTokens = 0;

  for (const book of BOOKS) {
    const file = join(PARSED_DIR, `${book.code}.csv`);
    if (!existsSync(file)) { console.warn(`AVISO: arquivo ausente ${book.code}.csv`); continue; }
    const rows = parse(readFileSync(file, 'utf8'), { columns: true, skip_empty_lines: true, relax_quotes: true });
    for (const r of rows as Record<string, string>[]) {
      const chapter = Number(r.chapter);
      const verse = Number(r.verse);
      const text = r.text ?? '';
      verseId++;
      verses.push({ id: verseId, book_id: book.id, chapter, verse, ref: `${book.osis} ${chapter}:${verse}` });

      let pos = 0;
      let consumed = 0;
      for (const m of text.matchAll(TOKEN_RE)) {
        const [, surface, strongsRaw, morph] = m;
        consumed += m[0].length;
        const strongs = normalizeStrongs(strongsRaw);
        const f = decodeMorph(morph);
        const lemma = strongs ? lemmasByStrongs.get(strongs) : undefined;
        tokens.push({
          verse_id: verseId, position: ++pos, surface: surface!, lemma_id: lemma?.id ?? null,
          strongs, morph_code: morph!,
          m_pos: f.pos, m_tense: f.tense, m_voice: f.voice, m_mood: f.mood,
          m_case: f.case, m_number: f.number, m_gender: f.gender, m_person: f.person,
        });
        if (lemma) lemma.frequency++;
      }
      // heurística simples de sanidade: contar palavras que não viraram token
      const words = text.trim().split(/\s+/).filter((w) => !/^\d+$/.test(w) && !/^\{/.test(w)).length;
      if (words > pos) unmatchedTokens += words - pos;
    }
  }

  const lemmas = [...lemmasByStrongs.values()];
  const books = BOOKS.map((b) => ({ id: b.id, osis_code: b.osis, name_pt: b.name_pt, name_grc: null, testament: 'NT', sort_order: b.sort_order }));

  writeFileSync(join(BUILD, 'books.json'), JSON.stringify(books));
  writeFileSync(join(BUILD, 'lemmas.json'), JSON.stringify(lemmas));
  writeFileSync(join(BUILD, 'verses.json'), JSON.stringify(verses));
  writeFileSync(join(BUILD, 'tokens.json'), JSON.stringify(tokens));

  const linked = tokens.filter((t) => t.lemma_id !== null).length;
  const usedLemmas = lemmas.filter((l) => l.frequency > 0).length;
  const top = [...lemmas].sort((a, b) => b.frequency - a.frequency).slice(0, 5)
    .map((l) => `${l.strongs}=${l.frequency}`).join(', ');

  console.log(`\n── build concluído (data/build/) ──`);
  console.log(`livros:   ${books.length}`);
  console.log(`versículos: ${verses.length}`);
  console.log(`tokens:   ${tokens.length}  (com lema: ${linked}, ${((linked / tokens.length) * 100).toFixed(1)}%)`);
  console.log(`lemmas:   ${lemmas.length}  (usados no corpus: ${usedLemmas})`);
  console.log(`top-5 frequência: ${top}`);
  if (unmatchedTokens > 0) console.log(`AVISO: ~${unmatchedTokens} palavras sem token (verificar formato)`);
}

type Row = Record<string, unknown>;

// client: any -> script com tabelas dinâmicas (string), sem o tipo do schema gerado
async function insertBatched(
  client: any, table: string, rows: Row[], size: number,
): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await (client.from(table) as any).insert(rows.slice(i, i + size));
    if (error) throw new Error(`${table} [linha ${i}]: ${error.message}`);
    process.stdout.write(`\r  ${table}: ${Math.min(i + size, rows.length)}/${rows.length}`);
  }
  process.stdout.write('\n');
}

async function load(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  if (!existsSync(join(BUILD, 'tokens.json'))) throw new Error('rode `npm run ingest:build` primeiro');

  const client = createClient(url, key, { auth: { persistSession: false } });
  const read = (f: string): Row[] => JSON.parse(readFileSync(join(BUILD, f), 'utf8'));

  // guarda de idempotência: não recarregar sobre corpus já populado
  const { count, error: cErr } = await client
    .from('tokens').select('*', { count: 'exact', head: true });
  if (cErr) throw new Error(`falha ao acessar Supabase: ${cErr.message}`);
  if (count && count > 0) {
    throw new Error(`corpus já tem ${count} tokens; limpe as tabelas antes de recarregar`);
  }

  // ordem de dependência (FK): books -> lemmas -> verses -> tokens
  await insertBatched(client, 'books', read('books.json'), 500);
  await insertBatched(client, 'lemmas', read('lemmas.json'), 1000);
  await insertBatched(client, 'verses', read('verses.json'), 1000);
  await insertBatched(client, 'tokens', read('tokens.json'), 1000);
  console.log('corpus carregado no Supabase.');
}

async function main(): Promise<void> {
  const step = arg('step');
  if (step === 'download') return void (await download());
  if (step === 'build') return build();
  if (step === 'translate') return void (await translate(BUILD));
  if (step === 'load') return void (await load());
  // padrão: download + build
  await download();
  build();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
}
