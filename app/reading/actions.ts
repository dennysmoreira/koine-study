'use server';

/**
 * Server Actions dos planos de leitura: marcar/desmarcar um dia como concluído e
 * criar/excluir planos PERSONALIZADOS. RLS (own_reading_progress/own_custom_plans)
 * isola por auth.uid().
 */
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getPlan, BOOK_CATALOG } from '@/lib/reading-plans';
import { getCustomPlan, parseCustomPlanId, CUSTOM_PLAN_PREFIX } from '@/lib/custom-plans';

// Teto de planos personalizados por usuário. BEST-EFFORT: é um count+insert sem
// lock (submits concorrentes podem ultrapassar por 1) — é sanidade, não cota dura.
//
// Integridade do plan_id em reading_progress: garantida NA APLICAÇÃO (estas
// actions são o único escritor do app; toggleReadingDay valida o plano antes).
// O banco não tem FK/check para plan_id (planos fixos não são linhas), então um
// cliente falando direto com o Supabase pode poluir o PRÓPRIO progresso com ids
// inventados — RLS limita ao próprio user_id e os leitores toleram ids órfãos.
const MAX_CUSTOM_PLANS = 20;

export async function toggleReadingDay(
  planId: string,
  day: number,
  done: boolean,
): Promise<{ ok: boolean; error?: string }> {
  // Resolve fixo OU personalizado (o personalizado consulta o banco sob RLS,
  // então um plan_id alheio volta null e a marcação é negada).
  const plan = getPlan(planId) ?? (await getCustomPlan(planId));
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

export interface CreatePlanInput {
  title: string;
  /** códigos OSIS dos livros escolhidos (qualquer ordem; canonizada aqui). */
  books: string[];
  perDay: number;
}

/**
 * Cria um plano personalizado. Validação na borda (action chamável de fora):
 * título 1..80, livros existentes no catálogo (deduplicados e reordenados para a
 * ordem canônica — os dias seguem o cânon, previsível), ritmo 1..10.
 */
export async function createCustomPlan(
  input: CreatePlanInput,
): Promise<{ ok: boolean; planId?: string; error?: string }> {
  const title = (input.title ?? '').trim();
  if (!title) return { ok: false, error: 'Dê um nome ao plano.' };
  if (title.length > 80) return { ok: false, error: 'Nome muito longo (máx. 80).' };

  const perDay = Number(input.perDay);
  if (!Number.isInteger(perDay) || perDay < 1 || perDay > 10) {
    return { ok: false, error: 'Capítulos por dia deve ser entre 1 e 10.' };
  }

  const chosen = new Set((input.books ?? []).filter((b) => typeof b === 'string'));
  // ordem canônica + descarta códigos desconhecidos
  const books = BOOK_CATALOG.filter((b) => chosen.has(b.osis)).map((b) => b.osis);
  if (books.length === 0) return { ok: false, error: 'Escolha ao menos um livro.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login para criar planos.' };

  const { count } = await supabase
    .from('custom_plans')
    .select('id', { count: 'exact', head: true });
  if ((count ?? 0) >= MAX_CUSTOM_PLANS) {
    return { ok: false, error: `Limite de ${MAX_CUSTOM_PLANS} planos atingido. Exclua um para criar outro.` };
  }

  const { data, error } = await supabase
    .from('custom_plans')
    .insert({ user_id: user.id, title, books, per_day: perDay })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'Falha ao criar o plano.' };

  revalidatePath('/reading');
  return { ok: true, planId: `${CUSTOM_PLAN_PREFIX}${(data as { id: number }).id}` };
}

/** Exclui um plano personalizado E o progresso associado. */
export async function deleteCustomPlan(planId: string): Promise<{ ok: boolean; error?: string }> {
  const id = parseCustomPlanId(planId);
  if (id == null) return { ok: false, error: 'Plano inválido.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sessão expirada. Entre novamente.' };

  // A RECEITA primeiro: se a 2ª escrita falhar, sobra progresso órfão — que os
  // leitores já toleram (plano desconhecido é pulado). A ordem inversa deixaria
  // um plano "vivo" sem progresso, que é pior. `.select('id')` confirma que algo
  // foi de fato apagado — excluir um id inexistente não vira sucesso silencioso.
  const { data: deleted, error } = await supabase
    .from('custom_plans')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!deleted || deleted.length === 0) return { ok: false, error: 'Plano não encontrado.' };

  // Progresso associado (RLS isola o dono). Falha aqui deixa órfãos tolerados.
  const { error: progErr } = await supabase.from('reading_progress').delete().eq('plan_id', planId);
  if (progErr) return { ok: false, error: progErr.message };

  revalidatePath('/reading');
  return { ok: true };
}
