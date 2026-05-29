/**
 * Reload do corpus para o build MACULA/SBLGNT — Fases E (bridge SRS) + F (reload).
 *
 * Operação DESTRUTIVA sobre o corpus e os dados de usuário (srs_cards). Por isso:
 *   - dry-run por padrão: sem `--confirm` apenas relata o que faria (snapshot +
 *     análise de órfãos) e NÃO escreve nada;
 *   - com `--confirm`: executa o reload completo dentro da janela mínima possível.
 *
 * Pré-requisitos:
 *   1. Migration `20260529140000_pivot_sblgnt_lexicon_entries.sql` aplicada
 *      (quiz_attempts.token_id nullable + ON DELETE SET NULL); sem ela o DELETE
 *      dos tokens falha caso existam quiz_attempts.
 *   2. Build MACULA presente em data/build/*.json (rode ingest:build-macula).
 *   3. SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY no .env (service role bypassa RLS).
 *
 * Bridge SRS (chave de negócio estável = Strong's): srs_cards é chaveado por
 * lemma_id (identity volátil entre rebuilds). Snapshotamos cada card com o Strong's
 * (+ lema) do lema antigo ANTES de apagar; após recarregar os lemas, remapeamos
 * Strong's(+lema) -> novo lemma_id e reinserimos os cards preservando o estado FSRS.
 */

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { insertBatched, deleteAll } from './supabase-io.ts';

type Row = Record<string, unknown>;

interface BuildLemma { id: number; lemma: string; strongs: string | null }

// Estado FSRS preservado de um card, já resolvido o Strong's/lema do lema antigo.
interface CardSnapshot {
  user_id: string;
  strongs: string | null;
  lemma: string | null;
  stability: number | null;
  difficulty: number | null;
  due_at: string;
  state: string;
  reps: number;
  lapses: number;
  last_review: string | null;
}

const PAGE = 1000;

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

