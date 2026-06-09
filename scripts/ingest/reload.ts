/**
 * Reload do corpus para o build MACULA/SBLGNT.
 *
 * Operação DESTRUTIVA sobre o corpus. Por isso:
 *   - dry-run por padrão: sem `--confirm` apenas relata o que faria e NÃO escreve;
 *   - com `--confirm`: executa o reload completo dentro da janela mínima possível.
 *
 * Pré-requisitos:
 *   1. Migration `20260529140000_pivot_sblgnt_lexicon_entries.sql` aplicada
 *      (quiz_attempts.token_id nullable + ON DELETE SET NULL); sem ela o DELETE
 *      dos tokens falha caso existam quiz_attempts.
 *   2. Build MACULA presente em data/build/*.json (rode ingest:build-macula).
 *   3. SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY no .env (service role bypassa RLS).
 *
 * Nota: a antiga "ponte SRS" (snapshot/remap de srs_cards entre rebuilds) foi
 * removida junto com o modo Vocabulário — não há mais dados de usuário acoplados
 * ao corpus, então o reload é puramente do corpus.
 */

import 'dotenv/config';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { insertBatched, deleteAll } from './supabase-io.ts';

type Row = Record<string, unknown>;

function client(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
  return createClient(url, key, { auth: { persistSession: false } });
}

function readBuild(buildDir: string, file: string): Row[] {
  const path = join(buildDir, file);
  if (!existsSync(path)) throw new Error(`build ausente: ${file} (rode ingest:build-macula)`);
  return JSON.parse(readFileSync(path, 'utf8')) as Row[];
}

export async function reloadMacula(buildDir: string, confirm: boolean): Promise<void> {
  const db = client();

  const newLemmas = readBuild(buildDir, 'lemmas.json');

  console.log(`\n── reload MACULA/SBLGNT — ${confirm ? 'EXECUÇÃO' : 'DRY-RUN'} ──`);
  console.log(
    `build novo: ${newLemmas.length} lemas, ${readBuild(buildDir, 'tokens.json').length} tokens, ${readBuild(buildDir, 'verses.json').length} versículos`,
  );

  if (!confirm) {
    console.log('\nDRY-RUN: nada foi escrito. Reexecute com `--confirm` para aplicar o reload.');
    return;
  }

  // ── EXECUÇÃO ────────────────────────────────────────────────────────
  // ordem de FK: tokens antes de lemmas/verses; books por último.
  // (deletar tokens dispara ON DELETE SET NULL em quiz_attempts, se existir.)
  console.log('\napagando corpus (na ordem de FK)...');
  await deleteAll(db, 'tokens');
  await deleteAll(db, 'verses');
  await deleteAll(db, 'lemmas');
  await deleteAll(db, 'books');

  console.log('inserindo corpus novo...');
  await insertBatched(db, 'books', readBuild(buildDir, 'books.json'), 500);
  await insertBatched(db, 'lemmas', readBuild(buildDir, 'lemmas.json'), 1000);
  await insertBatched(db, 'verses', readBuild(buildDir, 'verses.json'), 1000);
  await insertBatched(db, 'tokens', readBuild(buildDir, 'tokens.json'), 1000);

  console.log('\nreload concluído.');
  console.log("Lembre: invalide o Data Cache do Next (revalidateTag('corpus') ou limpe .next/cache).");
}
