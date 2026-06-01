'use client';

/**
 * Barra de ação que aparece quando o usuário seleciona um ou mais versículos no
 * comparador. Dois fluxos:
 *   • "Adicionar a um estudo" → anexa os versículos a um estudo existente (sheet
 *     com a lista) ou cria um novo já com eles citados;
 *   • "Explicar com IA" → cria um estudo com os versículos citados e abre o chat
 *     já pedindo a explicação (autoAsk via querystring).
 *
 * Não toca no Gemini: delega às server actions e navega para o workspace.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createStudy,
  addReferencesToStudy,
  listMyStudies,
  type ReferenceInput,
  type StudyOption,
} from '@/app/study/actions';

export function VerseSelectionBar({
  references,
  bookName,
  chapter,
  onClear,
}: {
  references: ReferenceInput[];
  bookName: string;
  chapter: number;
  onClear: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [picker, setPicker] = useState(false);
  const [studies, setStudies] = useState<StudyOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const count = references.length;
  const defaultTitle = `${bookName} ${chapter}`;

  function openPicker() {
    setError(null);
    setPicker(true);
    setStudies(null);
    startTransition(async () => {
      setStudies(await listMyStudies());
    });
  }

  function addToExisting(studyId: number) {
    setError(null);
    startTransition(async () => {
      const res = await addReferencesToStudy(studyId, references);
      if (res.ok) router.push(`/studies/${studyId}`);
      else setError(res.error ?? 'Falha ao adicionar.');
    });
  }

  function createWith(ask: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await createStudy({
        title: ask ? `Explicação — ${defaultTitle}` : defaultTitle,
        references,
      });
      if (res.ok && res.id) router.push(`/studies/${res.id}${ask ? '?ask=1' : ''}`);
      else setError(res.error ?? 'Falha ao criar o estudo.');
    });
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3">
          <span className="text-sm font-medium">
            {count} versículo{count > 1 ? 's' : ''} selecionado{count > 1 ? 's' : ''}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClear}
              className="rounded-lg px-3 py-2 text-sm text-neutral-500 transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={openPicker}
              disabled={pending}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              Adicionar a um estudo
            </button>
            <button
              type="button"
              onClick={() => createWith(true)}
              disabled={pending}
              className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
            >
              ✨ Explicar com IA
            </button>
          </div>
        </div>
        {error && <p className="mx-auto mt-2 max-w-5xl text-xs text-red-600 dark:text-red-400">{error}</p>}
      </div>

      {picker && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
          <button type="button" aria-label="Fechar" onClick={() => setPicker(false)} className="absolute inset-0 bg-black/40" />
          <div className="relative max-h-[70dvh] overflow-y-auto rounded-t-2xl bg-white p-5 pb-8 shadow-xl dark:bg-neutral-900">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Adicionar {count} versículo{count > 1 ? 's' : ''} a…
            </h2>

            <button
              type="button"
              onClick={() => createWith(false)}
              disabled={pending}
              className="mb-3 w-full rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-60 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100"
            >
              + Criar novo estudo com estes versículos
            </button>

            {studies === null ? (
              <p className="py-4 text-center text-sm text-neutral-400">Carregando…</p>
            ) : studies.length === 0 ? (
              <p className="py-4 text-center text-sm text-neutral-400">Você ainda não tem estudos.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {studies.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => addToExisting(s.id)}
                      disabled={pending}
                      className="w-full truncate rounded-xl border border-neutral-200 px-4 py-3 text-left text-sm transition hover:border-neutral-300 disabled:opacity-60 dark:border-neutral-800 dark:hover:border-neutral-700"
                    >
                      {s.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
