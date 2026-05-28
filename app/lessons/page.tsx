import Link from 'next/link';
import { getLessons } from '@/lib/lessons';
import { getCompletedSet } from '@/lib/progress';

export const dynamic = 'force-dynamic';

export default async function LessonsPage() {
  const lessons = getLessons();
  const completed = await getCompletedSet();
  const doneCount = lessons.filter((l) => completed.has(l.id)).length;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
          ← Início
        </Link>
        <span className="text-xs text-neutral-500">
          {doneCount}/{lessons.length} concluídas
        </span>
      </header>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Gramática</h1>
        <p className="text-sm text-neutral-500">Trilha de fundamentos do grego koiné.</p>
      </div>

      <ol className="flex flex-col gap-3">
        {lessons.map((lesson) => {
          const done = completed.has(lesson.id);
          return (
            <li key={lesson.id}>
              <Link
                href={`/lessons/${lesson.id}`}
                className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-4 transition active:scale-[0.99] hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    done
                      ? 'bg-emerald-500 text-white'
                      : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                  }`}
                >
                  {done ? '✓' : lesson.order}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-base font-medium">{lesson.title}</span>
                  <span className="truncate text-sm text-neutral-500">{lesson.summary}</span>
                </span>
                <span className="ml-auto shrink-0 text-xs text-neutral-400">{lesson.durationMin} min</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
