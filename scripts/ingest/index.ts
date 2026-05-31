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
import { translate, translateLexicon, translateLexiconEntries, deriveGloss, localizeRefs } from './translate.ts';
import { parseAbbottSmith } from './abbott-smith.ts';
import { parseDodson } from './dodson.ts';
import { downloadMacula, buildMacula } from './macula.ts';
import { reloadMacula } from './reload.ts';
import { insertBatched, lemmaIdsByStrongs } from './supabase-io.ts';
import { parseTflsj } from './stepbible-lsj.ts';
import { backfillGreek, ingestFreeVersions, ingestVersionFromFile } from './verse-texts.ts';
import { convertUsfm } from './usfm.ts';
import { convertBibleJson } from './bible-json.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCES = join(ROOT, 'data', 'sources');
const BUILD = join(ROOT, 'data', 'build');
const DODSON_CSV = join(SOURCES, 'dodson', 'dodson.csv');
const DODSON_XML = join(SOURCES, 'dodson', 'dodson.xml');
const PARSED_DIR = join(SOURCES, 'byztxt', 'csv-unicode', 'strongs', 'with-parsing');
const ABBOTT_XML = join(SOURCES, 'abbott-smith', 'abbott-smith.tei.xml');
const STEPBIBLE_DIR = join(SOURCES, 'stepbible');
const TFLSJ_MAIN = join(STEPBIBLE_DIR, 'TFLSJ-main.txt');
const TFLSJ_EXTRA = join(STEPBIBLE_DIR, 'TFLSJ-extra.txt');

const REPOS = {
  dodson: 'https://github.com/biblicalhumanities/Dodson-Greek-Lexicon.git',
  byztxt: 'https://github.com/byztxt/byzantine-majority-text.git',
} as const;

// O repo do Abbott-Smith carrega um PDF de ~32MB; em vez de cloná-lo inteiro,
// baixamos só o TEI XML (raw) — é o único arquivo de que o ETL precisa.
const ABBOTT_RAW_URL =
  'https://raw.githubusercontent.com/translatable-exegetical-tools/Abbott-Smith/master/abbott-smith.tei.xml';

// LSJ via STEPBible (CC BY 4.0), já chaveado por Strong's. Os nomes de arquivo têm
// espaços; encodeURI cuida disso. Baixamos só o TFLSJ (full LSJ) — o TBESG é a base
// Abbott-Smith que já temos. main = G0001-G5624; extra = G6000+ (variantes/LXX).
const STEPBIBLE_REPO_RAW = 'https://raw.githubusercontent.com/STEPBible/STEPBible-Data/master/Lexicons';
const STEPBIBLE_FILES: Array<{ url: string; dest: string }> = [
  { url: `${STEPBIBLE_REPO_RAW}/TFLSJ  0-5624 - Translators Formatted full LSJ Bible lexicon - STEPBible.org CC BY.txt`, dest: TFLSJ_MAIN },
  { url: `${STEPBIBLE_REPO_RAW}/TFLSJ extra - Translators Formatted full LSJ Bible lexicon - STEPBible.org CC BY.txt`, dest: TFLSJ_EXTRA },
];

// ── Tipos do modelo construído ──────────────────────────────────────────
interface Lemma {
  id: number; lemma: string; strongs: string | null; gk_number: string | null;
  gloss_en: string | null; gloss_long_en: string | null; frequency: number;
  abbott_smith: string | null;
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
  for (const [dir, url] of need) {
    console.log(`clonando ${dir}...`);
    execSync(`git clone --depth 1 -q "${url}" "${join(SOURCES, dir)}"`, { stdio: 'inherit' });
  }

  // Abbott-Smith: só o TEI XML (fetch direto, evita o PDF de ~32MB do repo)
  let abbottFetched = false;
  if (!existsSync(ABBOTT_XML)) {
    console.log('baixando abbott-smith.tei.xml...');
    mkdirSync(dirname(ABBOTT_XML), { recursive: true });
    const res = await fetch(ABBOTT_RAW_URL);
    if (!res.ok) throw new Error(`falha ao baixar Abbott-Smith (HTTP ${res.status})`);
    writeFileSync(ABBOTT_XML, await res.text(), 'utf8');
    abbottFetched = true;
  }

