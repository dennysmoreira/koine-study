'use client';

/**
 * Folha de REFERÊNCIAS CRUZADAS (TSK) de um versículo, aberta ao tocar o número do
 * versículo no comparador. Carrega sob demanda (server action) as passagens mais
 * relevantes e linka cada uma para o comparador na linha de destino (?goto).
 */
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { getVerseCrossReferences } from '@/app/compare/actions';
import type { CrossRef } from '@/lib/cross-references';

export function CrossRefsSheet({
  osis,
  bookName,
  chapter,
  verse,
  onClose,
}: {
  osis: string;
  bookName: string;
  chapter: number;
  verse: number;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [refs, setRefs] = useState<CrossRef[] | null>(null);

  useEffect(() => {
    startTransition(async () => {
      setRefs(await getVerseCrossReferences(osis, chapter, verse));
    });
  }, [osis, chapter, verse]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative max-h-[75dvh] overflow-y-auto rounded-t-2xl bg-white p-5 pb-8 shadow-xl dark:bg-neutral-900">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden>⇄</span> Referências cruzadas · {bookName} {chapter}:{verse}
        </h2>

        {refs === null || pending ? (
          <p className="py-4 text-center text-sm text-neutral-500 dark:text-neutral-400">Carregando…</p>
        ) : refs.length === 0 ? (
          <p className="py-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Sem referências cruzadas para este versículo.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {refs.map((r, i) => (
              <li key={`${r.osis}-${r.chapter}-${r.verseStart}-${i}`}>
                <Link
                  href={`/compare/${r.osis}/${r.chapter}?goto=${r.verseStart}`}
                  onClick={onClose}
                  className="inline-flex min-h-[44px] items-center rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-700 transition hover:bg-amber-100 hover:text-amber-900 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-amber-900/30 dark:hover:text-amber-100"
                >
                  {r.ref}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-4 text-[11px] text-neutral-400">
          Treasury of Scripture Knowledge · openbible.info (CC-BY), por relevância.
        </p>
      </div>
    </div>
  );
}
