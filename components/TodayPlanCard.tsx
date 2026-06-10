import Link from 'next/link';
import type { TodayReading } from '@/lib/reading-progress';

/**
 * Cartão "leitura de hoje" na home: o próximo dia não concluído do plano ativo,
 * com link direto para o primeiro capítulo do dia no comparador — começar a
 * leitura diária em um toque, sem navegar até Mais → Planos. Server component
 * (dados já resolvidos pela página).
 */
export function TodayPlanCard({ today, bookNames }: { today: TodayReading; bookNames: Record<string, string> }) {
  const first = today.readings[0];
  if (!first) return null;

  const label = today.readings.map((r) => `${bookNames[r.osis] ?? r.osis} ${r.chapter}`).join(' · ');

  return (
    <Link
      href={`/compare/${first.osis}/${first.chapter}`}
      className="mb-6 flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 transition hover:bg-sky-100 dark:border-sky-900/50 dark:bg-sky-900/15 dark:hover:bg-sky-900/25"
    >
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-lg dark:bg-sky-950"
      >
        📅
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-400">
          Hoje no plano · {today.planTitle} ({today.doneDays}/{today.totalDays})
        </p>
        <p className="truncate font-semibold">
          {label}
          {today.streak >= 2 && (
            <span
              className="ml-2 inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-1.5 py-0.5 align-middle text-xs font-semibold text-orange-700 dark:bg-orange-950 dark:text-orange-300"
              title={`${today.streak} dias seguidos de leitura`}
            >
              <span aria-hidden>🔥</span> {today.streak}
            </span>
          )}
        </p>
      </div>
      <span aria-hidden className="shrink-0 text-sky-700 dark:text-sky-400">
        →
      </span>
    </Link>
  );
}
