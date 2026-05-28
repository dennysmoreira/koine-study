'use server';

import { createClient } from '@/lib/supabase/server';
import { getParsingQuestion, type ParsingQuestion } from '@/lib/parsing';
import { DIMENSION_COLUMN, MORPH_LABELS, type MorphDimension } from '@/lib/morph-labels';

export interface AnswerResult {
  ok: boolean;
  error?: string;
  correct?: boolean;
  correctValue?: string;
  correctLabel?: string;
}

// Valida a resposta server-side (relê m_<dim> do token) e registra a tentativa
// em quiz_attempts sob RLS (auth.uid() = user_id). Nunca confia no cliente para
// dizer se acertou.
export async function submitAnswer(
  tokenId: number,
  dimension: MorphDimension,
  chosen: string,
): Promise<AnswerResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sessão expirada. Entre novamente.' };

  const col = DIMENSION_COLUMN[dimension];
  if (!col) return { ok: false, error: 'Dimensão inválida.' };

  const { data: tok, error: tokErr } = await supabase
    .from('tokens')
    .select(col)
    .eq('id', tokenId)
    .single();
  if (tokErr) return { ok: false, error: tokErr.message };

  const actual = (tok as unknown as Record<string, string | null>)[col];
  const correct = actual === chosen;

  const { error: insErr } = await supabase.from('quiz_attempts').insert({
    user_id: user.id,
    token_id: tokenId,
    question_type: `identify_${dimension}`,
    correct,
  });
  if (insErr) return { ok: false, error: insErr.message };

  return {
    ok: true,
    correct,
    correctValue: actual ?? undefined,
    correctLabel: actual ? MORPH_LABELS[dimension][actual] ?? actual : undefined,
  };
}

export async function nextQuestion(): Promise<ParsingQuestion> {
  return getParsingQuestion();
}
