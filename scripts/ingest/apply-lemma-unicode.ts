/**
 * Aplica os lemas em Unicode (data/build/lemmas.json) na coluna public.lemmas.lemma
 * do Supabase, casando por `id`. Atualiza SOMENTE a coluna `lemma` — gloss_pt,
 * gloss_en, frequency e demais campos ficam intactos.
 *
 * Corrige o lema legado em beta-code do Dodson (ex.: "bi/blos, ou, h(") para a
 * forma de dicionário em Unicode (ex.: "βίβλος"), agora que parseLemmas() extrai
 * o lema do dodson.xml. Idempotente: rodar de novo não muda nada.
 *
 *   npx tsx scripts/ingest/apply-lemma-unicode.ts
 */

import 'dotenv/config';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

interface LemmaRow {
  id: number;
  lemma: string;
}

const UPDATE_CONCURRENCY = 8;

async function pMap<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const cur = items[i++];
      if (cur !== undefined) await worker(cur);
    }
  });
  await Promise.all(runners);
}

async function main(): Promise<void> {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const srcPath = join(root, 'data', 'build', 'lemmas.json');
  if (!existsSync(srcPath)) throw new Error('rode `npm run ingest:build` primeiro');

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');

  const lemmas: LemmaRow[] = JSON.parse(readFileSync(srcPath, 'utf8'));
  const client = createClient(url, key, { auth: { persistSession: false } });

  let applied = 0;
  await pMap(lemmas, UPDATE_CONCURRENCY, async (l) => {
    const { error } = await (client.from('lemmas') as any).update({ lemma: l.lemma }).eq('id', l.id);
    if (error) throw new Error(`update lemma ${l.id}: ${error.message}`);
    if (++applied % 200 === 0) process.stdout.write(`\r  aplicados: ${applied}/${lemmas.length}`);
  });
  process.stdout.write(`\r  aplicados: ${applied}/${lemmas.length}\n`);
  console.log('lemas Unicode aplicados ao Supabase.');
}

main().catch((e) => { console.error(e); process.exit(1); });
