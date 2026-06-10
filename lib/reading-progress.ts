/**
 * Leitura do progresso dos planos do usuário autenticado (RLS own_reading_progress).
 * server-only. O catálogo de planos é estático (lib/reading-plans.ts); aqui só os
 * dias concluídos por usuário.
 */
import 'server-only';
import { createClient } from './supabase/server';
import { PLANS, type Reading } from './reading-plans';

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

export interface TodayReading {
  planId: string;
  planTitle: string;
  /** próximo dia (1-based) ainda não concluído. */
  day: number;
  totalDays: number;
  doneDays: number;
  readings: Reading[];
}

/**
 * "Leitura de hoje": o próximo dia não concluído do plano ATIVO do usuário —
 * ativo = o plano com a marcação mais recente que ainda não terminou. Null se
 * anônimo, sem progresso em nenhum plano, ou com todos os planos iniciados
 * já concluídos (a home então não mostra o cartão).
 */
export async function getTodayReading(): Promise<TodayReading | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('reading_progress')
    .select('plan_id, day, completed_at')
    .order('completed_at', { ascending: false });
  if (error || !data || data.length === 0) return null;

  const rows = data as { plan_id: string; day: number }[];
  const doneByPlan = new Map<string, Set<number>>();
  const recencyOrder: string[] = [];
  for (const r of rows) {
    if (!doneByPlan.has(r.plan_id)) {
      doneByPlan.set(r.plan_id, new Set());
      recencyOrder.push(r.plan_id); // rows já vêm do mais recente ao mais antigo
    }
    doneByPlan.get(r.plan_id)!.add(r.day);
  }

  for (const planId of recencyOrder) {
    const plan = PLANS.find((p) => p.id === planId);
    if (!plan) continue; // plano removido do catálogo
    const done = doneByPlan.get(planId)!;
    // próximo dia = o primeiro não concluído na sequência (toggles fora de ordem
    // contam: o usuário volta ao buraco mais antigo).
    const next = plan.days.find((d) => !done.has(d.day));
    if (!next) continue; // plano completo: tenta o próximo mais recente
    return {
      planId,
      planTitle: plan.title,
      day: next.day,
      totalDays: plan.days.length,
      doneDays: done.size,
      readings: next.readings,
    };
  }
  return null;
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
