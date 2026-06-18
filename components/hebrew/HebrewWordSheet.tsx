'use client';

import { useEffect, useState } from 'react';
import type { HebrewLexemeInfo, LeanHebrewWord } from '@/lib/chapter-view';
import { decodeHebrewMorpheme, hebrewParsingLabel } from '@/lib/hebrew-morph';
import { BottomSheet } from '@/components/BottomSheet';
import { loadShowMorph, saveShowMorph } from '@/lib/reader-prefs';

// Painel inferior com os dados linguísticos de uma palavra hebraica. Diferente do
// grego (1 token = 1 lema/morfologia), a palavra hebraica é MULTI-MORFEMA, então
// listamos um bloco por morfema (prefixo ו/ה/ב, raiz, sufixo pronominal), cada um
// com superfície, transliteração/pronúncia, lema do dicionário, Strong's, análise
// OSHM e glosa (em PT quando traduzida; cai para EN enquanto não). Os códigos
// OSHM já vêm com o prefixo de língua (H/A), logo cada morfema se autodecodifica
// (lib/hebrew-morph.ts) — o banco fica enxuto e os rótulos têm fonte única.
// Os dados de léxico (forma, xlit, pronúncia, glosa, BDB) vêm do ÍNDICE do
// capítulo (lexicon, chaveado por Strong's), não embutidos por morfema —
// deduplicação do payload (chapter-view).
export function HebrewWordSheet({
  word,
  lexicon,
  onClose,
}: {
  word: LeanHebrewWord;
  lexicon: Record<string, HebrewLexemeInfo>;
  onClose: () => void;
}) {
  // Progressive disclosure: BDB + análise morfológica ficam sob "Análise avançada"
  // (significado primeiro). Preferência compartilhada com o painel grego e persiste.
  const [showAdvanced, setShowAdvanced] = useState(false);
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

  return (
    <BottomSheet onClose={onClose} ariaLabel="Análise da palavra hebraica">
        <div className="flex items-baseline justify-between gap-3">
          <span dir="rtl" className="font-hebrew text-4xl leading-tight">
            {word.surface}
          </span>
          <span className="text-xs text-muted">
            {word.morphemes.length === 1
              ? '1 morfema'
              : `${word.morphemes.length} morfemas`}
          </span>
        </div>

        <ul className="mt-5 flex flex-col gap-4">
          {word.morphemes.map((m, i) => {
            const features = decodeHebrewMorpheme(m.code);
            const parsing = m.code ? hebrewParsingLabel(features) : null;
            const lex = m.strongs ? lexicon[m.strongs] ?? null : null;
            return (
              <li
                key={i}
                className="border-t border-neutral-200 pt-3 first:border-t-0 first:pt-0 dark:border-neutral-800"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span dir="rtl" className="font-hebrew text-2xl">
                    {m.surface || '—'}
                  </span>
                  {m.strongs && <span className="text-xs text-muted">Strong {m.strongs}</span>}
                </div>

                {(lex?.xlit || lex?.pron) && (
                  <p className="mt-1 text-sm text-neutral-500">
                    {lex.xlit && (
                      <span className="italic text-neutral-700 dark:text-neutral-200">{lex.xlit}</span>
                    )}
                    {lex.pron && <span className="ml-2 text-muted">/{lex.pron}/</span>}
                  </p>
                )}

                {(lex?.form || m.lemmaRaw) && (
                  <p className="mt-1 text-sm text-neutral-500">
                    Lema:{' '}
                    <span dir="rtl" className="font-hebrew text-base text-neutral-700 dark:text-neutral-200">
                      {lex?.form ?? m.lemmaRaw}
                    </span>
                  </p>
                )}

                {lex?.gloss && <p className="mt-1 text-base font-medium">{lex.gloss}</p>}

                {showAdvanced && lex?.bdbDef && (
                  <p className="mt-1 text-sm leading-snug text-neutral-600 dark:text-neutral-300">
                    <span className="text-muted">BDB:</span> {lex.bdbDef}
                  </p>
                )}

                {showAdvanced && parsing && (
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    <dt className="text-muted">Análise</dt>
                    <dd>{parsing}</dd>
                  </dl>
                )}
              </li>
            );
          })}
        </ul>

        {/* Toggle global da análise avançada (BDB + morfologia de cada morfema). */}
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
        </div>
    </BottomSheet>
  );
}
