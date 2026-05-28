import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLesson, type Block } from '@/lib/lessons';
import { createClient } from '@/lib/supabase/server';
import { LessonComplete } from '@/components/LessonComplete';

export const dynamic = 'force-dynamic';

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'p':
      return <p className="leading-relaxed text-neutral-700 dark:text-neutral-300">{block.text}</p>;
    case 'note':
      return (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {block.text}
        </p>
      );
    case 'example':
      return (
        <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
          <span className="font-greek text-2xl">{block.greek}</span>
          {block.translit && (
            <span className="ml-2 text-sm italic text-neutral-400">{block.translit}</span>
          )}
          <p className="mt-1 text-sm text-neutral-500">{block.gloss}</p>
        </div>
      );
    case 'table':
      return (
        <div className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-900">
                {block.head.map((h, i) => (
                  <th
                    key={i}
                    className="border-b border-neutral-200 px-3 py-2 text-left font-medium text-neutral-500 dark:border-neutral-800"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="even:bg-neutral-50/50 dark:even:bg-neutral-900/40">
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      className={`border-b border-neutral-100 px-3 py-2 dark:border-neutral-800/60 ${
                        c === 0 ? 'text-neutral-500' : 'font-greek text-base'
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export default async function LessonPage({ params }: { params: { id: string } }) {
  const lesson = getLesson(params.id);
  if (!lesson) notFound();

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isCompleted = false;
  if (user) {
    const { data } = await supabase
      .from('study_progress')
      .select('status')
      .eq('lesson_id', lesson.id)
      .maybeSingle();
    isCompleted = (data as { status: string } | null)?.status === 'completed';
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="mb-6">
        <Link
          href="/lessons"
          className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          ← Gramática
        </Link>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">{lesson.title}</h1>
        <p className="mt-1 text-sm text-neutral-500">{lesson.summary}</p>
      </header>

      <article className="flex flex-col gap-8">
        {lesson.sections.map((section, s) => (
          <section key={s} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{section.heading}</h2>
            {section.blocks.map((block, b) => (
              <BlockView key={b} block={block} />
            ))}
          </section>
        ))}
      </article>

      <LessonComplete lessonId={lesson.id} initialCompleted={isCompleted} isLoggedIn={Boolean(user)} />
    </main>
  );
}
