'use client';

/**
 * Lista de dias de um plano de leitura, com marcação de conclusão. Uma única
 * ilha client (em vez de um componente por dia) gerencia o conjunto de dias
 * concluídos localmente, com atualização otimista + reversão em erro. Cada
 * leitura linka para o capítulo no comparador.
 */
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { toggleReadingDay } from '@/app/reading/actions';
import type { PlanDay } from '@/lib/reading-plans';

export function ReadingPlanDays({
  planId,
  days,
  initialCompleted,
  bookNames,
}: {
  planId: string;
  days: PlanDay[];
  initialCompleted: number[];
  bookNames: Record<string, string>;
}) {
  const [completed, setCompleted] = useState<Set<number>>(() => new Set(initialCompleted));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const doneCount = completed.size;
  const pct = useMemo(() => (days.length ? Math.round((doneCount / days.length) * 100) : 0), [doneCount, days.length]);

  // Dia "atual" = primeiro não concluído na sequência. Em planos longos (397 dias,
  // ~30.000px) quem está no meio rolaria uma eternidade — então: rolagem automática
  // até ele ao abrir (1×, só se houver progresso) + atalho "Dia N ↓" no cabeçalho.
  const currentDay = useMemo(() => days.find((d) => !completed.has(d.day))?.day ?? null, [days, completed]);

  const scrollToDay = (day: number) => {
    document.getElementById(`plan-day-${day}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const autoScrolled = useRef(false);
  useEffect(() => {
    if (autoScrolled.current || initialCompleted.length === 0) return;
    autoScrolled.current = true;
    const done = new Set(initialCompleted);
    const first = days.find((d) => !done.has(d.day))?.day;
    // instantâneo (sem smooth): é posicionamento inicial, não animação.
    if (first != null) document.getElementById(`plan-day-${first}`)?.scrollIntoView({ block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(day: number) {
    const done = !completed.has(day);
    // otimista
    setCompleted((prev) => {
      const next = new Set(prev);
      if (done) next.add(day);
      else next.delete(day);
      return next;
    });
    setError(null);
    startTransition(async () => {
      const res = await toggleReadingDay(planId, day, done);
      if (!res.ok) {
        // reverte
        setCompleted((prev) => {
          const next = new Set(prev);
          if (done) next.delete(day);
          else next.add(day);
          return next;
        });
        setError(res.error ?? 'Falha ao salvar o progresso.');
      }
    });
  }

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-4 mb-4 border-b border-neutral-200 bg-neutral-50/95 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium">
            {doneCount} de {days.length} dias
          </span>
          <span className="flex items-center gap-2">
            {currentDay != null && doneCount > 0 && (
              <button
                type="button"
                onClick={() => scrollToDay(currentDay)}
                className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900 transition hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100 dark:hover:bg-amber-900/50"
              >
                Dia {currentDay} ↓
              </button>
            )}
            <span className="text-neutral-500 dark:text-neutral-400">{pct}%</span>
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {error && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <ul className="flex flex-col gap-2">
        {days.map((d) => {
          const isDone = completed.has(d.day);
          return (
            <li
              key={d.day}
              id={`plan-day-${d.day}`}
              className={`flex items-center gap-3 rounded-xl border p-3 transition ${
                isDone
                  ? 'border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-900/10'
                  : 'border-neutral-200 dark:border-neutral-800'
              }`}
            >
              <button
                type="button"
                onClick={() => toggle(d.day)}
                disabled={pending}
                aria-pressed={isDone}
                aria-label={`Marcar dia ${d.day} como ${isDone ? 'não lido' : 'lido'}`}
                className={`flex size-9 shrink-0 items-center justify-center rounded-full border text-sm transition disabled:opacity-50 ${
                  isDone
                    ? 'border-amber-500 bg-amber-500 text-amber-950'
                    : 'border-neutral-300 text-transparent hover:border-amber-400 dark:border-neutral-600'
                }`}
              >
                ✓
              </button>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  Dia {d.day}
                </p>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
                  {d.readings.map((r) => (
                    <Link
                      key={`${r.osis}-${r.chapter}`}
                      href={`/compare/${r.osis}/${r.chapter}`}
                      className="text-sm font-medium text-amber-700 transition hover:underline dark:text-amber-400"
                    >
                      {bookNames[r.osis] ?? r.osis} {r.chapter}
                    </Link>
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
