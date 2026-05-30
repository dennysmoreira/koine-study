import Link from 'next/link';
import { getBooks, type Book } from '@/lib/corpus';

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

export default async function ReadIndexPage() {
  const books = await getBooks();

  const groups = new Map<string, Book[]>();
  for (const book of books) {
    const list = groups.get(book.testament) ?? [];
    list.push(book);
    groups.set(book.testament, list);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          ← Início
        </Link>
        <span className="text-xs text-neutral-400">Leitura</span>
      </header>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Ler o texto</h1>
        <p className="text-sm text-neutral-500">Escolha um livro para abrir o leitor interlinear.</p>
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
