'use client';

import { useEffect } from 'react';
import type { HebrewLexemeInfo, LeanHebrewWord } from '@/lib/chapter-view';
import { decodeHebrewMorpheme, hebrewParsingLabel } from '@/lib/hebrew-morph';

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
  // Fecha ao pressionar Escape — saída por teclado esperada de um diálogo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

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
          <span dir="rtl" className="font-hebrew text-4xl leading-tight">
            {word.surface}
          </span>
          <span className="text-xs text-neutral-600 dark:text-neutral-400">
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
                  {m.strongs && <span className="text-xs text-neutral-600 dark:text-neutral-400">Strong {m.strongs}</span>}
                </div>

                {(lex?.xlit || lex?.pron) && (
                  <p className="mt-1 text-sm text-neutral-500">
                    {lex.xlit && (
                      <span className="italic text-neutral-700 dark:text-neutral-200">{lex.xlit}</span>
                    )}
                    {lex.pron && <span className="ml-2 text-neutral-600 dark:text-neutral-400">/{lex.pron}/</span>}
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

                {lex?.bdbDef && (
                  <p className="mt-1 text-sm leading-snug text-neutral-600 dark:text-neutral-300">
                    <span className="text-neutral-600 dark:text-neutral-400">BDB:</span> {lex.bdbDef}
                  </p>
                )}

                {parsing && (
                  <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    <dt className="text-neutral-600 dark:text-neutral-400">Análise</dt>
                    <dd>{parsing}</dd>
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
