'use client';

/**
 * Folha de leitura das anotações de um versículo, aberta pelo marcador 📝 no
 * comparador. Mostra o corpo de cada anotação que cobre o versículo, com edição
 * inline e remoção (server actions + router.refresh, já que a página do
 * comparador é force-dynamic e re-busca as anotações). Link para a página
 * dedicada /annotations.
 */
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { annotationLabel, type Annotation, type CrossRef } from '@/lib/annotations';
import { updateAnnotation, deleteAnnotation } from '@/app/annotations/actions';
import { CrossRefPicker } from './CrossRefPicker';
import { CrossRefChips } from './CrossRefChips';

export function AnnotationSheet({
  verse,
  annotations,
  onClose,
}: {
  verse: number;
  annotations: Annotation[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [editRefs, setEditRefs] = useState<CrossRef[]>([]);
  const [pickingRef, setPickingRef] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function startEdit(a: Annotation) {
    setError(null);
    setEditing(a.id);
    setDraft(a.body);
    setEditRefs(a.crossRefs);
    setPickingRef(false);
  }

  function saveEdit(id: number) {
    const body = draft.trim();
    if (!body) {
      setError('Escreva o conteúdo da anotação.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await updateAnnotation(id, body, editRefs);
      if (!res.ok) {
        setError(res.error ?? 'Falha ao salvar.');
        return;
      }
      setEditing(null);
      setPickingRef(false);
      router.refresh();
    });
  }

  function remove(id: number) {
    setError(null);
    startTransition(async () => {
      const res = await deleteAnnotation(id);
      if (res.ok) {
        router.refresh();
        // Fecha se removeu a última anotação do versículo.
        if (annotations.length <= 1) onClose();
      } else {
        setError(res.error ?? 'Falha ao remover.');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative max-h-[75dvh] overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] shadow-xl dark:bg-neutral-900">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden>📝</span> Anotações · versículo {verse}
        </h2>

        <ul className="flex flex-col gap-3">
          {annotations.map((a) => (
            <li
              key={a.id}
              className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"
            >
              <p className="mb-1 text-xs font-medium text-neutral-400">{annotationLabel(a)}</p>
              {editing === a.id ? (
                <>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={4}
                    autoFocus
                    className="w-full resize-y rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-amber-500 dark:border-neutral-700 dark:bg-neutral-800"
                  />
                  <div className="mt-2 space-y-2">
                    {editRefs.length > 0 && (
                      <CrossRefChips
                        refs={editRefs}
                        onRemove={(idx) => setEditRefs((prev) => prev.filter((_, i) => i !== idx))}
                      />
                    )}
                    {pickingRef ? (
                      <CrossRefPicker
                        onAdd={(r) => {
                          setEditRefs((prev) => [...prev, r]);
                          setPickingRef(false);
                        }}
                        onCancel={() => setPickingRef(false)}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPickingRef(true)}
                        className="rounded-lg border border-dashed border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                      >
                        + Referência relacionada
                      </button>
                    )}
                  </div>
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(null);
                        setPickingRef(false);
                      }}
                      className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => saveEdit(a.id)}
                      disabled={pending}
                      className="rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-amber-950 transition hover:bg-amber-400 disabled:opacity-60"
                    >
                      {pending ? 'Salvando…' : 'Salvar'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-700 dark:text-neutral-200">
                    {a.body}
                  </p>
                  {a.crossRefs.length > 0 && (
                    <div className="mt-2">
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Referências</p>
                      <CrossRefChips refs={a.crossRefs} />
                    </div>
                  )}
                  <div className="mt-2 flex gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => startEdit(a)}
                      className="font-medium text-amber-600 transition hover:underline dark:text-amber-400"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(a.id)}
                      disabled={pending}
                      className="text-neutral-400 transition hover:text-red-600 disabled:opacity-50"
                    >
                      Remover
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>

        {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}

        <Link
          href="/annotations"
          className="mt-4 inline-block text-xs font-medium text-neutral-500 transition hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          Ver todas as anotações →
        </Link>
      </div>
    </div>
  );
}
