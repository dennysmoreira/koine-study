'use client';

import { useEffect, useState } from 'react';
import type { LexiconEntry } from '@/lib/corpus';
import type { ChapterLemma, LeanToken } from '@/lib/chapter-view';
import { glossLabel, parsingLabel, posLabel } from '@/lib/morph-labels';
import { transliterate } from '@/lib/transliterate';
import { fetchLexicon } from '@/app/compare/actions';
import { SpeakButton } from '@/components/SpeakButton';

// Rótulos legíveis por fonte de léxico (coluna `lexicon_entries.source` +
// 'abbott_smith', injetado pela action a partir de `lemmas.abbott_smith`).
const LEXICON_LABELS: Record<string, string> = {
  abbott_smith: 'Abbott-Smith',
  lsj: 'LSJ (Liddell-Scott-Jones)',
  thayers: "Thayer's",
  moulton_milligan: 'Moulton-Milligan',
};

// Painel inferior com os dados linguísticos de um token grego: superfície,
// Strong's, pronúncia (transliteração + áudio), lema, glosa, análise morfológica
// e os léxicos (Abbott-Smith, LSJ etc.) buscados SOB DEMANDA ao abrir. O token é
// o LeanToken da fronteira cliente; o `lemma` vem resolvido pelo Comparator a
// partir do índice de léxico do capítulo (deduplicação do payload).
export function TokenSheet({
  token,
  lemma,
  onClose,
}: {
  token: LeanToken;
  lemma: ChapterLemma | null;
  onClose: () => void;
}) {
  const gloss = glossLabel(token, lemma);
  const strongs = lemma?.strongs ?? null;
  const romanized = transliterate(token.surface);
  const [lexicon, setLexicon] = useState<LexiconEntry[] | null>(null);
  const [lexLoading, setLexLoading] = useState(false);

  // Fecha ao pressionar Escape — saída por teclado esperada de um diálogo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Busca as entradas de léxico (LSJ etc.) sob demanda ao abrir o painel. Não
  // viajam no payload do capítulo (entradas grandes). `ignore` evita aplicar o
  // resultado de um token anterior caso o usuário troque de token rapidamente.
  useEffect(() => {
    if (!strongs) {
      setLexicon([]);
      return;
    }
    let ignore = false;
    setLexLoading(true);
    setLexicon(null);
    fetchLexicon(strongs)
      .then((entries) => {
        if (!ignore) setLexicon(entries);
      })
      .catch(() => {
        if (!ignore) setLexicon([]);
      })
      .finally(() => {
        if (!ignore) setLexLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [strongs]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative max-h-[70dvh] overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] shadow-xl dark:bg-neutral-900">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-greek text-3xl">{token.surface}</span>
          {strongs && <span className="text-xs text-neutral-600 dark:text-neutral-400">Strong {strongs}</span>}
        </div>

        <div className="mt-1 flex items-center gap-2">
          <p className="text-base italic text-neutral-600 dark:text-neutral-400" aria-label="Pronúncia">
            {romanized}
          </p>
          <SpeakButton text={token.surface} romanized={romanized} lang="grc" />
        </div>

        {lemma && (
          <p className="mt-2 text-sm text-neutral-500">
            Lema:{' '}
            <span className="font-greek text-base text-neutral-700 dark:text-neutral-200">
              {lemma.lemma}
            </span>
            <span className="ml-2 italic text-neutral-600 dark:text-neutral-400">{transliterate(lemma.lemma)}</span>
          </p>
        )}

        {gloss && <p className="mt-3 text-lg font-medium">{gloss}</p>}

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-neutral-600 dark:text-neutral-400">Classe</dt>
          <dd>{posLabel(token)}</dd>
          <dt className="text-neutral-600 dark:text-neutral-400">Análise</dt>
          <dd>{parsingLabel(token)}</dd>
          {lemma?.gloss_en && lemma.gloss_en !== gloss && (
            <>
              <dt className="text-neutral-600 dark:text-neutral-400">Glosa (EN)</dt>
              <dd className="text-neutral-500">{lemma.gloss_en}</dd>
            </>
          )}
        </dl>

        {lexLoading && (
          <p className="mt-5 border-t border-neutral-200 pt-4 text-sm text-neutral-600 dark:text-neutral-400 dark:border-neutral-800">
            Carregando léxico…
          </p>
        )}

        {lexicon?.map((entry) => (
          <section
            key={entry.source}
            className="mt-5 border-t border-neutral-200 pt-4 dark:border-neutral-800"
          >
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-600 dark:text-neutral-400">
              {LEXICON_LABELS[entry.source] ?? entry.source.toUpperCase()}
            </h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
              {entry.text_pt ?? entry.text_en}
            </p>
            {entry.source === 'lsj' && (
              <p className="mt-2 text-[11px] text-neutral-600 dark:text-neutral-400">
                LSJ via{' '}
                <a
                  href="https://github.com/STEPBible/STEPBible-Data"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  STEPBible
                </a>{' '}
                (CC BY 4.0)
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
