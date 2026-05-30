import { createClient } from '@/lib/supabase/server';

// ── Gamificação (esqueleto) ───────────────────────────────────────────────
//
// Em vez de manter uma tabela de eventos de XP (que duplicaria escrita em todo
// fluxo de estudo), derivamos streak/XP/nível das atividades que o usuário já
// registra: revisões (srs_cards), parsing (quiz_attempts) e lições
// (study_progress). Vantagem: recompensa retroativamente o histórico, não
// adiciona latência às ações existentes e não exige migração/deploy. Custo:
// o streak vê apenas a data da última revisão por card (srs_cards.last_review),
// não cada revisão — suficiente para um esqueleto motivacional.

// Pesos de XP por tipo de atividade (ajustáveis sem migração).
const XP_PER_REVIEW = 4; // cada revisão acumulada (srs_cards.reps)
const XP_PER_ATTEMPT = 5; // cada questão de parsing respondida
const XP_PER_CORRECT = 5; // bônus por acerto no parsing
const XP_PER_LESSON = 40; // cada lição concluída

// Curva de nível: nível N exige N×100 XP para ser completado (cumulativo
// quadrático). Nível 1 → 2 custa 100; 2 → 3 custa 200; e assim por diante.
const XP_PER_LEVEL_BASE = 100;

// Fuso usado para definir o "dia" do streak. O app é PT-BR; sem TZ o servidor
// (UTC na Vercel) cortaria o dia às 21h local, quebrando streaks à noite.
const TZ = 'America/Sao_Paulo';
const DAY_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const DAY_MS = 86_400_000;

export interface GameStats {
  xp: number;
  level: number;
  levelXp: number; // XP acumulado dentro do nível atual
  levelTarget: number; // XP necessário para subir de nível
  streak: number; // dias consecutivos de estudo terminando hoje ou ontem
  activeToday: boolean;
}

// yyyy-mm-dd no fuso do app (en-CA já formata nesse padrão).
function dayKey(d: Date): string {
  return DAY_FMT.format(d);
}

function levelInfo(xp: number): Pick<GameStats, 'level' | 'levelXp' | 'levelTarget'> {
  let level = 1;
  let remaining = xp;
  let target = XP_PER_LEVEL_BASE;
  while (remaining >= target) {
    remaining -= target;
    level += 1;
    target = XP_PER_LEVEL_BASE * level;
  }
  return { level, levelXp: remaining, levelTarget: target };
}

// Conta dias consecutivos com atividade, terminando hoje (ou ontem — para não
// zerar o streak antes de a pessoa estudar no dia corrente). Ancoramos o probe
// ao meio-dia UTC para que decrementos de 24h não cruzem a fronteira do dia
// local (SP = UTC-3, sem horário de verão).
//
// Limitação conhecida: srs_cards é feito upsert, então last_review guarda só a
// data da ÚLTIMA revisão por card. Um dia em que o usuário só revisou cards que
// depois foram revisados novamente não contribui com sua data via SRS — o
// streak desse dia depende de parsing/lição (tabelas append-only). Aceitável
// para o esqueleto; uma tabela de eventos resolveria com precisão total.
function computeStreak(days: Set<string>, now: Date): { streak: number; activeToday: boolean } {
  const today = dayKey(now);
  const yesterday = dayKey(new Date(now.getTime() - DAY_MS));
  const activeToday = days.has(today);

  const start = activeToday ? today : days.has(yesterday) ? yesterday : null;
  if (!start) return { streak: 0, activeToday };

  let streak = 0;
  let probe = new Date(`${start}T12:00:00Z`);
  while (days.has(dayKey(probe))) {
    streak += 1;
    probe = new Date(probe.getTime() - DAY_MS);
  }
  return { streak, activeToday };
}

/**
 * Estatísticas de gamificação do usuário autenticado. Retorna null quando
 * deslogado. Todas as queries são escopadas por RLS (auth.uid()), por isso não
 * filtramos user_id manualmente.
 */
export async function getGameStats(): Promise<GameStats | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [reviews, attempts, correct, lessons, reviewDates, attemptDates, lessonDates] =
    await Promise.all([
      // reps por card (somados no cliente — baralho de um aprendiz é pequeno)
      supabase.from('srs_cards').select('reps'),
      supabase.from('quiz_attempts').select('*', { count: 'exact', head: true }),
      supabase.from('quiz_attempts').select('*', { count: 'exact', head: true }).eq('correct', true),
      supabase
        .from('study_progress')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed'),
      // datas para o streak
      supabase.from('srs_cards').select('last_review').not('last_review', 'is', null),
      supabase.from('quiz_attempts').select('answered_at').order('answered_at', { ascending: false }).limit(400),
      supabase.from('study_progress').select('completed_at').eq('status', 'completed'),
    ]);

  const reviewsTotal = (reviews.data ?? []).reduce(
    (sum, r) => sum + ((r as { reps: number | null }).reps ?? 0),
    0,
  );
  const attemptsTotal = attempts.count ?? 0;
  const correctTotal = correct.count ?? 0;
  const lessonsTotal = lessons.count ?? 0;

  const xp =
    reviewsTotal * XP_PER_REVIEW +
    attemptsTotal * XP_PER_ATTEMPT +
    correctTotal * XP_PER_CORRECT +
    lessonsTotal * XP_PER_LESSON;

  const now = new Date();
  const days = new Set<string>();
  for (const r of reviewDates.data ?? []) {
    const v = (r as { last_review: string | null }).last_review;
    if (v) days.add(dayKey(new Date(v)));
  }
  for (const r of attemptDates.data ?? []) {
    const v = (r as { answered_at: string | null }).answered_at;
    if (v) days.add(dayKey(new Date(v)));
  }
  for (const r of lessonDates.data ?? []) {
    const v = (r as { completed_at: string | null }).completed_at;
    if (v) days.add(dayKey(new Date(v)));
  }

  const { streak, activeToday } = computeStreak(days, now);

  return { xp, ...levelInfo(xp), streak, activeToday };
}
