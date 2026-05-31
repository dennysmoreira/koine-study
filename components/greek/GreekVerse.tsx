'use client';

import type { Token } from '@/lib/corpus';

// Renderiza o versículo grego como TEXTO CORRIDO (estilo prosa), não interlinear
// empilhado: as palavras fluem como uma frase normal e cada uma é clicável,
// abrindo o TokenSheet com a definição/análise. `activePosition` realça a palavra
// cujo painel está aberto (estado controlado pelo pai). As superfícies já trazem
// a pontuação aderida (ex.: "λόγος."), então um espaço simples entre tokens
// reproduz a leitura natural — e permite a quebra de linha entre palavras.
export function GreekVerse({
  tokens,
  onSelect,
  activePosition,
}: {
  tokens: Token[];
  onSelect: (t: Token) => void;
  activePosition: number | null;
}) {
  return (
    <span className="font-greek">
      {tokens.map((token, i) => (
        <span key={token.position}>
          {i > 0 && ' '}
          <button
            type="button"
            onClick={() => onSelect(token)}
            className={`inline cursor-pointer rounded px-0.5 transition ${
              activePosition === token.position
                ? 'bg-amber-100 dark:bg-amber-900/40'
                : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            {token.surface}
          </button>
        </span>
      ))}
    </span>
  );
}
