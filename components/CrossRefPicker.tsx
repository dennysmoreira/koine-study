'use client';

/**
 * Seletor de uma referência bíblica relacionada para anexar a uma anotação.
 * Cascata Livro → Capítulo → Versículo inicial → Versículo final, reaproveitando
 * as server actions do comparador (listBooks/getBookChapters/getChapterVerses).
 * Ao confirmar, devolve um CrossRef pronto (com o rótulo `ref`) via onAdd.
 */
import { useEffect, useState, useTransition } from 'react';
import { listBooks, getBookChapters, getChapterVerses, type BookOption } from '@/app/compare/actions';
import { rangeRef, type CrossRef } from '@/lib/annotations';

export function CrossRefPicker({ onAdd, onCancel }: { onAdd: (ref: CrossRef) => void; onCancel: () => void }) {
  const [pending, startTransition] = useTransition();
  const [books, setBooks] = useState<BookOption[] | null>(null);
  const [osis, setOsis] = useState('');
  const [chapters, setChapters] = useState<number[]>([]);
  const [chapter, setChapter] = useState<number | null>(null);
  const [verses, setVerses] = useState<number[]>([]);
  const [verseStart, setVerseStart] = useState<number | null>(null);
  const [verseEnd, setVerseEnd] = useState<number | null>(null);

  useEffect(() => {
    startTransition(async () => setBooks(await listBooks()));
  }, []);

  function pickBook(value: string) {
    setOsis(value);
    setChapter(null);
    setChapters([]);
    setVerses([]);
    setVerseStart(null);
    setVerseEnd(null);
    if (!value) return;
    startTransition(async () => setChapters(await getBookChapters(value)));
  }

  function pickChapter(value: string) {
    const n = Number(value);
    setChapter(Number.isInteger(n) && n > 0 ? n : null);
    setVerses([]);
    setVerseStart(null);
    setVerseEnd(null);
    if (!Number.isInteger(n) || n < 1) return;
    startTransition(async () => setVerses(await getChapterVerses(osis, n)));
  }

  function pickStart(value: string) {
    const n = Number(value);
    const v = Number.isInteger(n) && n > 0 ? n : null;
    setVerseStart(v);
    // Mantém fim >= início.
    if (v != null && (verseEnd == null || verseEnd < v)) setVerseEnd(v);
  }

  function confirm() {
    const book = books?.find((b) => b.osis === osis);
    if (!book || chapter == null || verseStart == null) return;
    const end = verseEnd ?? verseStart;
    onAdd({
      osis: book.osis,
      bookName: book.name,
      chapter,
      verseStart,
      verseEnd: end,
      ref: rangeRef(book.name, chapter, verseStart, end),
    });
  }

  const selectClass =
    'w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800';
  const endOptions = verses.filter((v) => verseStart == null || v >= verseStart);

  return (
    <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
      <p className="mb-2 text-xs font-medium text-neutral-500">Adicionar referência relacionada</p>
      <div className="grid grid-cols-2 gap-2">
        <select aria-label="Livro" value={osis} onChange={(e) => pickBook(e.target.value)} className={`col-span-2 ${selectClass}`}>
          <option value="">{books === null ? 'Carregando livros…' : 'Selecione o livro'}</option>
          {(books ?? []).map((b) => (
            <option key={b.osis} value={b.osis}>
              {b.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Capítulo"
          value={chapter ?? ''}
          onChange={(e) => pickChapter(e.target.value)}
          disabled={chapters.length === 0}
          className={`col-span-2 ${selectClass} disabled:opacity-50`}
        >
          <option value="">Capítulo</option>
          {chapters.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          aria-label="Versículo inicial"
          value={verseStart ?? ''}
          onChange={(e) => pickStart(e.target.value)}
          disabled={verses.length === 0}
          className={`${selectClass} disabled:opacity-50`}
        >
          <option value="">Verso inicial</option>
          {verses.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>

        <select
          aria-label="Versículo final"
          value={verseEnd ?? ''}
          onChange={(e) => {
            const n = Number(e.target.value);
            setVerseEnd(Number.isInteger(n) && n > 0 ? n : null);
          }}
          disabled={verseStart == null}
          className={`${selectClass} disabled:opacity-50`}
        >
          <option value="">Verso final</option>
          {endOptions.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 transition hover:bg-neutral-100 dark:hover:bg-neutral-800">
          Cancelar
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={pending || osis === '' || chapter == null || verseStart == null}
          className="min-h-[44px] rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-amber-950 transition hover:bg-amber-400 disabled:opacity-50"
        >
          Adicionar
        </button>
      </div>
    </div>
  );
}
