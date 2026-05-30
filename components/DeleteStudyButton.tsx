'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteStudy } from '@/app/study/actions';

// Remove um estudo salvo. Pede confirmação antes (ação destrutiva), chama o
// server action (RLS garante que só o dono apaga) e volta para a lista.
export function DeleteStudyButton({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await deleteStudy(id);
    if (res.ok) {
      router.push('/studies');
      router.refresh();
    } else {
      setBusy(false);
      setConfirming(false);
      setError(res.error ?? 'Falha ao remover.');
    }
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-2">
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
        >
          {busy ? 'Removendo…' : 'Confirmar'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Cancelar
        </button>
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-500 transition hover:border-red-300 hover:text-red-600 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-red-800"
      >
        Remover
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </>
  );
}
