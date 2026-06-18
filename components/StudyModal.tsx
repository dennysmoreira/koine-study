'use client';

/**
 * Modal "Estudo com IA": escolhe um modo (esboço de pregação, exegese, devocional
 * ou pergunta livre), opcionalmente envia uma orientação, e recebe o texto gerado
 * pelo Gemini em STREAMING (token a token) fundamentado no capítulo aberto.
 *
 * O modal não conhece o Gemini: só fala com /api/study e renderiza o stream.
 */
import { useRef, useState } from 'react';
import { STUDY_MODES, getStudyMode, type StudyMode } from '@/lib/study-modes';
import { saveStudy } from '@/app/study/actions';

export function StudyModal({
  osis,
  chapter,
  codes,
  bookName,
  onClose,
}: {
  osis: string;
  chapter: number;
  codes: string[];
  bookName: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<StudyMode>('sermon');
  const [prompt, setPrompt] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const abortRef = useRef<AbortController | null>(null);

  const meta = getStudyMode(mode);

  async function generate() {
    if (loading) return;
    setError(null);
    setOutput('');
    setCopied(false);
    setSaveState('idle');

    if (meta.needsPrompt && !prompt.trim()) {
      setError('Escreva sua pergunta primeiro.');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const res = await fetch('/api/study', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ osis, chapter, codes, mode, prompt }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const msg = await res
          .json()
          .then((j: { error?: string }) => j.error)
          .catch(() => null);
        throw new Error(msg ?? `Falha (HTTP ${res.status}).`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        setOutput((prev) => prev + decoder.decode(value, { stream: true }));
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Erro ao gerar o estudo.');
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
    setLoading(false);
  }

  async function save() {
    if (!output || saveState === 'saving') return;
    setSaveState('saving');
    setError(null);
    const res = await saveStudy({ osis, chapter, bookName, mode, prompt, codes, content: output });
    if (res.ok) {
      setSaveState('saved');
    } else {
      setSaveState('idle');
      setError(res.error ?? 'Falha ao salvar.');
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard indisponível — ignora */
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative flex max-h-[90dvh] w-full flex-col rounded-t-2xl bg-white shadow-xl dark:bg-neutral-900 sm:max-w-2xl sm:rounded-2xl">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Estudo com IA</h2>
            <p className="truncate text-xs text-neutral-400">
              {bookName} {chapter}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)]">
          {/* Modos */}
          <div className="flex flex-wrap gap-2">
            {STUDY_MODES.map((m) => {
              const on = m.key === mode;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
                    on
                      ? 'border-amber-300 bg-amber-50 font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100'
                      : 'border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-600'
                  }`}
                >
                  <span aria-hidden>{m.icon}</span>
                  {m.label}
                </button>
              );
            })}
          </div>

          {/* Campo de orientação / pergunta */}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={meta.placeholder}
            rows={2}
            className="mt-4 w-full resize-y rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />

          {/* Ação */}
          <div className="mt-3 flex items-center gap-2">
            {loading ? (
              <button
                type="button"
                onClick={stop}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Parar
              </button>
            ) : (
              <button
                type="button"
                onClick={generate}
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-400"
              >
                ✨ Gerar
              </button>
            )}
            {output && !loading && (
              <>
                <button
                  type="button"
                  onClick={save}
                  disabled={saveState !== 'idle'}
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-600 transition hover:bg-neutral-100 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  {saveState === 'saved' ? 'Salvo ✓' : saveState === 'saving' ? 'Salvando…' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={copy}
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  {copied ? 'Copiado ✓' : 'Copiar'}
                </button>
              </>
            )}
            {loading && (
              <span className="text-xs text-neutral-400" aria-live="polite">
                Gerando…
              </span>
            )}
          </div>

          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {error}
            </p>
          )}

          {/* Saída (Markdown bruto, legível) */}
          {output && (
            <div className="mt-4 whitespace-pre-wrap break-words rounded-lg bg-neutral-50 px-4 py-3 text-[15px] leading-relaxed dark:bg-neutral-800/50">
              {output}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
