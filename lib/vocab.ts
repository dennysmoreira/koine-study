import { createClient } from './supabase/server';
import type { SrsState, DbState } from './srs';

// Um item da fila de estudo: o léxico (grego + glosa) somado ao estado SRS atual.
// `isNew` distingue palavra inédita (sem srs_card) de revisão agendada.
export interface QueueCard {
  lemma_id: number;
  lemma: string; // forma de dicionário (grego)
  gloss_pt: string | null;
  gloss_en: string | null;
  strongs: string | null;
  frequency: number;
  isNew: boolean;
  srs: SrsState | null; // estado atual (null para palavra inédita)
}

const DUE_LIMIT = 50; // revisões vencidas por sessão
const NEW_LIMIT = 10; // palavras inéditas por sessão

type LemmaCols = {
  lemma: string;
  gloss_pt: string | null;
  gloss_en: string | null;
  strongs: string | null;
  frequency: number;
};

// Monta a fila: primeiro as revisões vencidas (due_at <= agora), depois palavras
// inéditas por frequência decrescente (as mais comuns no NT primeiro). A RLS
// garante que srs_cards já vem filtrado pelo auth.uid() do usuário.
export async function getStudyQueue(): Promise<QueueCard[]> {
  const supabase = createClient();
  const nowIso = new Date().toISOString();

  const { data: dueRows, error: dueErr } = await supabase
    .from('srs_cards')
    .select(
      'lemma_id,stability,difficulty,due_at,state,reps,lapses,last_review,lemmas(lemma,gloss_pt,gloss_en,strongs,frequency)',
    )
    .lte('due_at', nowIso)
    .order('due_at')
    .limit(DUE_LIMIT);
  if (dueErr) throw new Error(`getStudyQueue/due: ${dueErr.message}`);

  type RawDue = {
    lemma_id: number;
    stability: number | null;
    difficulty: number | null;
    due_at: string;
    state: DbState;
    reps: number;
    lapses: number;
    last_review: string | null;
    lemmas: LemmaCols | LemmaCols[] | null;
  };

  const due: QueueCard[] = ((dueRows ?? []) as unknown as RawDue[])
    .map((r): QueueCard | null => {
      const lex = Array.isArray(r.lemmas) ? r.lemmas[0] : r.lemmas;
      if (!lex) return null;
      return {
        lemma_id: r.lemma_id,
        lemma: lex.lemma,
        gloss_pt: lex.gloss_pt,
        gloss_en: lex.gloss_en,
        strongs: lex.strongs,
        frequency: lex.frequency,
        isNew: false,
        srs: {
          stability: r.stability,
          difficulty: r.difficulty,
          due_at: r.due_at,
          state: r.state,
          reps: r.reps,
          lapses: r.lapses,
          last_review: r.last_review,
        },
      };
    })
    .filter((c): c is QueueCard => c !== null);

  // ids já com card (qualquer estado) para não reintroduzi-los como "novos".
  const { data: cardedRows, error: cardedErr } = await supabase
    .from('srs_cards')
    .select('lemma_id');
  if (cardedErr) throw new Error(`getStudyQueue/carded: ${cardedErr.message}`);
  const cardedIds = (cardedRows ?? []).map((r) => (r as { lemma_id: number }).lemma_id);

  let newQuery = supabase
    .from('lemmas')
    .select('id,lemma,gloss_pt,gloss_en,strongs,frequency')
    .order('frequency', { ascending: false })
    .limit(NEW_LIMIT);
  if (cardedIds.length > 0) {
    newQuery = newQuery.not('id', 'in', `(${cardedIds.join(',')})`);
  }
  const { data: newRows, error: newErr } = await newQuery;
  if (newErr) throw new Error(`getStudyQueue/new: ${newErr.message}`);

  type RawLemma = LemmaCols & { id: number };
  const fresh: QueueCard[] = ((newRows ?? []) as RawLemma[]).map((l) => ({
    lemma_id: l.id,
    lemma: l.lemma,
    gloss_pt: l.gloss_pt,
    gloss_en: l.gloss_en,
    strongs: l.strongs,
    frequency: l.frequency,
    isNew: true,
    srs: null,
  }));

  return [...due, ...fresh];
}
