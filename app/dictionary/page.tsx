import Link from 'next/link';
import { searchDictionary, type DictLang } from '@/lib/dictionary';
import { transliterate } from '@/lib/transliterate';
import { DictionarySearch } from '@/components/DictionarySearch';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Dicionário · Koiné Study',
};

// Abas de idioma: o dicionário é compartilhado, mas grego e hebraico têm formas,
// transliterações e léxicos distintos — a busca é escopada a um idioma por vez.
const TABS: { lang: DictLang; label: string }[] = [
  { lang: 'grc', label: 'Grego' },
  { lang: 'hbo', label: 'Hebraico' },
];

export default async function DictionaryPage({
  searchParams,
}: {
  searchParams: { q?: string; lang?: string };
}) {
  const LIMIT = 40;
  const q = (searchParams.q ?? '').trim();
  const lang: DictLang = searchParams.lang === 'hbo' ? 'hbo' : 'grc';
  const results = await searchDictionary(q, lang, LIMIT);
  // Quando atinge o teto, há provavelmente mais resultados — sinaliza com "+".
  const capped = results.length === LIMIT;

  const tabHref = (l: DictLang) => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (l === 'hbo') params.set('lang', 'hbo');
    const qs = params.toString();
    return qs ? `/dictionary?${qs}` : '/dictionary';
  };

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

      <div className="mb-4 flex gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-900">
        {TABS.map((t) => {
          const active = t.lang === lang;
          return (
            <Link
              key={t.lang}
              href={tabHref(t.lang)}
              className={`flex-1 rounded-lg py-2 text-center text-sm font-medium transition ${
                active
                  ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100'
                  : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      <div className="mb-4">
        <DictionarySearch initial={q} lang={lang} />
      </div>

      <p className="mb-4 text-xs text-neutral-400">
        {q
          ? `${results.length}${capped ? '+' : ''} resultado${results.length === 1 ? '' : 's'} para "${q}"`
          : lang === 'hbo'
            ? 'Léxico hebraico do Antigo Testamento'
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
                  {w.language === 'hbo' ? (
                    <>
                      <span dir="rtl" className="font-hebrew text-xl leading-tight">
                        {w.lemma}
                      </span>
                      {w.xlit && <span className="text-xs italic text-neutral-400">{w.xlit}</span>}
                    </>
                  ) : (
                    <>
                      <span className="font-greek text-lg leading-tight">{w.lemma}</span>
                      <span className="text-xs italic text-neutral-400">{transliterate(w.lemma)}</span>
                    </>
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-neutral-600 dark:text-neutral-300">
                  {w.gloss_pt ?? w.gloss_en ?? <span className="text-neutral-400">—</span>}
                </span>
                {w.language === 'hbo' ? (
                  w.strongs && (
                    <span className="shrink-0 text-xs tabular-nums text-neutral-400">{w.strongs}</span>
                  )
                ) : (
                  <span className="shrink-0 text-xs tabular-nums text-neutral-400">{w.frequency}×</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
