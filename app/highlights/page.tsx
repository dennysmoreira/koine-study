import Link from 'next/link';
import { listHighlights } from '@/lib/highlights';
import { HIGHLIGHT_DOT } from '@/lib/highlight-colors';
import { getBooks } from '@/lib/corpus';

export const dynamic = 'force-dynamic';

export default async function HighlightsPage() {
  const [items, books] = await Promise.all([listHighlights(), getBooks()]);
  const byOsis = new Map(books.map((b) => [b.osis_code, b]));

  // Agrupa por livro+capítulo (os itens já vêm em ordem canônica de osis... a
  // ordem de osis é alfabética no banco; reordena pelo sort_order do catálogo).
  const sorted = [...items].sort((a, b) => {
    const sa = byOsis.get(a.osis)?.sort_order ?? 999;
    const sb = byOsis.get(b.osis)?.sort_order ?? 999;
    return sa - sb || a.chapter - b.chapter || a.verse - b.verse;
  });

  const groups = new Map<string, typeof sorted>();
  for (const h of sorted) {
    const key = `${h.osis} ${h.chapter}`;
    const list = groups.get(key) ?? [];
    list.push(h);
    groups.set(key, list);
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm text-neutral-500 hover:underline">
        ← Início
      </Link>

      <h1 className="mt-4 flex items-center gap-2 text-2xl font-bold">
        <span aria-hidden>🖍️</span> Meus destaques
      </h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Versículos que você marcou com cor no leitor.
      </p>

      {items.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Nenhum destaque ainda. No leitor, toque em <span className="font-medium">Selecionar</span>,
            marque os versículos e escolha uma cor em <span className="font-medium">🖍️ Destacar</span>.
          </p>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          {[...groups.entries()].map(([key, list]) => {
            const first = list[0]!;
            const book = byOsis.get(first.osis);
            return (
              <section key={key}>
                <h2 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">
                  {book?.name_pt ?? first.osis} {first.chapter}
                </h2>
                <ul className="mt-2 flex flex-col gap-1">
                  {list.map((h) => (
                    <li key={`${h.osis}-${h.chapter}-${h.verse}`}>
                      <Link
                        href={`/compare/${h.osis}/${h.chapter}?goto=${h.verse}`}
                        className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm transition hover:border-amber-300 hover:bg-amber-50/40 dark:border-neutral-800 dark:hover:border-amber-800 dark:hover:bg-amber-900/10"
                      >
                        <span aria-hidden className={`size-3 shrink-0 rounded-full ${HIGHLIGHT_DOT[h.color]}`} />
                        <span>
                          {book?.name_pt ?? h.osis} {h.chapter}:{h.verse}
                        </span>
                        <span aria-hidden className="ml-auto text-neutral-300 dark:text-neutral-600">→</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
