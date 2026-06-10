import { AccountBadge } from '@/components/AccountBadge';
import { ActivityCard, type Activity } from '@/components/ActivityCard';
import { ResumeReading } from '@/components/ResumeReading';
import { TodayPlanCard } from '@/components/TodayPlanCard';
import { getBooks } from '@/lib/corpus';
import { getTodayReading } from '@/lib/reading-progress';

export const dynamic = 'force-dynamic';

// Atividades agrupadas por intenção. As classes de cor são literais completas
// para que o JIT do Tailwind as inclua no bundle.
const SECTIONS: { title: string; subtitle: string; items: Activity[] }[] = [
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
        href: '/reading',
        icon: '📅',
        title: 'Planos de leitura',
        description: 'Leia a Bíblia dia a dia, com progresso salvo.',
        iconClass: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
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
  const [books, today] = await Promise.all([getBooks(), getTodayReading()]);
  const bookNames: Record<string, string> = Object.fromEntries(books.map((b) => [b.osis_code, b.name_pt]));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-8 flex items-start justify-between gap-2 sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Hermeneus</h1>
          <p className="text-sm text-neutral-500">Leia, compare e estude o texto bíblico no original.</p>
        </div>
        <AccountBadge />
      </header>

      <ResumeReading bookNames={bookNames} />

      {today && <TodayPlanCard today={today} bookNames={bookNames} />}

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
