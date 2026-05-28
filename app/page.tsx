import Link from 'next/link';
import { getBooks, type Book } from '@/lib/corpus';
import { AccountBadge } from '@/components/AccountBadge';

export const dynamic = 'force-dynamic';

const TESTAMENT_LABELS: Record<string, string> = {
  NT: 'Novo Testamento',
  OT: 'Antigo Testamento',
};

function BookCard({ book }: { book: Book }) {
  return (
    <Link
      href={`/read/${book.osis_code}/1`}
      className="flex flex-col gap-1 rounded-xl border border-neutral-200 bg-white p-4 transition active:scale-[0.98] hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
    >
      <span className="text-base font-medium">{book.name_pt}</span>
      {book.name_grc && (
        <span className="font-greek text-sm text-neutral-500">{book.name_grc}</span>
      )}
    </Link>
  );
}

export default async function HomePage() {
  const books = await getBooks();

  const groups = new Map<string, Book[]>();
  for (const book of books) {
    const list = groups.get(book.testament) ?? [];
    list.push(book);
    groups.set(book.testament, list);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Koiné Study</h1>
          <p className="text-sm text-neutral-500">Leitor interlinear do Novo Testamento grego.</p>
        </div>
        <AccountBadge />
      </header>

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <Link
          href="/vocab"
          className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4 transition active:scale-[0.99] hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
        >
          <span className="flex flex-col">
            <span className="text-base font-medium">Vocabulário</span>
            <span className="text-sm text-neutral-500">Revise palavras com repetição espaçada.</span>
          </span>
          <span aria-hidden className="text-neutral-400">→</span>
        </Link>
        <Link
          href="/parsing"
          className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4 transition active:scale-[0.99] hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
        >
          <span className="flex flex-col">
            <span className="text-base font-medium">Parsing</span>
            <span className="text-sm text-neutral-500">Treine a análise morfológica.</span>
          </span>
          <span aria-hidden className="text-neutral-400">→</span>
        </Link>
        <Link
          href="/lessons"
          className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4 transition active:scale-[0.99] hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
        >
          <span className="flex flex-col">
            <span className="text-base font-medium">Gramática</span>
            <span className="text-sm text-neutral-500">Aprenda os fundamentos passo a passo.</span>
          </span>
          <span aria-hidden className="text-neutral-400">→</span>
        </Link>
      </div>

      {books.length === 0 && (
        <p className="text-neutral-500">Nenhum livro carregado no corpus.</p>
      )}

      {[...groups.entries()].map(([testament, list]) => (
        <section key={testament} className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            {TESTAMENT_LABELS[testament] ?? testament}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {list.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
