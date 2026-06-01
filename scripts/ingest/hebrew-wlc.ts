/**
 * Ingestão do texto hebraico do AT — Westminster Leningrad Codex (WLC).
 *
 * Fonte: openscriptures/morphhb (OSIS XML, CC BY 4.0), diretório `wlc/`. Cada
 * livro é um arquivo OSIS (ex.: `Gen.xml`) cujo nome casa com o osis_code.
 *
 * MVP (texto corrido): extraímos só o texto hebraico de cada versículo, sem
 * morfologia/lema (interlinear hebraica fica para fase posterior). A coluna
 * "Original" do app renderiza este texto como UMA versão lógica junto do grego
 * do NT — a língua é resolvida por testamento (ver lib/translations.ts).
 *
 * Regras de junção do WLC ao montar o texto corrido:
 *   - <w>…</w>  : palavra. O "/" separa MORFEMAS (prefixos como ו, ה, ב) e é
 *                 removido — não faz parte do texto escrito.
 *   - <seg x-maqqef> ־ : maqaf, junta a palavra anterior à próxima SEM espaços.
 *   - <seg x-sof-pasuq> ׃ : fim de versículo; cola na palavra anterior.
 *   - <seg x-paseq> ׀ : divisor; mantém com espaços.
 *   - demais <seg> (marcadores de seção setumah/petuhah ס/פ): omitidos no texto
 *     de leitura.
 *
 * Idempotente: upsert por (translation_code, ref). Escreve via service_role,
 * contornando a RLS de leitura pública.
 */

import 'dotenv/config';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { OT_BOOKS, HEBREW_TRANSLATION_CODE } from './ot-books.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MORPHHB_DIR = join(ROOT, 'data', 'sources', 'morphhb');
const WLC_DIR = join(MORPHHB_DIR, 'wlc');
const MORPHHB_REPO = 'https://github.com/openscriptures/morphhb.git';

/** Clona o morphhb (raso) se ainda não estiver presente em data/sources/. */
export async function downloadHebrew(): Promise<void> {
  if (existsSync(WLC_DIR)) {
    console.log('morphhb já presente em data/sources/morphhb/wlc/');
    return;
  }
  mkdirSync(dirname(MORPHHB_DIR), { recursive: true });
  console.log('clonando openscriptures/morphhb...');
  execSync(`git clone --depth 1 -q "${MORPHHB_REPO}" "${MORPHHB_DIR}"`, { stdio: 'inherit' });
}

const VERSE_RE = /<verse osisID="([^"]+)">([\s\S]*?)<\/verse>/g;
const PIECE_RE =
  /<w\b[^>]*>([\s\S]*?)<\/w>|<seg\b[^>]*type="([^"]*)"[^>]*>([\s\S]*?)<\/seg>/g;

/** Monta o texto corrido de um versículo a partir do conteúdo interno do <verse>. */
export function verseText(inner: string): string {
  let out = '';
  let glue = false; // true → a próxima palavra cola sem espaço (após maqaf)
  for (const m of inner.matchAll(PIECE_RE)) {
    if (m[1] !== undefined) {
      const word = m[1].replace(/\//g, '').trim();
      if (!word) continue;
      out += out === '' || glue ? word : ` ${word}`;
      glue = false;
    } else {
      const type = m[2] ?? '';
      const seg = (m[3] ?? '').trim();
      if (!seg) continue;
      if (type === 'x-maqqef') {
        out += seg;
        glue = true;
      } else if (type === 'x-sof-pasuq') {
        out += seg;
        glue = false;
      } else if (type === 'x-paseq') {
        out += ` ${seg}`;
        glue = false;
      }
      // demais marcadores de seção: ignorados no texto de leitura
    }
  }
  return out.trim();
}

export async function ingestHebrew(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  if (!existsSync(WLC_DIR)) {
    throw new Error('WLC ausente — rode `npm run ingest:download-hebrew` primeiro');
  }

  const client = createClient(url, key, { auth: { persistSession: false } });

  // garante a versão original hebraica registrada (a migração já faz o seed,
  // mas reexecutar aqui torna o passo autossuficiente).
  const { error: tErr } = await client.from('translations').upsert(
    {
      code: HEBREW_TRANSLATION_CODE,
      name: 'Westminster Leningrad Codex',
      language: 'hbo',
      license: 'CC BY 4.0',
      source_url: 'https://github.com/openscriptures/morphhb',
      text_type: 'critical',
      is_original: true,
      sort_order: 1,
    },
    { onConflict: 'code' },
  );
  if (tErr) throw new Error(`upsert translations[${HEBREW_TRANSLATION_CODE}]: ${tErr.message}`);

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
    let count = 0;
    for (const vm of xml.matchAll(VERSE_RE)) {
      const parts = (vm[1] ?? '').split('.');
      if (parts.length !== 3) continue; // osisID inesperado — pula
      const chapter = Number(parts[1]);
      const verse = Number(parts[2]);
      if (!Number.isInteger(chapter) || !Number.isInteger(verse)) continue;
      const text = verseText(vm[2] ?? '');
      if (!text) continue;
      rows.push({
        translation_code: HEBREW_TRANSLATION_CODE,
        ref: `${book.osis} ${chapter}:${verse}`,
        book_id: book.id,
        chapter,
        verse,
        text,
      });
      count++;
    }
    process.stdout.write(`\r  ${book.osis}: ${count} versículos  (total ${rows.length})   `);
  }
  process.stdout.write('\n');
  if (missingFiles > 0) console.warn(`AVISO: ${missingFiles} livros sem arquivo WLC`);
  if (rows.length === 0) throw new Error('nenhum versículo hebraico extraído — verifique o WLC');

  const SIZE = 500;
  let applied = 0;
  for (let i = 0; i < rows.length; i += SIZE) {
    const batch = rows.slice(i, i + SIZE);
    const { error } = await client
      .from('verse_texts')
      .upsert(batch, { onConflict: 'translation_code,ref' });
    if (error) throw new Error(`upsert verse_texts[${HEBREW_TRANSLATION_CODE}] @${i}: ${error.message}`);
    applied += batch.length;
    process.stdout.write(`\r  verse_texts (${HEBREW_TRANSLATION_CODE}): ${applied}/${rows.length}`);
  }
  process.stdout.write('\n');
  console.log(`WLC carregado em public.verse_texts (${applied} versículos do AT).`);
}
