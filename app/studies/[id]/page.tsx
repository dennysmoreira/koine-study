import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSavedStudy } from '@/lib/saved-studies';
import { getStudyMode } from '@/lib/study-modes';
import { DeleteStudyButton } from '@/components/DeleteStudyButton';

export const dynamic = 'force-dynamic';

const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export default async function StudyDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) notFound();

  const study = await getSavedStudy(id);
  if (!study) notFound();

  const meta = getStudyMode(study.mode);
  const compareHref = `/compare/${study.osis}/${study.chapter}${
    study.codes.length > 0 ? `?v=${study.codes.join(',')}` : ''
  }`;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <Link href="/studies" className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
          ← Estudos salvos
        </Link>
        <DeleteStudyButton id={study.id} />
      </header>

      <div className="mb-2 flex items-center gap-2 text-xs text-neutral-400">
        <span aria-hidden>{meta.icon}</span>
        <span>{meta.label}</span>
        <span>·</span>
        <Link href={compareHref} className="underline hover:text-neutral-600 dark:hover:text-neutral-300">
          {study.bookName} {study.chapter}
        </Link>
        <span>·</span>
        <span>{dateFmt.format(new Date(study.createdAt))}</span>
      </div>

      <h1 className="mb-4 text-2xl font-semibold tracking-tight">{study.title}</h1>

      {study.prompt && (
        <p className="mb-4 rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-300">
          <span className="font-medium">Orientação:</span> {study.prompt}
        </p>
      )}

      <article className="whitespace-pre-wrap break-words rounded-lg bg-neutral-50 px-4 py-3 text-[15px] leading-relaxed dark:bg-neutral-800/50">
        {study.content}
      </article>
    </main>
  );
}
