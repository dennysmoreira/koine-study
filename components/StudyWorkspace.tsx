'use client';

/**
 * Workspace conversacional de um estudo: thread de mensagens (usuário ↔ IA) com
 * resposta em STREAMING, mais painéis de gestão das fontes e dos versículos citados
 * que fundamentam a conversa.
 *
 * O componente não conhece o Gemini: fala apenas com /api/study/chat, que persiste
 * as mensagens e devolve a resposta em stream. Fontes e referências são geridas por
 * painéis-filho (server actions + router.refresh()); o estado do chat aqui mantido
 * sobrevive ao soft refresh.
 */
import { useEffect, useRef, useState } from 'react';
import type { StudyMessage, StudyReference, StudySource } from '@/lib/saved-studies';
import { StudySourcesPanel } from './StudySourcesPanel';
import { StudyReferencesPanel, type BookOption } from './StudyReferencesPanel';

interface UiMessage {
  id: number | string;
  role: 'user' | 'assistant';
  content: string;
}

// Pergunta padrão disparada quando o estudo é aberto via "Explicar com IA" (?ask=1).
const AUTO_ASK_PROMPT =
  'Explique os versículos citados com base no texto original, no léxico e nas referências fornecidas.';

export function StudyWorkspace({
  studyId,
  initialMessages,
  references,
  sources,
  books,
  autoAsk = false,
}: {
  studyId: number;
  initialMessages: StudyMessage[];
  references: StudyReference[];
  sources: StudySource[];
  books: BookOption[];
  autoAsk?: boolean;
}) {
  const [messages, setMessages] = useState<UiMessage[]>(
    initialMessages.map((m) => ({ id: m.id, role: m.role, content: m.content })),
  );
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const autoAskedRef = useRef(false);

  // Mantém a thread rolada para a última mensagem conforme o texto chega.
  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages, streaming]);

  // Auto-pergunta inicial (fluxo "Explicar com IA"): dispara uma única vez, só se
  // o estudo ainda não tem conversa (evita repetir ao recarregar um estudo antigo).
  useEffect(() => {
    if (autoAsk && !autoAskedRef.current && messages.length === 0) {
      autoAskedRef.current = true;
      void sendMessage(AUTO_ASK_PROMPT);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function send() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void sendMessage(text);
  }

  async function sendMessage(text: string) {
    if (!text || loading) return;
    setError(null);
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: 'user', content: text }]);
    setStreaming('');

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    let acc = '';
    try {
      const res = await fetch('/api/study/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ studyId, message: text }),
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
        acc += decoder.decode(value, { stream: true });
        setStreaming(acc);
      }
      // Materializa a resposta final como uma mensagem persistida da thread.
      setMessages((prev) => [...prev, { id: `asst-${Date.now()}`, role: 'assistant', content: acc }]);
      setStreaming('');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        // Mantém o que já foi gerado como mensagem (o servidor já persistiu o parcial).
        if (acc) setMessages((prev) => [...prev, { id: `asst-${Date.now()}`, role: 'assistant', content: acc }]);
        setStreaming('');
      } else {
        setError(e instanceof Error ? e.message : 'Erro ao conversar.');
        setStreaming('');
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  const hasContext = references.length > 0 || sources.length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      {/* Coluna da conversa */}
      <section className="flex min-h-[60dvh] flex-col">
        <div
          ref={threadRef}
          className="flex-1 space-y-4 overflow-y-auto rounded-lg bg-neutral-50 px-4 py-4 dark:bg-neutral-800/40"
        >
          {messages.length === 0 && !streaming && (
            <p className="py-8 text-center text-sm text-neutral-400">
              Comece a conversa. Cite versículos e anexe fontes para fundamentar as respostas.
            </p>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} role={m.role} content={m.content} />
          ))}
          {streaming && <MessageBubble role="assistant" content={streaming} />}
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </p>
        )}

        <div className="mt-3 flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Pergunte, peça correções ou aprofunde o estudo…"
            rows={2}
            disabled={loading}
            className="flex-1 resize-y rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800"
          />
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
              onClick={send}
              disabled={!draft.trim()}
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
            >
              Enviar
            </button>
          )}
        </div>
      </section>

      {/* Painel de fundamentação (somente leitura nesta fase) */}
      <aside className="space-y-5 text-sm">
        <StudyReferencesPanel studyId={studyId} references={references} books={books} />

        <StudySourcesPanel studyId={studyId} sources={sources} />

        {!hasContext && (
          <p className="rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-xs text-neutral-400 dark:border-neutral-700">
            Sem material de apoio, a IA responde só com conhecimento geral. Cite versículos ou anexe fontes para respostas fundamentadas.
          </p>
        )}
      </aside>
    </div>
  );
}

function MessageBubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const isUser = role === 'user';
  return (
    <div className={isUser ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
          isUser
            ? 'bg-amber-500 text-white'
            : 'bg-white text-neutral-800 shadow-sm dark:bg-neutral-800 dark:text-neutral-100'
        }`}
      >
        {content}
      </div>
    </div>
  );
}
