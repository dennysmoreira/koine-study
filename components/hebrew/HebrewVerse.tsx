'use client';

import type { HebrewWord } from '@/lib/hebrew';

// Renderiza o versículo hebraico como TEXTO CORRIDO (RTL), espelhando o
// GreekVerse: as palavras fluem da direita para a esquerda e cada uma é
// clicável, abrindo o HebrewWordSheet com lema/Strong's/análise por morfema.
// `activePosition` realça a palavra cujo painel está aberto (estado no pai).
// O contêiner é `dir="rtl"` + font-hebrew; um espaço entre palavras reproduz a
// leitura natural e permite a quebra de linha.
export function HebrewVerse({
  words,
  onSelect,
  activePosition,
}: {
  words: HebrewWord[];
  onSelect: (w: HebrewWord) => void;
  activePosition: number | null;
}) {
  return (
    <span dir="rtl" className="font-hebrew text-[17px] leading-loose">
      {words.map((word, i) => (
        <span key={word.position}>
          {i > 0 && ' '}
          <button
            type="button"
            onClick={() => onSelect(word)}
            className={`inline cursor-pointer rounded px-0.5 transition ${
              activePosition === word.position
                ? 'bg-amber-100 dark:bg-amber-900/40'
                : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            {word.surface}
          </button>
        </span>
      ))}
    </span>
  );
}
