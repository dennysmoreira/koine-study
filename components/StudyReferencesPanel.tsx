'use client';

/**
 * Painel de VERSÍCULOS CITADOS: lista as referências do estudo (com remoção) e um
 * seletor livro → capítulo → versículo para citar uma passagem da base. A citação
 * injeta o texto original + léxico daquele versículo no contexto do chat.
 *
 * Mutações são server actions; após cada uma chamamos router.refresh() para o
 * server component recarregar e propagar as referências atualizadas via props.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addStudyReference, removeStudyReference } from '@/app/study/actions';
import type { StudyReference } from '@/lib/saved-studies';

export interface BookOption {
  osis: string;
  name: string;
}

export function StudyReferencesPanel({
  studyId,
  references,
  books,
}: {
  studyId: number;
  references: StudyReference[];
  books: BookOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [osis, setOsis] = useState(books[0]?.osis ?? '');
  const [chapter, setChapter] = useState('1');
  const [verse, setVerse] = useState('1');
  const [error, setError] = useState<string | null>(null);

  function add() {
    const ch = Number(chapter);
    const vs = Number(verse);
    const book = books.find((b) => b.osis === osis);
    if (!book || !Number.isInteger(ch) || ch < 1 || !Number.isInteger(vs) || vs < 1) {
      setError('Informe livro, capítulo e versículo válidos.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await addStudyReference(studyId, {
        ref: `${book.osis}.${ch}.${vs}`,
        osis: book.osis,
        bookName: book.name,
        chapter: ch,
        verse: vs,
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else setError(res.error ?? 'Falha ao citar versículo.');
    });
  }

  function remove(id: number) {
    startTransition(async () => {
      const res = await removeStudyReference(id);
      if (res.ok) router.refresh();
      else setError(res.error ?? 'Falha ao remover.');
    });
  }

  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        Versículos citados ({references.length})
      </h2>

      {references.length === 0 ? (
        <p className="text-xs text-neutral-400">Nenhum versículo citado ainda.</p>
      ) : (
        <ul className="space-y-1">
          {references.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 rounded-md bg-neutral-100 px-2 py-1 text-xs dark:bg-neutral-800/60"
            >
              <span className="min-w-0 flex-1 truncate">
                {r.bookName} {r.chapter}:{r.verse}
              </span>
              <button
                type="button"
                onClick={() => remove(r.id)}
                disabled={pending}
                aria-label={`Remover ${r.bookName} ${r.chapter}:${r.verse}`}
                className="shrink-0 text-neutral-400 transition hover:text-red-600 disabled:opacity-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          + Citar versículo
        </button>
      ) : (
        <div className="mt-2 space-y-2">
          <select
            value={osis}
            onChange={(e) => setOsis(e.target.value)}
            className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
          >
            {books.map((b) => (
              <option key={b.osis} value={b.osis}>
                {b.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1 text-[11px] text-neutral-400">
              Capítulo
              <input
                type="number"
                min={1}
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
                className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-[11px] text-neutral-400">
              Versículo
              <input
                type="number"
                min={1}
                value={verse}
                onChange={(e) => setVerse(e.target.value)}
                className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={add}
              disabled={pending}
              className="rounded-md bg-amber-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
            >
              {pending ? 'Citando…' : 'Citar'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md px-3 py-1 text-xs text-neutral-500">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
