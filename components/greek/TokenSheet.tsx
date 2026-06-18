'use client';

import { useEffect, useState } from 'react';
import type { LexiconEntry } from '@/lib/corpus';
import type { ChapterLemma, LeanToken } from '@/lib/chapter-view';
import { glossLabel, parsingLabel, posLabel } from '@/lib/morph-labels';
import { transliterate } from '@/lib/transliterate';
import { fetchLexicon } from '@/app/compare/actions';
import { SpeakButton } from '@/components/SpeakButton';
import { BottomSheet } from '@/components/BottomSheet';
import { loadShowMorph, saveShowMorph } from '@/lib/reader-prefs';

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
  // Progressive disclosure: morfologia + léxicos ficam sob "Análise avançada".
  // Começa colapsado (significado primeiro); a preferência do usuário persiste.
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Lê a preferência salva após montar (evita divergência de hidratação).
  useEffect(() => {
    setShowAdvanced(loadShowMorph());
  }, []);

  const toggleAdvanced = () => {
    setShowAdvanced((prev) => {
      const next = !prev;
      saveShowMorph(next);
      return next;
    });
  };

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
    <BottomSheet onClose={onClose} ariaLabel="Análise da palavra grega">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-greek text-3xl">{token.surface}</span>
          {strongs && <span className="text-xs text-muted">Strong {strongs}</span>}
        </div>

        <div className="mt-1 flex items-center gap-2">
          <p className="text-base italic text-muted" aria-label="Pronúncia">
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
            <span className="ml-2 italic text-muted">{transliterate(lemma.lemma)}</span>
          </p>
        )}

        {gloss && <p className="mt-3 text-lg font-medium">{gloss}</p>}

        {/* Análise avançada (morfologia + léxicos): colapsada por padrão para não
            sobrecarregar quem está começando no grego. A preferência persiste. */}
        <div className="mt-4 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <button
            type="button"
            onClick={toggleAdvanced}
            aria-expanded={showAdvanced}
            className="flex w-full items-center justify-between gap-2 text-sm font-medium text-neutral-700 transition hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"
          >
            <span>Análise avançada</span>
            <span
              aria-hidden
              className={`text-neutral-500 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
            >
              ›
            </span>
          </button>

          {showAdvanced && (
            <>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-muted">Classe</dt>
                <dd>{posLabel(token)}</dd>
                <dt className="text-muted">Análise</dt>
                <dd>{parsingLabel(token)}</dd>
                {lemma?.gloss_en && lemma.gloss_en !== gloss && (
                  <>
                    <dt className="text-muted">Glosa (EN)</dt>
                    <dd className="text-neutral-500">{lemma.gloss_en}</dd>
                  </>
                )}
              </dl>

              {lexLoading && (
                <p className="mt-5 text-sm text-muted">
                  Carregando léxico…
                </p>
              )}

              {lexicon?.map((entry) => (
                <section key={entry.source} className="mt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {LEXICON_LABELS[entry.source] ?? entry.source.toUpperCase()}
                  </h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
                    {entry.text_pt ?? entry.text_en}
                  </p>
                  {entry.source === 'lsj' && (
                    <p className="mt-2 text-[11px] text-muted">
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
            </>
          )}
        </div>
    </BottomSheet>
  );
}
