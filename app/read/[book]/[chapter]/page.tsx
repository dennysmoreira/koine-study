import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getChapter } from '@/lib/corpus';
import { Reader } from '@/components/Reader';

export const dynamic = 'force-dynamic';

export default async function ReadPage({
  params,
}: {
  params: { book: string; chapter: string };
}) {
  const osis = decodeURIComponent(params.book);
  const chapterNumber = Number(params.chapter);
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) notFound();

  const chapter = await getChapter(osis, chapterNumber);
  if (!chapter || chapter.verses.length === 0) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← Início
        </Link>
        <p className="mt-8 text-neutral-500">
          Capítulo não encontrado para <span className="font-medium">{osis}</span>.
        </p>
      </main>
    );
  }

  return <Reader chapter={chapter} />;
}
