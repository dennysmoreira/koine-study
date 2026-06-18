import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBooks } from '@/lib/corpus';
import { getTranslations } from '@/lib/translations';
import { getChapterView } from '@/lib/chapter-view';
import { getAnnotationsForChapter } from '@/lib/annotations-server';
import { getHighlightsForChapter } from '@/lib/highlights';
import { Comparator } from '@/components/Comparator';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Códigos das versões a comparar vêm da query `?v=grc-sblgnt,pt-tbl`. Sem a query,
// começamos pela versão original (is_original) e, se houver, a primeira tradução —
// um padrão útil enquanto só o grego existe, e que se expande sozinho ao licenciar
// novas versões.
function defaultCodes(available: { code: string; is_original: boolean }[]): string[] {
  const original = available.find((t) => t.is_original)?.code;
  const firstOther = available.find((t) => !t.is_original)?.code;
  const codes = [original, firstOther].filter((c): c is string => Boolean(c));
  return codes.length > 0 ? codes : available.slice(0, 1).map((t) => t.code);
}

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: { book: string; chapter: string };
  searchParams: { v?: string };
}) {
  const osis = decodeURIComponent(params.book);
  const chapterNumber = Number(params.chapter);
  if (!Number.isInteger(chapterNumber) || chapterNumber < 1) notFound();

  const allTranslations = await getTranslations();
  const requested = searchParams.v
    ? searchParams.v.split(',').map((c) => c.trim()).filter(Boolean)
    : defaultCodes(allTranslations);

  const [chapter, books, annotations, highlights, { data: userData }] = await Promise.all([
    getChapterView(osis, chapterNumber, requested),
    getBooks(),
    getAnnotationsForChapter(osis, chapterNumber),
    getHighlightsForChapter(osis, chapterNumber),
    createClient().auth.getUser(),
  ]);
  const isAuthenticated = Boolean(userData?.user);

  if (!chapter || chapter.rows.length === 0) {
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

  return (
    <Comparator
      chapter={chapter}
      books={books}
      allTranslations={allTranslations}
      annotations={annotations}
      highlights={highlights}
      isAuthenticated={isAuthenticated}
    />
  );
}
