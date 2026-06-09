/**
 * Leitura do progresso dos planos do usuário autenticado (RLS own_reading_progress).
 * server-only. O catálogo de planos é estático (lib/reading-plans.ts); aqui só os
 * dias concluídos por usuário.
 */
import 'server-only';
import { createClient } from './supabase/server';

/** Conjunto de dias concluídos de um plano (vazio se anônimo). */
export async function getCompletedDays(planId: string): Promise<Set<number>> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();

  const { data, error } = await supabase.from('reading_progress').select('day').eq('plan_id', planId);
  if (error || !data) return new Set();
  return new Set((data as { day: number }[]).map((r) => r.day));
}

/** Quantidade de dias concluídos por plano (mapa plan_id → contagem). Vazio se anônimo. */
export async function getPlanProgress(): Promise<Record<string, number>> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const { data, error } = await supabase.from('reading_progress').select('plan_id');
  if (error || !data) return {};
  const out: Record<string, number> = {};
  for (const r of data as { plan_id: string }[]) out[r.plan_id] = (out[r.plan_id] ?? 0) + 1;
  return out;
}
