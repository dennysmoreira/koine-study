import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getFrequencyTrail, getKnownCoverage } from '@/lib/trail';

export const dynamic = 'force-dynamic';

const TRAIL_SIZE = 150;
const MILESTONES = [10, 25, 50, 100, 150];

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export default async function TrailPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [trail, known] = await Promise.all([
    getFrequencyTrail(TRAIL_SIZE),
    user ? getKnownCoverage() : Promise.resolve(null),
  ]);

  const topPct = trail.words.length > 0 ? trail.words[trail.words.length - 1]!.cumulativePct : 0;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          ← Início
        </Link>
        <span className="text-xs text-neutral-400">Trilha · frequência</span>
      </header>

      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Palavras mais frequentes</h1>
        <p className="mt-1 text-sm text-neutral-500">
          As {TRAIL_SIZE} palavras mais comuns já cobrem {pct(topPct)} de todo o texto do Novo
          Testamento. Comece por elas.
        </p>
      </div>

      {/* Medidor de cobertura */}
      <div className="mb-8 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
        {known ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">Sua cobertura do NT</span>
              <span className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                {pct(known.knownPct)}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(100, known.knownPct)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              {known.knownCount} palavra{known.knownCount === 1 ? '' : 's'} no seu baralho. Estude no{' '}
              <Link href="/vocab" className="underline hover:text-neutral-700 dark:hover:text-neutral-300">
                Vocabulário
              </Link>{' '}
              para subir esse número.
            </p>
          </>
        ) : (
          <p className="text-sm text-neutral-500">
            <Link href="/login?next=/trail" className="font-medium underline">
              Entre
            </Link>{' '}
            para acompanhar quanto do NT você já conhece à medida que estuda o vocabulário.
          </p>
        )}
      </div>

      {/* Lista ranqueada com marcos de cobertura */}
      <ol className="flex flex-col gap-1">
        {trail.words.map((w) => (
          <li key={w.lemma_id}>
            <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-900">
              <span className="w-6 shrink-0 text-right text-xs tabular-nums text-neutral-400">
                {w.rank}
              </span>
              <span className="font-greek text-lg leading-none">{w.lemma}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-neutral-600 dark:text-neutral-300">
                {w.gloss_pt ?? <span className="text-neutral-400">—</span>}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-neutral-400">{w.frequency}×</span>
            </div>
            {MILESTONES.includes(w.rank) && (
              <p className="px-3 py-2 text-center text-xs font-medium text-emerald-600 dark:text-emerald-400">
                As {w.rank} palavras mais comuns cobrem {pct(w.cumulativePct)} do NT
              </p>
            )}
          </li>
        ))}
      </ol>

      <p className="mt-6 text-center text-xs text-neutral-400">
        Frequências calculadas sobre o corpus SBLGNT ({trail.totalTokens.toLocaleString('pt-BR')}{' '}
        palavras).
      </p>
    </main>
  );
}
