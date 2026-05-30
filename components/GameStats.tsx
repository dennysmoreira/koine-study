import type { GameStats } from '@/lib/gamification';

// Faixa de gamificação: streak (🔥), nível e barra de progresso de XP.
// Componente puramente apresentacional — recebe stats já buscados no servidor.
export function GameStatsStrip({ stats }: { stats: GameStats }) {
  const pct = stats.levelTarget > 0 ? Math.min(100, Math.round((stats.levelXp / stats.levelTarget) * 100)) : 0;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
      <div
        className="flex flex-col items-center"
        title={stats.activeToday ? 'Você estudou hoje!' : 'Estude hoje para manter o streak'}
      >
        <span className={`text-lg leading-none ${stats.streak > 0 ? '' : 'opacity-40 grayscale'}`}>🔥</span>
        <span className="mt-0.5 text-xs font-semibold tabular-nums">{stats.streak}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium">Nível {stats.level}</span>
          <span className="text-xs tabular-nums text-neutral-400">
            {stats.levelXp}/{stats.levelTarget} XP
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