  // Resumo coerente: só anuncia "já presentes" quando nada precisou ser obtido.
  if (need.length === 0 && !abbottFetched) console.log('fontes já presentes em data/sources/');
}

// ── download STEPBible (LSJ) ────────────────────────────────────────────
// Arquivos grandes (~32MB juntos) sob CC BY 4.0. Mantidos em data/sources/ (git-
// ignorado) — não redistribuímos a fonte crua (a licença pede referir ao STEPBible);
// só embutimos as entradas derivadas (com atribuição) no app.
async function downloadStepbible(): Promise<void> {
  mkdirSync(STEPBIBLE_DIR, { recursive: true });
  let fetched = 0;
  for (const { url, dest } of STEPBIBLE_FILES) {
    if (existsSync(dest)) continue;
    console.log(`baixando ${url.split('/').pop()}...`);
    const res = await fetch(encodeURI(url));
    if (!res.ok) throw new Error(`falha ao baixar TFLSJ (HTTP ${res.status})`);
    writeFileSync(dest, await res.text(), 'utf8');
    fetched++;
  }
  if (fetched === 0) console.log('TFLSJ já presente em data/sources/stepbible/');
}

// ── build-lexicons: TFLSJ -> data/build/lexicon-entries.json ─────────────
// Gera entradas da stack de léxicos (ADR-001) chaveadas por Strong's. O load
// resolve Strong's -> lemma_id contra o corpus já carregado. text_en = original
// LSJ; text_pt fica null (tradução é a Fase H, sob demanda — entradas longas).
interface LexiconEntryBuild { strongs: string; source: string; text_en: string; sort_order: number }

// sort_order reserva espaço para camadas PD futuras (thayers=10, moulton-milligan=20)
// antes da LSJ (amplitude clássica) = 30.
const LSJ_SORT_ORDER = 30;

function buildLexicons(): void {
  mkdirSync(BUILD, { recursive: true });
  const lsj = parseTflsj(TFLSJ_MAIN, TFLSJ_EXTRA);
  if (lsj.size === 0) {
    throw new Error('nenhuma entrada LSJ parseada — rode `npm run ingest:download-stepbible` primeiro');
  }

  const entries: LexiconEntryBuild[] = [];
  for (const e of lsj.values()) {
    entries.push({ strongs: e.strongs, source: 'lsj', text_en: e.text, sort_order: LSJ_SORT_ORDER });
  }

  writeFileSync(join(BUILD, 'lexicon-entries.json'), JSON.stringify(entries));

  const sample = lsj.get('G2316');
  const lens = entries.map((e) => e.text_en.length).sort((a, b) => a - b);
  const median = lens[Math.floor(lens.length / 2)] ?? 0;
  console.log(`\n── build-lexicons concluído (data/build/lexicon-entries.json) ──`);
  console.log(`entradas LSJ: ${entries.length}  (mediana ${median} chars, máx ${lens.at(-1)})`);
  console.log(`amostra G2316 (θεός): "${sample?.text.slice(0, 60)}..."`);
}

// ── parse Dodson -> lemmas (chave: strongs normalizado) ─────────────────
// O parsing bruto do Dodson (CSV + XML) vive em dodson.ts (compartilhado com o
// build MACULA). Aqui apenas o envelopamos no tipo Lemma do build byztxt, com id
// sequencial, frequency zerada e abbott_smith a ser anexado em build().
function parseLemmas(): Map<string, Lemma> {
  const dodson = parseDodson(DODSON_CSV, DODSON_XML);
  const byStrongs = new Map<string, Lemma>();
  let id = 0;
  for (const d of dodson.values()) {
    byStrongs.set(d.strongs, {
      id: ++id,
      lemma: d.lemma,
      strongs: d.strongs,
      gk_number: d.gk_number,
      gloss_en: d.gloss_en,
      gloss_long_en: d.gloss_long_en,
      frequency: 0,
      abbott_smith: null,
    });
  }
  return byStrongs;
}

