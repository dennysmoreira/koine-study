/**
 * Planos de leitura PERSONALIZADOS (tabela custom_plans, RLS own_custom_plans).
 * A tabela guarda só a "receita" (título + livros + capítulos/dia); os DIAS são
 * derivados deterministicamente por buildPlanDays — mesma lógica dos planos
 * fixos, então a UI (ReadingPlanDays) e o progresso (reading_progress) servem
 * aos dois sem distinção. O plan_id público é 'custom-{id}'.
 */
import 'server-only';
import { createClient } from './supabase/server';
import { buildPlanDays, chapterCountOf, type ReadingPlan } from './reading-plans';

export const CUSTOM_PLAN_PREFIX = 'custom-';

// Forma canônica estrita ('custom-12'): regex rejeita variantes que Number()
// aceitaria ('custom-1e3', espaços), que gerariam ids públicos não-canônicos.
const CUSTOM_PLAN_ID_RE = /^custom-([1-9]\d*)$/;

/** id numérico da linha a partir do plan_id público ('custom-12' → 12); null se não for custom. */
export function parseCustomPlanId(planId: string): number | null {
  const m = CUSTOM_PLAN_ID_RE.exec(planId);
  return m ? Number(m[1]) : null;
}

interface CustomPlanRow {
  id: number;
  title: string;
  books: string[];
  per_day: number;
}

function toReadingPlan(row: CustomPlanRow): ReadingPlan {
  const days = buildPlanDays(row.books, row.per_day);
  const chapters = row.books.reduce((sum, osis) => sum + chapterCountOf(osis), 0);
  return {
    id: `${CUSTOM_PLAN_PREFIX}${row.id}`,
    title: row.title,
    description: `${row.books.length} livro${row.books.length === 1 ? '' : 's'} · ${chapters} capítulos · ${row.per_day}/dia (${days.length} dias).`,
    days,
  };
}

/** Planos personalizados do usuário logado (vazio se anônimo), mais recentes primeiro. */
export async function listCustomPlans(): Promise<ReadingPlan[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('custom_plans')
    .select('id,title,books,per_day')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as CustomPlanRow[]).map(toReadingPlan);
}

/** Um plano personalizado pelo plan_id público; null se não existir/não for do usuário (RLS). */
export async function getCustomPlan(planId: string): Promise<ReadingPlan | null> {
  const id = parseCustomPlanId(planId);
  if (id == null) return null;

  const supabase = createClient();
  const { data, error } = await supabase
    .from('custom_plans')
    .select('id,title,books,per_day')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return toReadingPlan(data as CustomPlanRow);
}
