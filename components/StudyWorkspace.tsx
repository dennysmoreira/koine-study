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
 *
 * Layout: a conversa é a coluna principal e o campo de mensagem fica FIXO no rodapé
 * (sticky, acima da BottomNav) — a ação principal está sempre à mão e há um único
 * scroll (sem aninhamento). O material de apoio aparece numa coluna lateral no
 * desktop e, no mobile, num drawer aberto por um chip de contexto junto ao input.
 *
 * A resposta da IA é tratada como DOCUMENTO de leitura (não balão de chat): medida
 * de leitura confortável e realce tipográfico dos títulos de seção, preservando o
 * texto puro gerado pelo modelo.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [panelOpen, setPanelOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const autoAskedRef = useRef(false);

  // Mantém a última mensagem à vista conforme o texto chega (scroll único da página).
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
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

  // Núcleo do streaming: envia um corpo ao chat, acumula o texto e materializa a
  // resposta. O modo espelha a persistência do servidor (1 linha por turno):
  //  - 'send'       → adiciona balão do usuário + nova resposta;
  //  - 'regenerate' → remove a resposta final e a substitui pela nova;
  //  - 'continue'   → remove a resposta final e a recompõe (texto antigo + novo).
  // Em regenerate/continue guardamos um backup da bolha removida para RESTAURÁ-LA se a
  // geração vier vazia/falhar — assim a resposta anterior nunca se perde na UI (espelha
  // o servidor, que só atualiza a linha quando há texto novo).
  async function run(body: Record<string, unknown>, opts: { optimisticUser?: string; mode?: 'send' | 'regenerate' | 'continue' } = {}) {
    if (loading) return;
    const { optimisticUser, mode = 'send' } = opts;
    setError(null);

    let prefix = ''; // continue: texto preservado a anteceder o novo
    let backup: { msg: UiMessage; index: number } | null = null;
    if (mode === 'regenerate' || mode === 'continue') {
      const idx = lastAssistantIdx;
      const target = idx === -1 ? undefined : messages[idx];
      if (target) {
        backup = { msg: target, index: idx };
        if (mode === 'continue') prefix = target.content;
        setMessages((prev) => prev.filter((_, i) => i !== idx));
      }
    }
    if (optimisticUser) {
      setMessages((prev) => [...prev, { id: `local-${Date.now()}`, role: 'user', content: optimisticUser }]);
    }
    setStreaming(prefix);

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    // Junta o texto preservado (continue) ao novo, espelhando o servidor (`base\n novo`).
    const compose = (text: string) => (prefix ? `${prefix}\n${text.trim()}` : text.trim());
    const restoreBackup = () => {
      if (!backup) return;
      setMessages((prev) => {
        const next = [...prev];
        next.splice(Math.min(backup!.index, next.length), 0, backup!.msg);
        return next;
      });
    };

    let acc = '';
    try {
      const res = await fetch('/api/study/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ studyId, ...body }),
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
        setStreaming(prefix ? `${prefix}\n${acc}` : acc);
      }
      if (acc.trim()) {
        setMessages((prev) => [...prev, { id: `asst-${Date.now()}`, role: 'assistant', content: compose(acc) }]);
      } else {
        // Geração vazia: o servidor não tocou na linha-alvo — devolvemos a bolha original.
        restoreBackup();
        setError('A IA não retornou texto. Tente novamente.');
      }
      setStreaming('');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        // Abortado: o servidor já persistiu o parcial. Mantém o parcial se houver;
        // senão, devolve a bolha original (regenerate/continue).
        if (acc.trim()) {
          setMessages((prev) => [...prev, { id: `asst-${Date.now()}`, role: 'assistant', content: compose(acc) }]);
        } else {
          restoreBackup();
        }
        setStreaming('');
      } else {
        restoreBackup(); // falha de rede/servidor: não perde a resposta anterior
        setError(e instanceof Error ? e.message : 'Erro ao conversar.');
        setStreaming('');
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function send() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void sendMessage(text);
  }

  function sendMessage(text: string) {
    return run({ message: text, action: 'send' }, { optimisticUser: text });
  }

  // Refaz a última resposta: substitui a resposta final pela nova, gerada a partir da
  // última pergunta (o servidor atualiza a mesma linha; restauramos se vier vazia).
  function regenerate() {
    if (loading) return;
    void run({ action: 'regenerate' }, { mode: 'regenerate' });
  }

  // Continua a resposta anterior de onde parou (útil quando o texto é cortado): o
  // texto novo é anexado à mesma resposta, mantendo um único turno.
  function continueAnswer() {
    if (loading) return;
    void run({ action: 'continue' }, { mode: 'continue' });
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
  // Índice da última mensagem do assistente (recebe as ações Refazer/Continuar).
  const lastAssistantIdx = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i]?.role === 'assistant') return i;
    return -1;
  }, [messages]);

  const panels = (
    <>
      <StudyReferencesPanel studyId={studyId} references={references} books={books} />
      <StudySourcesPanel studyId={studyId} sources={sources} />
      {!hasContext && (
        <p className="rounded-lg border border-dashed border-neutral-300 px-3 py-2 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          Sem material de apoio, a IA responde só com conhecimento geral. Cite versículos ou anexe fontes para respostas
          fundamentadas.
        </p>
      )}
    </>
  );

  return (
    <div className="lg:grid lg:grid-cols-[1fr_18rem] lg:gap-6">
      {/* Coluna da conversa */}
      <section className="flex flex-col">
        <div
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-label="Conversa do estudo"
          className="flex-1 space-y-6"
        >
          {messages.length === 0 && !streaming && (
            <p className="py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
              Comece a conversa. Cite versículos e anexe fontes para fundamentar as respostas.
            </p>
          )}
          {messages.map((m, i) => (
            <Message
              key={m.id}
              role={m.role}
              content={m.content}
              showActions={m.role === 'assistant'}
              isLastAssistant={i === lastAssistantIdx}
              busy={loading}
              onRegenerate={regenerate}
              onContinue={continueAnswer}
            />
          ))}
          {streaming && <Message role="assistant" content={streaming} streaming />}
          <div ref={endRef} aria-hidden />
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
            {error}
          </p>
        )}

        {/* Barra de entrada FIXA: pinada acima da BottomNav (3.5rem + safe-area). */}
        <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 mt-3 border-t border-neutral-200 bg-white/90 px-4 pb-2 pt-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90 lg:mx-0 lg:rounded-xl lg:border lg:px-3 lg:py-3">
          {/* Chip de contexto (mobile): abre o drawer de fontes/versículos. */}
          <button
            type="button"
            onClick={() => setPanelOpen(true)}
            className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3 py-1 text-xs text-neutral-600 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 lg:hidden"
          >
            <span aria-hidden>📎</span>
            {hasContext
              ? `${sources.length} fonte${sources.length === 1 ? '' : 's'} · ${references.length} versículo${
                  references.length === 1 ? '' : 's'
                }`
              : 'Adicionar fontes e versículos'}
          </button>

          <div className="flex items-end gap-2">
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
                className="min-h-[44px] rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
              >
                Parar
              </button>
            ) : (
              <button
                type="button"
                onClick={send}
                disabled={!draft.trim()}
                className="min-h-[44px] rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-400 disabled:opacity-50"
              >
                Enviar
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Painel de fundamentação — coluna lateral no desktop. */}
      <aside className="hidden space-y-5 self-start text-sm lg:sticky lg:top-4 lg:block">{panels}</aside>

      {/* Drawer de fundamentação — mobile. */}
      {panelOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden" role="dialog" aria-modal="true" aria-label="Material de apoio">
          <button type="button" aria-label="Fechar" onClick={() => setPanelOpen(false)} className="absolute inset-0 bg-black/40" />
          <div className="relative flex max-h-[85dvh] flex-col rounded-t-2xl bg-white shadow-xl dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
              <h2 className="text-sm font-semibold">Material de apoio</h2>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label="Fechar"
                className="flex size-8 items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              >
                ✕
              </button>
            </div>
            <div className="space-y-5 overflow-y-auto px-4 pt-4 text-sm pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)]">
              {panels}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Message({
  role,
  content,
  streaming = false,
  showActions = false,
  isLastAssistant = false,
  busy = false,
  onRegenerate,
  onContinue,
}: {
  role: 'user' | 'assistant';
  content: string;
  streaming?: boolean;
  showActions?: boolean;
  isLastAssistant?: boolean;
  busy?: boolean;
  onRegenerate?: () => void;
  onContinue?: () => void;
}) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-amber-500 px-4 py-2.5 text-[15px] leading-relaxed text-amber-950">
          {content}
        </div>
      </div>
    );
  }

  // Assistente: documento de leitura, não balão.
  return (
    <div>
      <StudyDocument text={content} />
      {!streaming && showActions && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-neutral-400">
          <CopyButton text={content} />
          {isLastAssistant && (
            <>
              <button
                type="button"
                onClick={onRegenerate}
                disabled={busy}
                className="transition hover:text-neutral-600 disabled:opacity-50 dark:hover:text-neutral-200"
              >
                ↻ Refazer
              </button>
              <button
                type="button"
                onClick={onContinue}
                disabled={busy}
                className="transition hover:text-neutral-600 disabled:opacity-50 dark:hover:text-neutral-200"
              >
                ↳ Continuar
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard indisponível — ignora */
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="transition hover:text-neutral-600 dark:hover:text-neutral-200"
    >
      {copied ? 'Copiado ✓' : '⧉ Copiar'}
    </button>
  );
}

type Block = { type: 'section' | 'point' | 'p'; text: string };

// Heurística de heading de seção: linha curta, com letras, toda em CAIXA ALTA
// (ex.: "DELIMITAÇÃO E CONTEXTO", "APLICAÇÃO"). Conservadora para não promover
// conteúdo a título por engano:
//  - exclui linhas com grego/hebraico (são CONTEÚDO do estudo, não título);
//  - exclui linhas que terminam como frase (pontuação final).
function isSectionHeading(line: string): boolean {
  if (line.length > 60) return false;
  if (/[Ͱ-Ͽἀ-῿֐-׿]/.test(line)) return false; // grego/hebraico
  if (/[.,;:!?]$/.test(line)) return false; // termina como frase, não título
  const letters = line.replace(/[^\p{L}]/gu, '');
  if (letters.length < 3) return false;
  return line === line.toUpperCase() && line !== line.toLowerCase();
}

// Heading de ponto numerado: "1. Título…" / "1) Título…", curto e sem pontuação
// terminal (descarta itens de lista que são frases completas).
function isPointHeading(line: string): boolean {
  return /^\d{1,2}[.)]\s+\S/.test(line) && line.length <= 90 && !/[.;:!?]$/.test(line);
}

// Quebra o texto puro do modelo em blocos com hierarquia visual leve, sem
// reinterpretar como Markdown. Parágrafos são separados por linha em branco.
function parseStudyText(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let buf: string[] = [];
  const flush = () => {
    const joined = buf.join('\n').trim();
    if (joined) blocks.push({ type: 'p', text: joined });
    buf = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (isSectionHeading(line)) {
      flush();
      blocks.push({ type: 'section', text: line });
    } else if (isPointHeading(line)) {
      flush();
      blocks.push({ type: 'point', text: line });
    } else {
      buf.push(raw);
    }
  }
  flush();
  return blocks;
}

function StudyDocument({ text }: { text: string }) {
  const blocks = useMemo(() => parseStudyText(text), [text]);
  return (
    <div className="max-w-[68ch] text-[15px] leading-relaxed text-neutral-800 dark:text-neutral-100">
      {blocks.map((b, i) => {
        if (b.type === 'section') {
          return (
            <h3
              key={i}
              className="mb-1.5 mt-6 text-xs font-bold uppercase tracking-wide text-amber-700 first:mt-0 dark:text-amber-400"
            >
              {b.text}
            </h3>
          );
        }
        if (b.type === 'point') {
          return (
            <p key={i} className="mb-1.5 mt-5 font-semibold text-neutral-900 first:mt-0 dark:text-white">
              {b.text}
            </p>
          );
        }
        return (
          <p key={i} className="mb-3 whitespace-pre-wrap break-words last:mb-0">
            {b.text}
          </p>
        );
      })}
    </div>
  );
}
