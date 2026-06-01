'use client';

/**
 * Botão "Novo estudo": cria um workspace conversacional vazio via server action e
 * navega direto para ele. O título e o material (versículos/fontes) são definidos
 * dentro do estudo.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createStudy } from '@/app/study/actions';

export function NewStudyButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function create() {
    setError(null);
    startTransition(async () => {
      const res = await createStudy({});
      if (res.ok && res.id) router.push(`/studies/${res.id}`);
      else setError(res.error ?? 'Falha ao criar o estudo.');
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={create}
        disabled={pending}
        className={
          className ??
          'rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60'
        }
      >
        {pending ? 'Criando…' : '+ Novo estudo'}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
