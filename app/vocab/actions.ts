'use server';

import { createClient } from '@/lib/supabase/server';
import { applyReview, type ReviewGrade, type SrsState } from '@/lib/srs';

export interface ReviewResult {
  ok: boolean;
  error?: string;
  due_at?: string;
}

// Aplica uma nota FSRS a um lemma e persiste o novo estado em srs_cards.
// A RLS (auth.uid() = user_id) isola os cards do usuário; mesmo assim passamos
// user_id explicitamente porque o INSERT exige a coluna NOT NULL.
export async function reviewCard(lemmaId: number, grade: ReviewGrade): Promise<ReviewResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sessão expirada. Entre novamente.' };

  const { data: existing, error: fetchErr } = await supabase
    .from('srs_cards')
    .select('stability,difficulty,due_at,state,reps,lapses,last_review')
    .eq('lemma_id', lemmaId)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };

  const current = (existing as SrsState | null) ?? null;
  const next = applyReview(current, grade);

  const { error: upsertErr } = await supabase.from('srs_cards').upsert(
    {
      user_id: user.id,
      lemma_id: lemmaId,
      stability: next.stability,
      difficulty: next.difficulty,
      due_at: next.due_at,
      state: next.state,
      reps: next.reps,
      lapses: next.lapses,
      last_review: next.last_review,
    },
    { onConflict: 'user_id,lemma_id' },
  );
  if (upsertErr) return { ok: false, error: upsertErr.message };

  return { ok: true, due_at: next.due_at };
}
