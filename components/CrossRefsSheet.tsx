'use client';

/**
 * Folha de REFERÊNCIAS CRUZADAS (TSK) de um versículo, aberta ao tocar o número do
 * versículo no comparador. Carrega sob demanda (server action) as passagens mais
 * relevantes. Tocar numa referência EXPANDE o texto dela ali mesmo (preview na
 * tradução aberta no comparador) — sem navegar às cegas e perder o lugar da
 * leitura; "Abrir →" navega de fato (?goto) para quem quiser aprofundar.
 */
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { getVerseCrossReferences, fetchVersePreview } from '@/app/compare/actions';
import type { CrossRef } from '@/lib/cross-references';
import type { VersePreview } from '@/lib/translations';

type PreviewState = 'loading' | VersePreview | null;

export function CrossRefsSheet({
  osis,
  bookName,
  chapter,
  verse,
  previewCode,
  onClose,
}: {
  osis: string;
  bookName: string;
  chapter: number;
  verse: number;
  /** versão preferida para o preview (a tradução aberta no comparador). */
  previewCode: string | null;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [refs, setRefs] = useState<CrossRef[] | null>(null);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  // preview por índice: undefined = não buscado; 'loading'; null = sem texto.
  const [previews, setPreviews] = useState<Record<number, PreviewState>>({});

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

  function toggle(i: number, r: CrossRef) {
    if (openIdx === i) {
      setOpenIdx(null);
      return;
    }
    setOpenIdx(i);
    if (previews[i] === undefined) {
      setPreviews((p) => ({ ...p, [i]: 'loading' }));
      fetchVersePreview(r.osis, r.chapter, r.verseStart, r.verseEnd, previewCode)
        .then((res) => setPreviews((p) => ({ ...p, [i]: res })))
        .catch(() => setPreviews((p) => ({ ...p, [i]: null })));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative max-h-[75dvh] overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] shadow-xl dark:bg-neutral-900">
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
          <ul className="flex flex-col gap-1.5">
            {refs.map((r, i) => {
              const open = openIdx === i;
              const preview = previews[i];
              return (
                <li key={`${r.osis}-${r.chapter}-${r.verseStart}-${i}`}>
                  <button
                    type="button"
                    onClick={() => toggle(i, r)}
                    aria-expanded={open}
                    aria-controls={`xref-preview-${i}`}
                    className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                      open
                        ? 'bg-amber-50 font-medium text-amber-900 dark:bg-amber-900/25 dark:text-amber-100'
                        : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700'
                    }`}
                  >
                    {r.ref}
                    <span
                      aria-hidden
                      className={`text-xs text-neutral-400 transition-transform ${open ? 'rotate-180' : ''}`}
                    >
                      ⌄
                    </span>
                  </button>

                  {open && (
                    <div
                      id={`xref-preview-${i}`}
                      role="region"
                      aria-label={`Texto de ${r.ref}`}
                      className="mx-1 rounded-b-lg border-x border-b border-amber-200 px-3 py-2 dark:border-amber-900/40"
                    >
                      {preview === 'loading' || preview === undefined ? (
                        <p className="text-sm text-neutral-400">Carregando texto…</p>
                      ) : preview === null ? (
                        <p className="text-sm text-neutral-400">Texto indisponível nesta versão.</p>
                      ) : (
                        <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                          {preview.text}
                          {preview.truncated && <span className="text-neutral-400"> …</span>}
                        </p>
                      )}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        {preview && preview !== 'loading' && (
                          <span className="text-[11px] text-neutral-400">{preview.translationName}</span>
                        )}
                        <Link
                          href={`/compare/${r.osis}/${r.chapter}?goto=${r.verseStart}`}
                          onClick={onClose}
                          className="ml-auto text-sm font-medium text-amber-700 transition hover:underline dark:text-amber-400"
                        >
                          Abrir →
                        </Link>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-4 text-[11px] text-neutral-400">
          Treasury of Scripture Knowledge · openbible.info (CC-BY), por relevância.
        </p>
      </div>
    </div>
  );
}
