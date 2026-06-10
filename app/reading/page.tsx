import Link from 'next/link';
import { PLANS, type ReadingPlan } from '@/lib/reading-plans';
import { getPlanProgress, getReadingStreak } from '@/lib/reading-progress';
import { listCustomPlans } from '@/lib/custom-plans';
import { getBooks } from '@/lib/corpus';
import { chapterCountOf } from '@/lib/reading-plans';
import { CreatePlanForm, type PlanBookOption } from '@/components/CreatePlanForm';

// Progresso é por-usuário (RLS); sem cache.
export const dynamic = 'force-dynamic';

function PlanCard({ plan, done }: { plan: ReadingPlan; done: number }) {
  const total = plan.days.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <li>
      <Link
        href={`/reading/${plan.id}`}
        className="block rounded-xl border border-neutral-200 p-4 transition hover:border-amber-300 hover:bg-amber-50/40 dark:border-neutral-800 dark:hover:border-amber-800 dark:hover:bg-amber-900/10"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-semibold">{plan.title}</h2>
          <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
            {done}/{total}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{plan.description}</p>
        {done > 0 && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
          </div>
        )}
      </Link>
    </li>
  );
}

export default async function ReadingPlansPage() {
  const [progress, customPlans, books, streak] = await Promise.all([
    getPlanProgress(),
    listCustomPlans(),
    getBooks(),
    getReadingStreak(),
  ]);

  // chapters vem do MESMO catálogo que o servidor usa ao criar (chapterCountOf):
  // a prévia nunca diverge do resultado. Livros do banco ausentes do catálogo
  // (count 0) ficam fora do formulário — o servidor os descartaria em silêncio.
  const bookOptions: PlanBookOption[] = books
    .map((b) => ({
      osis: b.osis_code,
      name: b.name_pt,
      testament: b.testament,
      chapters: chapterCountOf(b.osis_code),
    }))
    .filter((b) => b.chapters > 0);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link href="/" className="text-sm text-neutral-500 hover:underline">
        ← Início
      </Link>

      <h1 className="mt-4 flex items-center gap-2 text-2xl font-bold">
        <span aria-hidden>📅</span> Planos de leitura
      </h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Acompanhe sua leitura dia a dia. O progresso fica salvo na sua conta.
      </p>

      {streak >= 2 && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-3 py-1 text-sm font-semibold text-orange-700 dark:bg-orange-950 dark:text-orange-300">
          <span aria-hidden>🔥</span> {streak} dias seguidos de leitura
        </p>
      )}

      <CreatePlanForm books={bookOptions} />

      {customPlans.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Meus planos
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {customPlans.map((plan) => (
              <PlanCard key={plan.id} plan={plan} done={progress[plan.id] ?? 0} />
            ))}
          </ul>
        </>
      )}

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Planos prontos
      </h2>
      <ul className="mt-3 flex flex-col gap-3">
        {PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} done={progress[plan.id] ?? 0} />
        ))}
      </ul>
    </main>
  );
}
