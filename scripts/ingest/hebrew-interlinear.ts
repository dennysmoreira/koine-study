/**
 * Ingestão do INTERLINEAR hebraico do AT — morfologia OSHM por palavra/morfema.
 *
 * Fonte: openscriptures/morphhb (OSIS XML, CC BY 4.0), diretório `wlc/`. Cada
 * <w> traz `lemma` e `morph` com morfemas separados por "/" (prefixos como
 * ו/ה/ב, a raiz e sufixos). Diferente do texto corrido (hebrew-wlc.ts, que só
 * carrega `verse_texts`), aqui preservamos a ESTRUTURA: uma linha por palavra em
 * `hebrew_words`, com os morfemas num array JSONB.
 *
 * Cada morfema: { s: superfície, l: lema cru, g: strongs|null, m: código OSHM }
 *   - s: o grafema do morfema (a superfície da palavra é dividida pelos mesmos "/")
 *   - l: o pedaço do atributo `lemma` (ex.: "b", "7225", "1254 a")
 *   - g: Strong's "H####" quando o lema é numérico; null para prefixos (ו/ה/...)
 *   - m: código OSHM já com prefixo de língua (H/A), self-decodável no cliente
 *
 * Idempotente: upsert por (book_id, chapter, verse, position).
 */

import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { OT_BOOKS } from './ot-books.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WLC_DIR = join(ROOT, 'data', 'sources', 'morphhb', 'wlc');

const VERSE_RE = /<verse osisID="([^"]+)">([\s\S]*?)<\/verse>/g;
const WORD_RE = /<w\b([^>]*)>([\s\S]*?)<\/w>/g;
const LEMMA_ATTR_RE = /\blemma="([^"]*)"/;
const MORPH_ATTR_RE = /\bmorph="([^"]*)"/;

interface Morpheme {
  s: string; // superfície do morfema
  l: string; // lema cru (pedaço do atributo lemma)
  g: string | null; // Strong's "H####" | null
  m: string | null; // código OSHM (com prefixo de língua) | null
}

/** Strong's "H####" a partir de um pedaço de lema; null se não houver dígitos. */
function strongsFromLemma(piece: string): string | null {
  const digits = piece.match(/\d+/);
  return digits ? `H${digits[0]}` : null;
}

/** Re-prefixa um código de morfema com a língua, deixando-o self-decodável. */
function withLanguage(code: string, language: 'H' | 'A'): string {
  return `${language}${code}`;
}

/** Constrói os morfemas de uma palavra alinhando lema, morfologia e superfície. */
function buildMorphemes(lemmaAttr: string, morphAttr: string, inner: string): Morpheme[] {
  // língua: prefixo H/A abre a string inteira do morph; "/" separa morfemas.
  let language: 'H' | 'A' = 'H';
  let morphBody = morphAttr;
  if (morphAttr.startsWith('H')) {
    language = 'H';
    morphBody = morphAttr.slice(1);
  } else if (morphAttr.startsWith('A')) {
    language = 'A';
    morphBody = morphAttr.slice(1);
  }

  const lemmaParts = lemmaAttr.split('/');
  const morphParts = morphBody.split('/');
  const surfaceParts = inner.split('/');

  const count = Math.max(lemmaParts.length, morphParts.length, surfaceParts.length, 1);
  const out: Morpheme[] = [];
  for (let i = 0; i < count; i++) {
    const l = (lemmaParts[i] ?? '').trim();
    const code = morphParts[i];
    out.push({
      s: (surfaceParts[i] ?? '').trim(),
      l,
      g: strongsFromLemma(l),
      m: code ? withLanguage(code, language) : null,
    });
  }
  return out;
}

export async function ingestHebrewInterlinear(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  if (!existsSync(WLC_DIR)) {
    throw new Error('WLC ausente — rode `npm run ingest:download-hebrew` primeiro');
  }

  const client = createClient(url, key, { auth: { persistSession: false } });

  const rows: Array<Record<string, unknown>> = [];
  let missingFiles = 0;
  for (const book of OT_BOOKS) {
    const file = join(WLC_DIR, `${book.osis}.xml`);
    if (!existsSync(file)) {
      console.warn(`AVISO: arquivo WLC ausente ${book.osis}.xml`);
      missingFiles++;
      continue;
    }
    const xml = readFileSync(file, 'utf8');
    let words = 0;
    for (const vm of xml.matchAll(VERSE_RE)) {
      const parts = (vm[1] ?? '').split('.');
      if (parts.length !== 3) continue;
      const chapter = Number(parts[1]);
      const verse = Number(parts[2]);
      if (!Number.isInteger(chapter) || !Number.isInteger(verse)) continue;

      const inner = vm[2] ?? '';
      let position = 0;
      for (const wm of inner.matchAll(WORD_RE)) {
        const attrs = wm[1] ?? '';
        // remove markup interno eventual e monta a superfície apontada (sem "/")
        const wordInner = (wm[2] ?? '').replace(/<[^>]+>/g, '');
        const surface = wordInner.replace(/\//g, '').trim();
        if (!surface) continue;
        const lemmaAttr = LEMMA_ATTR_RE.exec(attrs)?.[1] ?? '';
        const morphAttr = MORPH_ATTR_RE.exec(attrs)?.[1] ?? '';
        position++;
        rows.push({
          book_id: book.id,
          chapter,
          verse,
          position,
          surface,
          morphemes: buildMorphemes(lemmaAttr, morphAttr, wordInner),
        });
        words++;
      }
    }
    process.stdout.write(`\r  ${book.osis}: ${words} palavras  (total ${rows.length})        `);
  }
  process.stdout.write('\n');
  if (missingFiles > 0) console.warn(`AVISO: ${missingFiles} livros sem arquivo WLC`);
  if (rows.length === 0) throw new Error('nenhuma palavra hebraica extraída — verifique o WLC');

  const SIZE = 500;
  let applied = 0;
  for (let i = 0; i < rows.length; i += SIZE) {
    const batch = rows.slice(i, i + SIZE);
    const { error } = await client
      .from('hebrew_words')
      .upsert(batch, { onConflict: 'book_id,chapter,verse,position' });
    if (error) throw new Error(`upsert hebrew_words @${i}: ${error.message}`);
    applied += batch.length;
    process.stdout.write(`\r  hebrew_words: ${applied}/${rows.length}`);
  }
  process.stdout.write('\n');
  console.log(`Interlinear hebraico carregado em public.hebrew_words (${applied} palavras do AT).`);
}
