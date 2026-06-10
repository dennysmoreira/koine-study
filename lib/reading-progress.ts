/**
 * Leitura do progresso dos planos do usuário autenticado (RLS own_reading_progress).
 * server-only. O catálogo de planos é estático (lib/reading-plans.ts); aqui só os
 * dias concluídos por usuário.
 */
import 'server-only';
import { createClient } from './supabase/server';
import { PLANS, type Reading, type ReadingPlan } from './reading-plans';
import { getCustomPlan, CUSTOM_PLAN_PREFIX } from './custom-plans';

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
  /** dias consecutivos com leitura marcada (0 = sem sequência ativa). */
  streak: number;
}

// Fuso do usuário para o corte de "dia" do streak (app pessoal, pt-BR). Sem
// isso, marcar à noite contaria como o dia seguinte no UTC do servidor.
const STREAK_TZ = 'America/Sao_Paulo';

function dayKeyInTz(date: Date): string {
  // en-CA = YYYY-MM-DD, estável para comparação.
  return new Intl.DateTimeFormat('en-CA', { timeZone: STREAK_TZ }).format(date);
}

/**
 * Sequência de dias consecutivos com ALGUMA marcação de leitura (qualquer plano),
 * terminando hoje ou ontem — quem ainda não leu hoje não perde o streak até o
 * dia virar; quem pulou um dia recomeça do zero.
 */
function computeStreak(completedAts: string[]): number {
  if (completedAts.length === 0) return 0;
  const days = new Set(completedAts.map((iso) => dayKeyInTz(new Date(iso))));

  const cursor = new Date();
  if (!days.has(dayKeyInTz(cursor))) cursor.setDate(cursor.getDate() - 1); // graça de hoje
  let streak = 0;
  while (days.has(dayKeyInTz(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Streak de leitura do usuário (0 se anônimo/sem progresso). */
export async function getReadingStreak(): Promise<number> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const { data, error } = await supabase.from('reading_progress').select('completed_at');
  if (error || !data) return 0;
  return computeStreak((data as { completed_at: string }[]).map((r) => r.completed_at));
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

  const rows = data as { plan_id: string; day: number; completed_at: string }[];
  const streak = computeStreak(rows.map((r) => r.completed_at));
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
    // Custom resolvido LAZY, um por vez: o loop retorna no primeiro plano
    // incompleto (quase sempre o mais recente), então materializar todos os
    // planos custom de antemão seria trabalho desperdiçado na home.
    const plan: ReadingPlan | null =
      PLANS.find((p) => p.id === planId) ??
      (planId.startsWith(CUSTOM_PLAN_PREFIX) ? await getCustomPlan(planId) : null);
    if (!plan) continue; // plano removido do catálogo (ou custom excluído)
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
      streak,
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