// ── parse byztxt -> verses + tokens (+ decode morfológico + link) ───────
const TOKEN_RE = /([^\s{}]+)\s+(\d+)\s+\{([^}]+)\}/g;

function build(): void {
  mkdirSync(BUILD, { recursive: true });
  const lemmasByStrongs = parseLemmas();

  // Léxico Abbott-Smith (entrada de exegese, chaveada por Strong's). Anexa o texto
  // limpo a cada lema que tenha Strong's correspondente; lemas sem correspondência
  // ficam com abbott_smith = null e continuam usando só a glosa do Dodson.
  const abbott = parseAbbottSmith(ABBOTT_XML);
  let abbottLinked = 0;
  for (const lemma of lemmasByStrongs.values()) {
    const entry = lemma.strongs ? abbott.get(lemma.strongs) : undefined;
    lemma.abbott_smith = entry ?? null;
    if (entry) abbottLinked++;
  }

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
  console.log(`abbott-smith: ${abbottLinked}/${lemmas.length} lemas com entrada de exegese`);
  console.log(`top-5 frequência: ${top}`);
  if (unmatchedTokens > 0) console.log(`AVISO: ~${unmatchedTokens} palavras sem token (verificar formato)`);
}

type Row = Record<string, unknown>;

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

// ── lexicon: aplica abbott_smith ao corpus já carregado ─────────────────
// load() recusa rodar sobre um corpus populado (guarda de idempotência), então a
// adição do Abbott-Smith a um corpus existente é feita por UPDATE incremental,
// casando por strongs. Reexecutável (idempotente): só sobrescreve a coluna.
//
// Invariante: parseLemmas() deduplica para 1 lema por strongs (byStrongs.has),
// então cada UPDATE .eq('strongs', ...) deve casar exatamente 1 linha. A unique
// constraint da tabela é (lemma, strongs) — não strongs sozinho — então pedimos
// .select('id') de volta para CONTAR as linhas afetadas e avisar se algum strongs
// não casou nenhuma (corpus desatualizado) ou casou mais de uma (lema duplicado).
async function lexicon(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  if (!existsSync(join(BUILD, 'lemmas.json'))) throw new Error('rode `npm run ingest:build` primeiro');

  const client = createClient(url, key, { auth: { persistSession: false } });
  const lemmas = JSON.parse(readFileSync(join(BUILD, 'lemmas.json'), 'utf8')) as Lemma[];
  const withEntry = lemmas.filter((l) => l.strongs && l.abbott_smith);

  // Concorrência limitada em lotes (em vez de ~5.4k round-trips seriais): cada
  // UPDATE é independente e idempotente, então paralelizar é seguro.
  const CONCURRENCY = 20;
  let done = 0;
  let zeroMatch = 0;
  let multiMatch = 0;
  for (let i = 0; i < withEntry.length; i += CONCURRENCY) {
    const batch = withEntry.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (lemma) => {
        const { data, error } = await (client.from('lemmas') as any)
          .update({ abbott_smith: lemma.abbott_smith })
          .eq('strongs', lemma.strongs)
          .select('id');
        if (error) throw new Error(`lemmas[${lemma.strongs}]: ${error.message}`);
        const matched = (data as unknown[] | null)?.length ?? 0;
        if (matched === 0) zeroMatch++;
        else if (matched > 1) multiMatch++;
      }),
    );
    done += batch.length;
    process.stdout.write(`\r  abbott_smith: ${done}/${withEntry.length}`);
  }
  process.stdout.write('\n');
  if (zeroMatch > 0) console.warn(`AVISO: ${zeroMatch} strongs não casaram nenhuma linha (corpus desatualizado?)`);
  if (multiMatch > 0) console.warn(`AVISO: ${multiMatch} strongs casaram >1 linha (lema duplicado na base)`);
  console.log('Abbott-Smith aplicado ao corpus no Supabase.');
}

