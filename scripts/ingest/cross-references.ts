/**
 * Ingestão das referências cruzadas (Treasury of Scripture Knowledge, openbible.info).
 *
 * Fonte: https://a.openbible.info/data/cross-references.zip → cross_references.txt
 * (CC-BY). Baixe e extraia para data/sources/cross_references.txt antes de rodar:
 *   curl -s -o data/sources/cross-references.zip https://a.openbible.info/data/cross-references.zip
 *   (cd data/source && unzip -o cross-references.zip)
 *
 * Uso: npx tsx scripts/ingest/cross-references.ts
 *
 * Formato (TSV): "From Verse \t To Verse \t Votes". From é sempre um versículo
 * único (ex.: Gen.1.1); To pode ser uma faixa (ex.: Prov.8.22-Prov.8.30). As
 * abreviações são OSIS (= books.osis_code). Versificação protestante (= eixo de
 * display do app), então grava direto, sem remapeamento.
 *
 * Idempotente: limpa cross_references e recarrega. Filtra refs cujos livros (origem
 * ou destino) não existem no nosso corpus.
 */

import 'dotenv/config';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { insertBatched, deleteAll } from './supabase-io.ts';

type Row = Record<string, unknown>;
interface Ref { osis: string; chapter: number; verse: number }

function client(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  return createClient(url, key, { auth: { persistSession: false } });
}

// "Gen.1.1" → { osis: 'Gen', chapter: 1, verse: 1 }. null se malformado.
function parseRef(s: string): Ref | null {
  const i = s.lastIndexOf('.');
  if (i < 0) return null;
  const j = s.lastIndexOf('.', i - 1);
  if (j < 0) return null;
  const osis = s.slice(0, j);
  const chapter = Number(s.slice(j + 1, i));
  const verse = Number(s.slice(i + 1));
  if (!osis || !Number.isInteger(chapter) || !Number.isInteger(verse)) return null;
  return { osis, chapter, verse };
}

async function validOsisSet(db: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await db.from('books').select('osis_code');
  if (error) throw new Error(`ler books: ${error.message}`);
  return new Set((data ?? []).map((b: { osis_code: string }) => b.osis_code));
}

async function main(): Promise<void> {
  const root = join(process.cwd());
  const path = join(root, 'data', 'sources', 'cross_references.txt');
  if (!existsSync(path)) {
    throw new Error(`fonte ausente: ${path}\nBaixe: curl -s -o data/sources/cross-references.zip https://a.openbible.info/data/cross-references.zip && (cd data/source && unzip -o cross-references.zip)`);
  }

  const db = client();
  const valid = await validOsisSet(db);
  console.log(`livros no corpus: ${valid.size}`);

  const lines = readFileSync(path, 'utf8').split('\n');
  const rows: Row[] = [];
  let skipped = 0;
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('From Verse')) continue; // cabeçalho / vazio
    const [fromStr, toStr, votesStr] = t.split('\t');
    if (!fromStr || !toStr) continue;

    const from = parseRef(fromStr);
    if (!from || !valid.has(from.osis)) { skipped++; continue; }

    // To pode ser faixa "A-B"; pega início e fim.
    const dash = toStr.indexOf('-');
    const startRef = parseRef(dash === -1 ? toStr : toStr.slice(0, dash));
    const endRef = dash === -1 ? startRef : parseRef(toStr.slice(dash + 1));
    if (!startRef || !valid.has(startRef.osis)) { skipped++; continue; }

    // Faixa dentro do mesmo livro/capítulo → usa o verso final; cruzando
    // capítulo/livro (raro no TSK), reduz ao verso inicial.
    const sameLoc = endRef && endRef.osis === startRef.osis && endRef.chapter === startRef.chapter;
    rows.push({
      from_osis: from.osis,
      from_chapter: from.chapter,
      from_verse: from.verse,
      to_osis: startRef.osis,
      to_chapter: startRef.chapter,
      to_verse_start: startRef.verse,
      to_verse_end: sameLoc ? endRef!.verse : startRef.verse,
      votes: Number.isFinite(Number(votesStr)) ? Number(votesStr) : 0,
    });
  }

  console.log(`refs a inserir: ${rows.length}  (descartadas por livro/parse: ${skipped})`);
  console.log('limpando cross_references...');
  await deleteAll(db, 'cross_references');
  console.log('inserindo...');
  await insertBatched(db, 'cross_references', rows, 1000);
  console.log('\nconcluído. Lembre: revalidateTag(\'corpus\') ou limpe .next/cache.');
}

main().catch((e) => {
  console.error('ERRO:', e instanceof Error ? e.message : e);
  process.exit(1);
});
