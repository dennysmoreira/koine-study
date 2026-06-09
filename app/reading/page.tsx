import Link from 'next/link';
import { PLANS } from '@/lib/reading-plans';
import { getPlanProgress } from '@/lib/reading-progress';

// Progresso é por-usuário (RLS); sem cache.
export const dynamic = 'force-dynamic';

export default async function ReadingPlansPage() {
  const progress = await getPlanProgress();

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

      <ul className="mt-6 flex flex-col gap-3">
        {PLANS.map((plan) => {
          const done = progress[plan.id] ?? 0;
          const total = plan.days.length;
          const pct = total ? Math.round((done / total) * 100) : 0;
          return (
            <li key={plan.id}>
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
        })}
      </ul>
    </main>
  );
}
