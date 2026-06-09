'use client';

/**
 * Barra de ação que aparece quando o usuário seleciona um ou mais versículos no
 * comparador. Três fluxos:
 *   • "Anotar" → cria uma anotação pessoal da passagem (sem IA); o versículo passa
 *     a exibir o marcador 📝 no comparador;
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
import { createAnnotation } from '@/app/annotations/actions';
import type { CrossRef } from '@/lib/annotations';
import { CrossRefPicker } from './CrossRefPicker';
import { CrossRefChips } from './CrossRefChips';

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
  const [composing, setComposing] = useState(false);
  const [note, setNote] = useState('');
  const [refs, setRefs] = useState<CrossRef[]>([]);
  const [pickingRef, setPickingRef] = useState(false);

  const count = references.length;
  const defaultTitle = `${bookName} ${chapter}`;

  // Faixa da seleção: 1º e último versículos (a anotação cobre min..max). A lista
  // já vem ordenada por versículo do comparador.
  // Invariante: a barra só é renderizada com 1+ versículos selecionados (ver
  // Comparator) e a seleção é sempre dentro de UM capítulo, então min..max é seguro.
  const verses = references.map((r) => r.verse);
  const verseStart = Math.min(...verses);
  const verseEnd = Math.max(...verses);
  const rangeLabel = verseStart === verseEnd ? `${verseStart}` : `${verseStart}-${verseEnd}`;

  function saveAnnotation() {
    const body = note.trim();
    if (!body) {
      setError('Escreva o conteúdo da anotação.');
      return;
    }
    const first = references[0];
    if (!first) return;
    setError(null);
    startTransition(async () => {
      const res = await createAnnotation({
        osis: first.osis,
        bookName: first.bookName,
        chapter: first.chapter,
        verseStart,
        verseEnd,
        body,
        crossRefs: refs,
      });
      if (res.ok) {
        setNote('');
        setRefs([]);
        setPickingRef(false);
        setComposing(false);
        onClear();
        router.refresh();
      } else {
        setError(res.error ?? 'Falha ao salvar a anotação.');
      }
    });
  }

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
      <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3">
          <span className="text-sm font-medium">
            {count} versículo{count > 1 ? 's' : ''} selecionado{count > 1 ? 's' : ''}
          </span>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClear}
              className="min-h-[44px] rounded-lg px-3 py-2 text-sm text-neutral-500 transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setComposing((c) => !c);
              }}
              disabled={pending}
              aria-pressed={composing}
              className="min-h-[44px] rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-200 disabled:opacity-60 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            >
              <span aria-hidden>✍️</span> Anotar
            </button>
            <button
              type="button"
              onClick={openPicker}
              disabled={pending}
              className="min-h-[44px] rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-200 disabled:opacity-60 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            >
              Adicionar a um estudo
            </button>
            <button
              type="button"
              onClick={() => createWith(true)}
              disabled={pending}
              className="min-h-[44px] rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-400 disabled:opacity-60"
            >
              <span aria-hidden>✨</span> Explicar com IA
            </button>
          </div>
        </div>
        {composing && (
          <div className="mx-auto mt-3 w-full max-w-5xl">
            <label className="mb-1 block text-xs font-medium text-neutral-500">
              Sua anotação · {bookName} {chapter}:{rangeLabel}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Escreva sua observação sobre esta passagem…"
              rows={3}
              autoFocus
              className="w-full resize-y rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-amber-500 dark:border-neutral-700 dark:bg-neutral-900"
            />

            <div className="mt-2 space-y-2">
              {refs.length > 0 && (
                <CrossRefChips refs={refs} onRemove={(i) => setRefs((prev) => prev.filter((_, idx) => idx !== i))} />
              )}
              {pickingRef ? (
                <CrossRefPicker
                  onAdd={(r) => {
                    setRefs((prev) => [...prev, r]);
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
                  setComposing(false);
                  setNote('');
                  setRefs([]);
                  setPickingRef(false);
                  setError(null);
                }}
                className="rounded-lg px-3 py-1.5 text-sm text-neutral-500 transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveAnnotation}
                disabled={pending}
                className="min-h-[44px] rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-amber-950 transition hover:bg-amber-400 disabled:opacity-60"
              >
                {pending ? 'Salvando…' : 'Salvar anotação'}
              </button>
            </div>
          </div>
        )}
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
