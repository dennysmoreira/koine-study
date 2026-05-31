import { getGameStats } from '@/lib/gamification';
import { AccountBadge } from '@/components/AccountBadge';
import { GameStatsStrip } from '@/components/GameStats';
import { ActivityCard, type Activity } from '@/components/ActivityCard';

export const dynamic = 'force-dynamic';

// Atividades agrupadas por intenção. As classes de cor são literais completas
// para que o JIT do Tailwind as inclua no bundle.
const SECTIONS: { title: string; subtitle: string; items: Activity[] }[] = [
  {
    title: 'Aprender',
    subtitle: 'Comece do zero, no seu ritmo.',
    items: [
      {
        href: '/alphabet',
        icon: '🔤',
        title: 'Alfabeto',
        description: 'Aprenda as 24 letras jogando.',
        iconClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
      },
      {
        href: '/lessons',
        icon: '📖',
        title: 'Gramática',
        description: 'Os fundamentos, passo a passo.',
        iconClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
      },
    ],
  },
  {
    title: 'Praticar',
    subtitle: 'Fixe o que aprendeu.',
    items: [
      {
        href: '/trail',
        icon: '📊',
        title: 'Frequência',
        description: 'As palavras que mais aparecem no NT.',
        iconClass: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
      },
      {
        href: '/vocab',
        icon: '🃏',
        title: 'Vocabulário',
        description: 'Revise com repetição espaçada.',
        iconClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
      },
      {
        href: '/parsing',
        icon: '🧩',
        title: 'Parsing',
        description: 'Treine a análise morfológica.',
        iconClass: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
      },
    ],
  },
  {
    title: 'Consultar & ler',
    subtitle: 'Aprofunde e leia o texto.',
    items: [
      {
        href: '/dictionary',
        icon: '📚',
        title: 'Dicionário',
        description: 'Busque qualquer palavra do NT.',
        iconClass: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
      },
      {
        href: '/compare',
        icon: '📜',
        title: 'Ler & comparar',
        description: 'Grego interlinear, traduções lado a lado e definição das palavras.',
        iconClass: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
      },
      {
        href: '/studies',
        icon: '✨',
        title: 'Estudos salvos',
        description: 'Seus textos gerados com IA.',
        iconClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
      },
    ],
  },
];

export default async function HomePage() {
  const gameStats = await getGameStats();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Koiné Study</h1>
          <p className="text-sm text-neutral-500">Aprenda grego koiné do zero.</p>
        </div>
        <AccountBadge />
      </header>

      {gameStats && (
        <div className="mb-8">
          <GameStatsStrip stats={gameStats} />
        </div>
      )}

      <div className="flex flex-col gap-8">
        {SECTIONS.map((section) => (
          <section key={section.title}>
            <div className="mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
                {section.title}
              </h2>
              <p className="text-xs text-neutral-400">{section.subtitle}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {section.items.map((item) => (
                <ActivityCard key={item.href} activity={item} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
