/**
 * Parser MACULA Greek (lowfat) — build do corpus crítico SBLGNT.
 *
 * Fonte: Clear-Bible/macula-greek (CC BY 4.0). O diretório `SBLGNT/lowfat/`
 * traz 1 XML por livro do NT, com cada palavra num elemento <w> já anotado:
 *   ref="JHN 1:1!1"  -> livro (USFM) + capítulo:versículo!posição
 *   lemma="ἐν"        -> forma de dicionário acentuada (ponte p/ LSJ/Moulton-Milligan)
 *   strong="1722"     -> número de Strong's (ponte p/ Dodson/Abbott-Smith/Thayer's)
 *   normalized="Ἐν"   -> forma normalizada
 *   unicode="Ἐν"      -> superfície flexionada (= conteúdo do elemento)
 *   morph="PREP"      -> código morfológico (Robinson/Tauber, decodificado por decodeMorph)
 *
 * Em relação ao build legado (byztxt) este texto é crítico/eclético, acentuado e
 * carrega Strong's + lema no mesmo token (chaveamento duplo). Reusamos decodeMorph
 * para manter o MESMO vocabulário morfológico do corpus existente, e as glosas do
 * Dodson + a exegese do Abbott-Smith continuam chaveadas por Strong's.
 *
 * Sem dependência de parser XML (mesma abordagem regex do Abbott-Smith/Dodson):
 * o lowfat é regular o bastante para extrair atributos de <w> com segurança.
 *
 * Fase B do ADR-001: build + relatório apenas. NÃO escreve no banco — o load
 * (Fase F) é separado, para permitir inspeção das contagens antes de recarregar.
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { decodeMorph } from './morph-decoder.ts';
import { BOOKS, normalizeStrongs, type BookMeta } from './books.ts';
import { parseDodson } from './dodson.ts';
import { parseAbbottSmith } from './abbott-smith.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCES = join(ROOT, 'data', 'sources');
const BUILD = join(ROOT, 'data', 'build');
const MACULA_DIR = join(SOURCES, 'macula', 'lowfat');
const DODSON_CSV = join(SOURCES, 'dodson', 'dodson.csv');
const DODSON_XML = join(SOURCES, 'dodson', 'dodson.xml');
const ABBOTT_XML = join(SOURCES, 'abbott-smith', 'abbott-smith.tei.xml');

const RAW_BASE = 'https://raw.githubusercontent.com/Clear-Bible/macula-greek/main/SBLGNT/lowfat';

// Arquivos lowfat em ordem canônica (1 = Mateus … 27 = Apocalipse).
const LOWFAT_FILES = [
  '01-matthew', '02-mark', '03-luke', '04-john', '05-acts', '06-romans',
  '07-1corinthians', '08-2corinthians', '09-galatians', '10-ephesians',
  '11-philippians', '12-colossians', '13-1thessalonians', '14-2thessalonians',
  '15-1timothy', '16-2timothy', '17-titus', '18-philemon', '19-hebrews',
  '20-james', '21-1peter', '22-2peter', '23-1john', '24-2john', '25-3john',
  '26-jude', '27-revelation',
] as const;

// Códigos de livro USFM usados no atributo `ref` do MACULA, em ordem canônica.
// Diferem dos códigos byztxt (BookMeta.code): MRK≠MAR, JHN≠JOH, JAS≠JAM, 1JN≠1JO…
const MACULA_USFM = [
  'MAT', 'MRK', 'LUK', 'JHN', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHP',
  'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAS', '1PE', '2PE',
  '1JN', '2JN', '3JN', 'JUD', 'REV',
] as const;

const BOOK_BY_USFM = new Map<string, BookMeta>(
  MACULA_USFM.map((code, i) => [code, BOOKS[i]!]),
);

// ── Tipos do modelo construído (mesma forma esperada por load() em index.ts) ──
interface Lemma {
  id: number; lemma: string; strongs: string | null; gk_number: string | null;
  pos: string | null; gloss_en: string | null; gloss_long_en: string | null;
  frequency: number; abbott_smith: string | null;
}
interface Verse { id: number; book_id: number; chapter: number; verse: number; ref: string }
interface Token {
  verse_id: number; position: number; surface: string; normalized: string | null;
  lemma_id: number | null; strongs: string | null; morph_code: string | null;
  m_pos: string | null; m_tense: string | null; m_voice: string | null; m_mood: string | null;
  m_case: string | null; m_number: string | null; m_gender: string | null; m_person: string | null;
}

// ── helpers ─────────────────────────────────────────────────────────────
const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
};
function decodeEntities(s: string): string {
  return s.replace(/&(?:amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m] ?? m);
}

// Remove diacríticos (NFD -> tira combining marks -> NFC) e baixa caixa: a coluna
// tokens.normalized serve para busca insensível a acento/capitalização.
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC').toLowerCase();
}

// Atributos de um <w>: chave="valor" (valores sem aspas internas no lowfat).
function parseAttrs(openTag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([\w:.-]+)="([^"]*)"/g;
  for (let m = re.exec(openTag); m !== null; m = re.exec(openTag)) {
    out[m[1]!] = decodeEntities(m[2]!);
  }
  return out;
}

// ── download: garante os 27 lowfat XML em data/sources/macula/lowfat ──────
export async function downloadMacula(): Promise<void> {
  mkdirSync(MACULA_DIR, { recursive: true });
  let fetched = 0;
  for (const name of LOWFAT_FILES) {
    const dest = join(MACULA_DIR, `${name}.xml`);
    if (existsSync(dest)) continue;
    const res = await fetch(`${RAW_BASE}/${name}.xml`);
    if (!res.ok) throw new Error(`falha ao baixar ${name}.xml (HTTP ${res.status})`);
    writeFileSync(dest, await res.text(), 'utf8');
    fetched++;
    process.stdout.write(`\r  baixados: ${fetched}`);
  }
  if (fetched > 0) process.stdout.write('\n');
  console.log(fetched === 0 ? 'MACULA lowfat já presente em data/sources/macula/lowfat/' : `MACULA lowfat: ${fetched} arquivos baixados.`);
}

// ── build: lowfat XML -> books/verses/tokens/lemmas -> data/build/*.json ──
const W_RE = /<w\b([^>]*?)(?:\/>|>([\s\S]*?)<\/w>)/g;
const REF_RE = /^(\S+)\s+(\d+):(\d+)/;

export function buildMacula(): void {
  if (!existsSync(MACULA_DIR)) {
    throw new Error('rode `npm run ingest:download-macula` primeiro (data/sources/macula ausente)');
  }
  mkdirSync(BUILD, { recursive: true });

  // Léxicos chaveados por Strong's (independem do corpus): glosas Dodson + exegese
  // Abbott-Smith. Anexados a cada lema novo conforme aparece no texto.
  const dodson = parseDodson(DODSON_CSV, DODSON_XML);
  const abbott = parseAbbottSmith(ABBOTT_XML);

  const verses: Verse[] = [];
  const tokens: Token[] = [];
  const versesByKey = new Map<string, Verse>();
  const lemmasByKey = new Map<string, Lemma>(); // chave: `${strongs}|${lemma}`
  const posByVerse = new Map<number, number>(); // verseId -> última posição usada
  let verseId = 0;
  let lemmaId = 0;
  let noLemma = 0;
  let noStrong = 0;
  let unparsedMorph = 0;

  for (const name of LOWFAT_FILES) {
    const file = join(MACULA_DIR, `${name}.xml`);
    if (!existsSync(file)) { console.warn(`AVISO: arquivo ausente ${name}.xml`); continue; }
    const xml = readFileSync(file, 'utf8');

    for (let m = W_RE.exec(xml); m !== null; m = W_RE.exec(xml)) {
      const a = parseAttrs(m[1]!);
      const ref = a.ref;
      if (!ref) continue; // <w> sem ref (não deveria ocorrer no lowfat) — ignora
      const rm = REF_RE.exec(ref);
      if (!rm) continue;
      const book = BOOK_BY_USFM.get(rm[1]!);
      if (!book) { continue; } // livro fora do NT (não ocorre no SBLGNT) — ignora
      const chapter = Number(rm[2]);
      const verse = Number(rm[3]);

      const vKey = `${book.id}|${chapter}|${verse}`;
      let v = versesByKey.get(vKey);
      if (!v) {
        v = { id: ++verseId, book_id: book.id, chapter, verse, ref: `${book.osis} ${chapter}:${verse}` };
        versesByKey.set(vKey, v);
        verses.push(v);
      }

      const surface = (a.unicode ?? m[2] ?? '').trim();
      if (!surface) continue;
      const strongs = normalizeStrongs(a.strong);
      const lemmaText = (a.lemma ?? '').trim();
      const morph = (a.morph ?? '').trim();
      const f = morph ? decodeMorph(morph) : null;
      if (f?.unparsed) unparsedMorph++;
      if (!strongs) noStrong++;

      // identidade do lema = (strongs, lema) — alinha com a unique(lemma, strongs)
      // do schema e preserva o chaveamento duplo do MACULA.
      let lemmaRef: Lemma | null = null;
      if (lemmaText) {
        const lKey = `${strongs ?? ''}|${lemmaText}`;
        lemmaRef = lemmasByKey.get(lKey) ?? null;
        if (!lemmaRef) {
          const d = strongs ? dodson.get(strongs) : undefined;
          lemmaRef = {
            id: ++lemmaId,
            lemma: lemmaText,
            strongs,
            gk_number: d?.gk_number ?? null,
            pos: f?.pos ?? null,
            gloss_en: d?.gloss_en ?? null,
            gloss_long_en: d?.gloss_long_en ?? null,
            frequency: 0,
            abbott_smith: strongs ? (abbott.get(strongs) ?? null) : null,
          };
          lemmasByKey.set(lKey, lemmaRef);
        }
        lemmaRef.frequency++;
      } else {
        noLemma++;
      }

      const position = (posByVerse.get(v.id) ?? 0) + 1;
      posByVerse.set(v.id, position);
      tokens.push({
        verse_id: v.id, position, surface, normalized: stripAccents(surface),
        lemma_id: lemmaRef?.id ?? null, strongs, morph_code: morph || null,
        m_pos: f?.pos ?? null, m_tense: f?.tense ?? null, m_voice: f?.voice ?? null, m_mood: f?.mood ?? null,
        m_case: f?.case ?? null, m_number: f?.number ?? null, m_gender: f?.gender ?? null, m_person: f?.person ?? null,
      });
    }
  }

  const lemmas = [...lemmasByKey.values()];
  const books = BOOKS.map((b) => ({
    id: b.id, osis_code: b.osis, name_pt: b.name_pt, name_grc: null, testament: 'NT', sort_order: b.sort_order,
  }));

  // guarda contra build vazio (ex.: downloads falharam mas o diretório existe):
  // evita gravar JSON vazio e um NaN% no relatório.
  if (tokens.length === 0) {
    throw new Error('nenhum token parseado — verifique os XML em data/sources/macula (rode ingest:download-macula).');
  }

  writeFileSync(join(BUILD, 'books.json'), JSON.stringify(books));
  writeFileSync(join(BUILD, 'lemmas.json'), JSON.stringify(lemmas));
  writeFileSync(join(BUILD, 'verses.json'), JSON.stringify(verses));
  writeFileSync(join(BUILD, 'tokens.json'), JSON.stringify(tokens));

  const linked = tokens.filter((t) => t.lemma_id !== null).length;
  const abbottLinked = lemmas.filter((l) => l.abbott_smith).length;
  const dodsonLinked = lemmas.filter((l) => l.gloss_en).length;
  const top = [...lemmas].sort((a, b) => b.frequency - a.frequency).slice(0, 5)
    .map((l) => `${l.lemma}(${l.strongs})=${l.frequency}`).join(', ');

  console.log(`\n── build MACULA/SBLGNT concluído (data/build/) ──`);
  console.log(`livros:     ${books.length}`);
  console.log(`versículos: ${verses.length}`);
  console.log(`tokens:     ${tokens.length}  (com lema: ${linked}, ${((linked / tokens.length) * 100).toFixed(1)}%)`);
  console.log(`lemmas:     ${lemmas.length}`);
  console.log(`  dodson (gloss_en):    ${dodsonLinked}/${lemmas.length}`);
  console.log(`  abbott-smith:         ${abbottLinked}/${lemmas.length}`);
  console.log(`top-5 frequência: ${top}`);
  if (noStrong > 0) console.log(`nota: ${noStrong} tokens sem Strong's (chave caem só no lema)`);
  if (noLemma > 0) console.log(`nota: ${noLemma} tokens sem lema (lemma_id null)`);
  if (unparsedMorph > 0) console.log(`nota: ${unparsedMorph} tokens com morph não reconhecido por decodeMorph`);
}

async function main(): Promise<void> {
  const step = process.argv.find((a) => a.startsWith('--step='))?.split('=')[1];
  if (step === 'download') return void (await downloadMacula());
  if (step === 'build') return buildMacula();
  // padrão: download + build
  await downloadMacula();
  buildMacula();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
}
