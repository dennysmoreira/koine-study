import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStudyWorkspace } from '@/lib/saved-studies';
import { getBooks } from '@/lib/corpus';
import { getStudyMode } from '@/lib/study-modes';
import { DeleteStudyButton } from '@/components/DeleteStudyButton';
import { StudyWorkspace } from '@/components/StudyWorkspace';

export const dynamic = 'force-dynamic';

const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export default async function StudyDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { ask?: string };
}) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) notFound();

  const [workspace, allBooks] = await Promise.all([getStudyWorkspace(id), getBooks()]);
  if (!workspace) notFound();

  const { study, messages, sources, references } = workspace;
  const meta = getStudyMode(study.mode);
  const books = allBooks.map((b) => ({ osis: b.osis_code, name: b.name_pt }));

  // Estudos antigos (one-shot) têm osis/chapter; o link de origem só faz sentido
  // quando há uma referência primária. Workspaces sem capítulo fixo omitem o link.
  const compareHref =
    study.osis && study.chapter
      ? `/compare/${study.osis}/${study.chapter}${study.codes.length > 0 ? `?v=${study.codes.join(',')}` : ''}`
      : null;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <Link href="/studies" className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
          ← Estudos salvos
        </Link>
        <DeleteStudyButton id={study.id} />
      </header>

      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
        <span aria-hidden>{meta.icon}</span>
        <span>{meta.label}</span>
        {compareHref && study.bookName && (
          <>
            <span>·</span>
            <Link href={compareHref} className="underline hover:text-neutral-600 dark:hover:text-neutral-300">
              {study.bookName} {study.chapter}
            </Link>
          </>
        )}
        <span>·</span>
        <span>{dateFmt.format(new Date(study.createdAt))}</span>
      </div>

      <h1 className="mb-4 text-2xl font-semibold tracking-tight">{study.title}</h1>

      {study.prompt && (
        <p className="mb-4 rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-300">
          <span className="font-medium">Orientação:</span> {study.prompt}
        </p>
      )}

      {/* Conteúdo legado (estudo one-shot gerado antes do workspace conversacional). */}
      {study.content && (
        <article className="mb-6 whitespace-pre-wrap break-words rounded-lg bg-neutral-50 px-4 py-3 text-[15px] leading-relaxed dark:bg-neutral-800/50">
          {study.content}
        </article>
      )}

      <StudyWorkspace
        studyId={study.id}
        initialMessages={messages}
        references={references}
        sources={sources}
        books={books}
        autoAsk={searchParams.ask === '1'}
      />
    </main>
  );
}