// ── snapshot srs_cards (com strongs/lema do lema antigo) ────────────────
async function snapshotCards(db: SupabaseClient): Promise<CardSnapshot[]> {
  const out: CardSnapshot[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('srs_cards')
      .select('user_id,stability,difficulty,due_at,state,reps,lapses,last_review,lemmas(strongs,lemma)')
      .order('id')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`snapshot srs_cards: ${error.message}`);
    const rows = (data ?? []) as unknown as Array<
      Omit<CardSnapshot, 'strongs' | 'lemma'> & { lemmas: { strongs: string | null; lemma: string } | { strongs: string | null; lemma: string }[] | null }
    >;
    for (const r of rows) {
      const lex = Array.isArray(r.lemmas) ? r.lemmas[0] : r.lemmas;
      out.push({
        user_id: r.user_id, strongs: lex?.strongs ?? null, lemma: lex?.lemma ?? null,
        stability: r.stability, difficulty: r.difficulty, due_at: r.due_at, state: r.state,
        reps: r.reps, lapses: r.lapses, last_review: r.last_review,
      });
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

// índices de remapeamento a partir do build novo
function buildLemmaIndex(lemmas: BuildLemma[]): {
  byPair: Map<string, number>; byStrongs: Map<string, number>;
} {
  const byPair = new Map<string, number>(); // `${strongs}|${lemma}` -> id (match exato)
  const byStrongs = new Map<string, number>(); // strongs -> primeiro id (fallback)
  for (const l of lemmas) {
    if (l.strongs) {
      byPair.set(`${l.strongs}|${l.lemma}`, l.id);
      if (!byStrongs.has(l.strongs)) byStrongs.set(l.strongs, l.id);
    }
  }
  return { byPair, byStrongs };
}

// resolve o novo lemma_id de um card: (strongs,lema) exato -> strongs -> órfão(null)
function resolveLemmaId(
  c: CardSnapshot, idx: { byPair: Map<string, number>; byStrongs: Map<string, number> },
): number | null {
  if (!c.strongs) return null;
  const exact = c.lemma ? idx.byPair.get(`${c.strongs}|${c.lemma}`) : undefined;
  if (exact != null) return exact;
  return idx.byStrongs.get(c.strongs) ?? null;
}

export async function reloadMacula(buildDir: string, confirm: boolean): Promise<void> {
  const db = client();

  // build novo + índice de remapeamento
  const newLemmas = readBuild(buildDir, 'lemmas.json') as unknown as BuildLemma[];
  const idx = buildLemmaIndex(newLemmas);

  // snapshot + análise de órfãos (sempre, mesmo em dry-run)
  const cards = await snapshotCards(db);
  let resolvable = 0; const orphans: CardSnapshot[] = [];
  for (const c of cards) (resolveLemmaId(c, idx) != null ? resolvable++ : orphans.push(c));

  console.log(`\n── reload MACULA/SBLGNT — ${confirm ? 'EXECUÇÃO' : 'DRY-RUN'} ──`);
  console.log(`build novo: ${newLemmas.length} lemas, ${readBuild(buildDir, 'tokens.json').length} tokens, ${readBuild(buildDir, 'verses.json').length} versículos`);
  console.log(`srs_cards atuais: ${cards.length}  (remapeáveis por Strong's: ${resolvable}, órfãos: ${orphans.length})`);
  if (orphans.length > 0) {
    console.log('órfãos (lema não presente no SBLGNT — serão descartados, log abaixo):');
    for (const o of orphans.slice(0, 50)) console.log(`  - ${o.lemma ?? '?'} (${o.strongs ?? 'sem strongs'}) user=${o.user_id}`);
    if (orphans.length > 50) console.log(`  … +${orphans.length - 50} órfãos`);
  }

  if (!confirm) {
    console.log('\nDRY-RUN: nada foi escrito. Reexecute com `--confirm` para aplicar o reload.');
    return;
  }

  // ── EXECUÇÃO ────────────────────────────────────────────────────────
  // Rede de segurança: o estado FSRS (dado de usuário mais valioso) só existe
  // em memória entre o delete e o re-insert. Persiste em disco ANTES de qualquer
  // delete — se o processo cair no meio, o snapshot permite recuperação manual.
  const snapshotPath = join(buildDir, 'srs-snapshot.json');
  writeFileSync(snapshotPath, JSON.stringify(cards), 'utf8');
  console.log(`\nsnapshot de srs_cards salvo em ${snapshotPath} (${cards.length} cards) — recuperável se o reload falhar.`);

  // ordem de FK: srs_cards e tokens antes de lemmas/verses; books por último.
  // (deletar tokens dispara ON DELETE SET NULL em quiz_attempts — log preservado.)
  console.log('\napagando corpus + cards (na ordem de FK)...');
  await deleteAll(db, 'srs_cards');
  await deleteAll(db, 'tokens');
  await deleteAll(db, 'verses');
  await deleteAll(db, 'lemmas');
  await deleteAll(db, 'books');

  console.log('inserindo corpus novo...');
  await insertBatched(db, 'books', readBuild(buildDir, 'books.json'), 500);
  await insertBatched(db, 'lemmas', readBuild(buildDir, 'lemmas.json'), 1000);
  await insertBatched(db, 'verses', readBuild(buildDir, 'verses.json'), 1000);
  await insertBatched(db, 'tokens', readBuild(buildDir, 'tokens.json'), 1000);

  // rebuild srs_cards remapeados. unique(user_id, lemma_id): se dois lemas antigos
  // colapsarem no mesmo novo lemma_id, mantemos o de menor due_at (mais urgente).
  const rebuilt = new Map<string, Row>(); // `${user_id}|${lemma_id}` -> row
  for (const c of cards) {
    const lemma_id = resolveLemmaId(c, idx);
    if (lemma_id == null) continue; // órfão (já logado)
    const key = `${c.user_id}|${lemma_id}`;
    const row: Row = {
      user_id: c.user_id, lemma_id, stability: c.stability, difficulty: c.difficulty,
      due_at: c.due_at, state: c.state, reps: c.reps, lapses: c.lapses, last_review: c.last_review,
    };
    // compara como instante (Date.parse), não lexicograficamente — robusto a
    // variações de formato ISO (offset, milissegundos, Z vs +00:00).
    const prev = rebuilt.get(key) as { due_at: string } | undefined;
    if (!prev || Date.parse(c.due_at) < Date.parse(prev.due_at)) rebuilt.set(key, row);
  }
  const cardRows = [...rebuilt.values()];
  if (cardRows.length > 0) {
    console.log('reinserindo srs_cards remapeados...');
    await insertBatched(db, 'srs_cards', cardRows, 500);
  }

  console.log(`\nreload concluído. srs_cards: ${cards.length} -> ${cardRows.length} (órfãos descartados: ${orphans.length}).`);
  console.log('Lembre: invalide o Data Cache do Next (revalidateTag(\'corpus\') ou limpe .next/cache).');
}
