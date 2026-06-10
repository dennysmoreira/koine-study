'use client';

/**
 * Excluir um plano personalizado (com confirmação em dois toques — exclui o
 * progresso junto, então não pode ser um toque acidental). Só aparece em planos
 * custom; os planos prontos não são removíveis.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteCustomPlan } from '@/app/reading/actions';

export function DeletePlanButton({ planId }: { planId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await deleteCustomPlan(planId);
      if (res.ok) router.push('/reading');
      else setError(res.error ?? 'Falha ao excluir.');
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      {confirming ? (
        <>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            {pending ? 'Excluindo…' : 'Confirmar exclusão'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-sm text-neutral-500 transition hover:text-neutral-700 dark:hover:text-neutral-300"
          >
            Cancelar
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-500 transition hover:border-red-300 hover:text-red-600 dark:border-neutral-700 dark:hover:border-red-900 dark:hover:text-red-400"
        >
          Excluir plano
        </button>
      )}
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </span>
  );
}
