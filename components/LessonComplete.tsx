'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toggleLessonComplete } from '@/app/lessons/actions';

export function LessonComplete({
  lessonId,
  initialCompleted,
  isLoggedIn,
}: {
  lessonId: string;
  initialCompleted: boolean;
  isLoggedIn: boolean;
}) {
  const [completed, setCompleted] = useState(initialCompleted);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!isLoggedIn) {
    return (
      <div className="mt-10 rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-center dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-sm text-neutral-500">Entre para salvar seu progresso nas lições.</p>
        <Link
          href={`/login?next=/lessons/${lessonId}`}
          className="mt-3 inline-block rounded-lg bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white transition active:scale-[0.98] dark:bg-white dark:text-neutral-900"
        >
          Entrar
        </Link>
      </div>
    );
  }

  function toggle() {
    if (pending) return;
    setError(null);
    const next = !completed;
    startTransition(async () => {
      const res = await toggleLessonComplete(lessonId, next);
      if (!res.ok) {
        setError(res.error ?? 'Erro ao salvar. Tente novamente.');
        return;
      }
      setCompleted(next);
    });
  }

  return (
    <div className="mt-10 flex flex-col items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={toggle}
        className={`rounded-lg px-6 py-2.5 text-sm font-medium transition active:scale-[0.98] disabled:opacity-60 ${
          completed
            ? 'border border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
            : 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
        }`}
      >
        {pending ? 'Salvando…' : completed ? '✓ Concluída' : 'Marcar como concluída'}
      </button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
