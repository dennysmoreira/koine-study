import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getStudyWorkspace } from '@/lib/saved-studies';
import { getBooks } from '@/lib/corpus';
import { getStudyMode } from '@/lib/study-modes';
import { DeleteStudyButton } from '@/components/DeleteStudyButton';
import { StudyWorkspace } from '@/components/StudyWorkspace';
import { ShareButton } from '@/components/ShareButton';
import { getShareToken } from '@/app/share/actions';

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

  const [workspace, allBooks, shareToken] = await Promise.all([
    getStudyWorkspace(id),
    getBooks(),
    getShareToken('study', id),
  ]);
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
      <div className="mb-4 flex items-center justify-between gap-4">
        <Link href="/studies" className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
          ← Estudos salvos
        </Link>
        <DeleteStudyButton id={study.id} />
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">{study.title}</h1>

      <div className="mb-5 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
        <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          <span aria-hidden>{meta.icon}</span>
          {meta.label}
        </span>
        {compareHref && study.bookName && (
          <Link href={compareHref} className="underline hover:text-neutral-700 dark:hover:text-neutral-300">
            {study.bookName} {study.chapter}
          </Link>
        )}
        <span aria-hidden>·</span>
        <span>{dateFmt.format(new Date(study.createdAt))}</span>
        <span aria-hidden>·</span>
        <ShareButton kind="study" id={study.id} initialToken={shareToken} compact />
      </div>

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