// ── load-lexicons: lexicon-entries.json -> public.lexicon_entries ────────
// Resolve Strong's -> lemma_id(s) contra o corpus JÁ carregado (homógrafos: um
// Strong's pode mapear vários lemas; replicamos a entrada para cada lemma_id, igual
// ao fan-out do resto do pipeline). Upsert por (lemma_id, source) -> idempotente e
// reexecutável. Entradas sem lema correspondente no NT são descartadas (silencioso:
// a LSJ cobre o grego clássico inteiro, muito além do corpus do NT).
async function loadLexicons(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  const path = join(BUILD, 'lexicon-entries.json');
  if (!existsSync(path)) throw new Error('rode `npm run ingest:build-lexicons` primeiro');

  const client = createClient(url, key, { auth: { persistSession: false } });

  // strongs -> [lemma_id...] do corpus (homógrafos: um Strong's mapeia vários lemas)
  const byStrongs = await lemmaIdsByStrongs(client);

  const entries: LexiconEntryBuild[] = JSON.parse(readFileSync(path, 'utf8'));
  const rows: Row[] = [];
  let noLemma = 0;
  for (const e of entries) {
    const ids = byStrongs.get(e.strongs);
    if (!ids) { noLemma++; continue; }
    for (const lemma_id of ids) {
      rows.push({ lemma_id, source: e.source, text_en: e.text_en, sort_order: e.sort_order });
    }
  }

  console.log(`\nlexicon_entries a aplicar: ${rows.length} (de ${entries.length} entradas LSJ; sem lema no NT: ${noLemma})`);

  // upsert em lotes por (lemma_id, source) — idempotente
  const SIZE = 500;
  let applied = 0;
  for (let i = 0; i < rows.length; i += SIZE) {
    const batch = rows.slice(i, i + SIZE);
    const { error } = await (client.from('lexicon_entries') as any)
      .upsert(batch, { onConflict: 'lemma_id,source' });
    if (error) throw new Error(`upsert lexicon_entries @${i}: ${error.message}`);
    applied += batch.length;
    process.stdout.write(`\r  aplicados: ${applied}/${rows.length}`);
  }
  process.stdout.write('\n');
  console.log('LSJ carregado em public.lexicon_entries.');
}

async function main(): Promise<void> {
  const step = arg('step');
  if (step === 'download') return void (await download());
  if (step === 'build') return build();
  if (step === 'download-macula') return void (await downloadMacula());
  if (step === 'build-macula') return buildMacula();
  if (step === 'download-stepbible') return void (await downloadStepbible());
  if (step === 'build-lexicons') return buildLexicons();
  if (step === 'reload-macula') return void (await reloadMacula(BUILD, process.argv.includes('--confirm')));
  if (step === 'translate') return void (await translate(BUILD));
  if (step === 'translate-lexicon') return void (await translateLexicon(BUILD, Number(arg('limit') ?? 0)));
  if (step === 'translate-lsj') return void (await translateLexiconEntries(BUILD, Number(arg('limit') ?? 0)));
  if (step === 'derive-gloss') return void (await deriveGloss(BUILD, Number(arg('limit') ?? 0)));
  if (step === 'localize-refs') return void (await localizeRefs(BUILD));
  if (step === 'load') return void (await load());
  if (step === 'lexicon') return void (await lexicon());
  if (step === 'load-lexicons') return void (await loadLexicons());
  if (step === 'backfill-greek') return void (await backfillGreek());
  if (step === 'ingest-version') return void (await ingestFreeVersions(arg('code')));
  if (step === 'ingest-version-file') return void (await ingestVersionFromFile(arg('file')));
  if (step === 'convert-usfm') return convertUsfm();
  if (step === 'convert-bible-json') return convertBibleJson();
  // padrão: download + build
  await download();
  build();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
}
