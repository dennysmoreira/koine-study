'use server';

/**
 * Server Actions dos planos de leitura: marcar/desmarcar um dia como concluído.
 * RLS (own_reading_progress) isola por auth.uid().
 */
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getPlan } from '@/lib/reading-plans';

export async function toggleReadingDay(
  planId: string,
  day: number,
  done: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const plan = getPlan(planId);
  if (!plan) return { ok: false, error: 'Plano inválido.' };
  if (!Number.isInteger(day) || day < 1 || day > plan.days.length) {
    return { ok: false, error: 'Dia inválido.' };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login para acompanhar o plano.' };

  if (done) {
    // ignoreDuplicates: unique(user_id, plan_id, day) torna o marcar idempotente.
    const { error } = await supabase
      .from('reading_progress')
      .upsert({ user_id: user.id, plan_id: planId, day }, { onConflict: 'user_id,plan_id,day', ignoreDuplicates: true });
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from('reading_progress')
      .delete()
      .eq('plan_id', planId)
      .eq('day', day);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath('/reading');
  revalidatePath(`/reading/${planId}`);
  return { ok: true };
}
