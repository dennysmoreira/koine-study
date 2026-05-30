'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { addToDeck } from '@/app/dictionary/actions';

interface Props {
  lemmaId: number;
  loggedIn: boolean;
  initiallyInDeck: boolean;
}

export function AddToDeckButton({ lemmaId, loggedIn, initiallyInDeck }: Props) {
  const [inDeck, setInDeck] = useState(initiallyInDeck);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!loggedIn) {
    return (
      <Link
        href="/login?next=/dictionary"
        className="inline-flex items-center rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium transition active:scale-[0.98] hover:border-neutral-500 dark:border-neutral-700"
      >
        Entre para adicionar ao baralho
      </Link>
    );
  }

  if (inDeck) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
        ✓ No seu baralho
      </span>
    );
  }

  function add() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const res = await addToDeck(lemmaId);
      if (!res.ok) {
        setError(res.error ?? 'Erro ao adicionar. Tente novamente.');
        return;
      }
      setInDeck(true);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={add}
        className="inline-flex items-center rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-neutral-900"
      >
        {pending ? 'Adicionando…' : '+ Adicionar ao baralho'}
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
