'use client';

/**
 * Preferências de leitura nas Configurações: o mesmo tamanho de fonte do leitor
 * (Aa), editável fora dele. Lê/grava a MESMA chave do localStorage do Comparator
 * (lib/reader-prefs) — o leitor aplica a preferência na próxima abertura.
 */
import { useEffect, useState } from 'react';
import {
  DEFAULT_FONT_SIZE,
  FONT_SIZES,
  loadFontSize,
  saveFontSize,
  type ReaderFontSize,
} from '@/lib/reader-prefs';

export function ReaderPreferences() {
  const [fontSize, setFontSize] = useState<ReaderFontSize>(DEFAULT_FONT_SIZE);

  // Valor salvo só após a montagem (localStorage não existe no SSR).
  useEffect(() => {
    setFontSize(loadFontSize());
  }, []);

  const pick = (size: ReaderFontSize) => {
    setFontSize(size);
    saveFontSize(size);
  };

  return (
    <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="font-semibold">Leitura</h2>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Tamanho do texto no leitor (grego, hebraico e traduções).
      </p>

      <div className="mt-3 flex gap-2" role="group" aria-label="Tamanho da fonte">
        {FONT_SIZES.map((s, i) => (
          <button
            key={s.value}
            type="button"
            onClick={() => pick(s.value)}
            aria-pressed={fontSize === s.value}
            className={`flex min-h-[44px] flex-1 flex-col items-center justify-center rounded-lg border transition ${
              fontSize === s.value
                ? 'border-amber-400 bg-amber-50 font-medium text-amber-900 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-100'
                : 'border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-600'
            }`}
          >
            <span aria-hidden className="font-serif leading-none" style={{ fontSize: 13 + i * 3 }}>
              Aa
            </span>
            <span className="mt-1 text-[11px]">{s.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
