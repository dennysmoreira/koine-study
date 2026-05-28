'use client';

import { useState, useTransition } from 'react';
import type { QueueCard } from '@/lib/vocab';
import type { ReviewGrade } from '@/lib/srs';
import { reviewCard } from '@/app/vocab/actions';

const GRADES: { grade: ReviewGrade; label: string; cls: string }[] = [
  { grade: 'again', label: 'De novo', cls: 'bg-red-600 hover:bg-red-700' },
  { grade: 'hard', label: 'Difícil', cls: 'bg-amber-600 hover:bg-amber-700' },
  { grade: 'good', label: 'Bom', cls: 'bg-emerald-600 hover:bg-emerald-700' },
  { grade: 'easy', label: 'Fácil', cls: 'bg-sky-600 hover:bg-sky-700' },
];

export function VocabSession({ queue }: { queue: QueueCard[] }) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const card = queue[index];

  if (!card) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="text-lg font-medium">Sessão concluída 🎉</p>
        <p className="text-sm text-neutral-500">{done} cartões revisados.</p>
      </div>
    );
  }

  const activeLemmaId = card.lemma_id;

  function grade(g: ReviewGrade) {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const lemmaId = activeLemmaId;
      const res = await reviewCard(lemmaId, g);
      if (!res.ok) {
        setError(res.error ?? 'Erro ao salvar. Tente novamente.');
        return;
      }
      setDone((d) => d + 1);
      setRevealed(false);
      setIndex((i) => i + 1);
    });
  }

  const remaining = queue.length - index;

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-4 text-center text-xs text-neutral-400">
        {remaining} restante{remaining === 1 ? '' : 's'}
        {card.isNew && <span className="ml-2 rounded bg-neutral-200 px-1.5 py-0.5 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">nova</span>}
      </div>

      <button
        type="button"
        onClick={() => setRevealed(true)}
        className="flex flex-1 flex-col items-center justify-center gap-6 rounded-2xl border border-neutral-200 bg-white p-8 text-center dark:border-neutral-800 dark:bg-neutral-900"
      >
        <span className="font-greek text-5xl">{card.lemma}</span>

        {revealed && (
          <div className="flex flex-col gap-2 border-t border-neutral-200 pt-6 dark:border-neutral-800">
            {card.gloss_pt && <span className="text-2xl">{card.gloss_pt}</span>}
            {card.gloss_en && <span className="text-sm text-neutral-500">{card.gloss_en}</span>}
            {card.strongs && <span className="text-xs text-neutral-400">{card.strongs}</span>}
          </div>
        )}

        {!revealed && (
          <span className="text-sm text-neutral-400">Toque para revelar</span>
        )}
      </button>

      {error && <p className="mt-3 text-center text-sm text-red-600 dark:text-red-400">{error}</p>}

      {revealed && (
        <div className="mt-4 grid grid-cols-4 gap-2">
          {GRADES.map(({ grade: g, label, cls }) => (
            <button
              key={g}
              type="button"
              disabled={pending}
              onClick={() => grade(g)}
              className={`rounded-lg px-2 py-3 text-sm font-medium text-white transition active:scale-[0.97] disabled:opacity-60 ${cls}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
