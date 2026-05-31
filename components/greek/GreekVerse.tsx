'use client';

import type { Token } from '@/lib/corpus';
import { glossLabel } from '@/lib/morph-labels';

// Token grego clicável: superfície + glosa abaixo. Realça quando é o token ativo
// (painel aberto). Abre o TokenSheet via `onSelect`.
function TokenChip({
  token,
  onSelect,
  active,
}: {
  token: Token;
  onSelect: (t: Token) => void;
  active: boolean;
}) {
  const gloss = glossLabel(token);
  return (
    <button
      type="button"
      onClick={() => onSelect(token)}
      className={`flex flex-col items-center rounded-md px-1.5 py-1 text-center transition ${
        active ? 'bg-amber-100 dark:bg-amber-900/40' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
      }`}
    >
      <span className="font-greek text-xl leading-tight">{token.surface}</span>
      {gloss && (
        <span className="mt-0.5 max-w-[10ch] truncate text-[11px] leading-tight text-neutral-500">
          {gloss}
        </span>
      )}
    </button>
  );
}

// Renderiza a fila de tokens gregos (interlinear) de UM versículo. Cada token é
// clicável e abre o painel de dados linguísticos. `activePosition` marca qual
// token está com o painel aberto (estado controlado pelo pai).
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
    <span className="flex flex-wrap items-start gap-x-1 gap-y-1">
      {tokens.map((token) => (
        <TokenChip
          key={token.position}
          token={token}
          onSelect={onSelect}
          active={activePosition === token.position}
        />
      ))}
    </span>
  );
}
