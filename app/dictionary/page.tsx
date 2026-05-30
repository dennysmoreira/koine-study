import Link from 'next/link';
import { searchDictionary } from '@/lib/dictionary';
import { transliterate } from '@/lib/transliterate';
import { DictionarySearch } from '@/components/DictionarySearch';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Dicionário · Koiné Study',
};

export default async function DictionaryPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const LIMIT = 40;
  const q = (searchParams.q ?? '').trim();
  const results = await searchDictionary(q, LIMIT);
  // Quando atinge o teto, há provavelmente mais resultados — sinaliza com "+".
  const capped = results.length === LIMIT;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          ← Início
        </Link>
        <span className="text-xs text-neutral-400">Dicionário</span>
      </header>

      <div className="mb-4">
        <DictionarySearch initial={q} />
      </div>

      <p className="mb-4 text-xs text-neutral-400">
        {q
          ? `${results.length}${capped ? '+' : ''} resultado${results.length === 1 ? '' : 's'} para "${q}"`
          : 'Palavras mais frequentes do NT'}
      </p>

      {results.length === 0 ? (
        <p className="mt-8 text-center text-sm text-neutral-500">
          Nenhuma palavra encontrada. Tente outro termo.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {results.map((w) => (
            <li key={w.lemma_id}>
              <Link
                href={`/dictionary/${w.lemma_id}`}
                className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 transition active:scale-[0.99] hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-greek text-lg leading-tight">{w.lemma}</span>
                  <span className="text-xs italic text-neutral-400">{transliterate(w.lemma)}</span>
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-neutral-600 dark:text-neutral-300">
                  {w.gloss_pt ?? w.gloss_en ?? <span className="text-neutral-400">—</span>}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-neutral-400">{w.frequency}×</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
