'use client';

/**
 * Painel de FONTES do estudo: lista as fontes anexadas (texto inline ou arquivo),
 * com remoção, e oferece dois formulários — anotação de texto e upload de arquivo.
 *
 * As mutações são server actions; após cada uma chamamos router.refresh() para o
 * server component recarregar o workspace e propagar as fontes atualizadas via props
 * (o estado do chat, mantido no componente pai, sobrevive ao soft refresh).
 */
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addTextSource, addFileSource, removeStudySource } from '@/app/study/actions';
import type { StudySource } from '@/lib/saved-studies';

export function StudySourcesPanel({ studyId, sources }: { studyId: number; sources: StudySource[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<'none' | 'text' | 'file'>('none');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function reset() {
    setMode('none');
    setTitle('');
    setContent('');
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  function submitText() {
    if (!content.trim()) {
      setError('Escreva o conteúdo da anotação.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await addTextSource(studyId, title, content);
      if (res.ok) {
        reset();
        router.refresh();
      } else setError(res.error ?? 'Falha ao salvar a fonte.');
    });
  }

  function submitFile() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('Selecione um arquivo.');
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.append('file', file);
    startTransition(async () => {
      const res = await addFileSource(studyId, fd);
      if (res.ok) {
        reset();
        router.refresh();
      } else setError(res.error ?? 'Falha no upload.');
    });
  }

  function remove(id: number) {
    startTransition(async () => {
      const res = await removeStudySource(id);
      if (res.ok) router.refresh();
      else setError(res.error ?? 'Falha ao remover.');
    });
  }

  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        Fontes ({sources.length})
      </h2>

      {sources.length === 0 ? (
        <p className="text-xs text-neutral-400">Nenhuma fonte anexada ainda.</p>
      ) : (
        <ul className="space-y-1">
          {sources.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-2 rounded-md bg-neutral-100 px-2 py-1 text-xs dark:bg-neutral-800/60"
            >
              <span aria-hidden>{s.kind === 'file' ? '📎' : '📝'}</span>
              <span className="min-w-0 flex-1 truncate" title={s.title}>
                {s.title}
              </span>
              <button
                type="button"
                onClick={() => remove(s.id)}
                disabled={pending}
                aria-label={`Remover ${s.title}`}
                className="shrink-0 text-neutral-400 transition hover:text-red-600 disabled:opacity-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {mode === 'none' && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setMode('text')}
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            + Anotação
          </button>
          <button
            type="button"
            onClick={() => setMode('file')}
            className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            + Arquivo
          </button>
        </div>
      )}

      {mode === 'text' && (
        <div className="mt-2 space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título (opcional)"
            className="w-full rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Cole ou escreva o trecho…"
            rows={4}
            className="w-full resize-y rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submitText}
              disabled={pending}
              className="rounded-md bg-amber-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
            >
              {pending ? 'Salvando…' : 'Salvar'}
            </button>
            <button type="button" onClick={reset} className="rounded-md px-3 py-1 text-xs text-neutral-500">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {mode === 'file' && (
        <div className="mt-2 space-y-2">
          <input
            ref={fileRef}
            type="file"
            className="w-full text-xs text-neutral-600 file:mr-2 file:rounded-md file:border-0 file:bg-neutral-200 file:px-2 file:py-1 file:text-xs dark:text-neutral-300 dark:file:bg-neutral-700"
          />
          <p className="text-[11px] text-neutral-400">Máx. 10 MB. O arquivo fica privado ao seu usuário.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submitFile}
              disabled={pending}
              className="rounded-md bg-amber-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
            >
              {pending ? 'Enviando…' : 'Enviar'}
            </button>
            <button type="button" onClick={reset} className="rounded-md px-3 py-1 text-xs text-neutral-500">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
