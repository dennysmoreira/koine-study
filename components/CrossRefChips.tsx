'use client';

/**
 * Lista de chips das referências relacionadas de uma anotação. Cada chip leva ao
 * comparador na passagem (deep-link ?goto=verseStart). Quando onRemove é passado,
 * mostra o botão de remoção (modo edição).
 */
import Link from 'next/link';
import type { CrossRef } from '@/lib/annotations';

function href(r: CrossRef): string {
  return `/compare/${r.osis}/${r.chapter}?goto=${r.verseStart}`;
}

export function CrossRefChips({ refs, onRemove }: { refs: CrossRef[]; onRemove?: (index: number) => void }) {
  if (refs.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {refs.map((r, i) => (
        <span
          key={`${r.osis}-${r.chapter}-${r.verseStart}-${r.verseEnd}`}
          className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
        >
          <Link href={href(r)} className="transition hover:underline">
            {r.ref}
          </Link>
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label={`Remover ${r.ref}`}
              className="text-amber-500 transition hover:text-red-600"
            >
              ✕
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
