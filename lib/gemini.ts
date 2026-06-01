/**
 * Cliente server-only de GERAÇÃO de texto em STREAMING, com FAILOVER entre
 * provedores e modelos. Ordem das tentativas (a 1ª que conectar — HTTP 200 — é
 * usada e o restante é ignorado):
 *
 *   1. Chave Gemini DO USUÁRIO (BYOK)  × modelos Gemini   → gasta a cota do usuário
 *   2. Chaves Gemini compartilhadas    × modelos Gemini   → rede de segurança 1
 *   3. Chave Groq compartilhada        × modelos Groq      → rede de segurança 2
 *
 * BYOK ("traga sua própria chave") faz cada usuário consumir a própria cota
 * gratuita do Google; o Groq (provedor distinto, formato OpenAI-compat) sobrevive
 * até a uma indisponibilidade global do Google. A chave NUNCA chega ao cliente:
 * este módulo é server-only e só é importado por Route Handlers / Server Actions.
 */
import 'server-only';

type Provider = 'gemini' | 'groq';

interface Attempt {
  provider: Provider;
  key: string;
  model: string;
}

// Modelos Gemini, em ordem de preferência. Cada modelo tem cota diária (RPD)
// INDEPENDENTE no free tier, então listar vários multiplica o teto diário efetivo
// da chave: quando o 1º estoura (HTTP 429), o failover desce para o próximo.
// Ordem: qualidade de ponta (3.5-flash) → cota generosa (3.1-flash-lite, ~500/dia)
// → 2.5 como rede. Os 2.0 foram desativados pelo Google em 2026-06-01.
const GEMINI_MODELS = splitEnv(
  process.env.GEMINI_GEN_MODELS,
  'gemini-3.5-flash,gemini-3.1-flash-lite,gemini-2.5-flash,gemini-2.5-flash-lite',
);

// Modelos Groq (free tier generoso, API OpenAI-compat). 70b para qualidade, 8b
// como degradação rápida quando o 70b está sob limite.
const GROQ_MODELS = splitEnv(
  process.env.GROQ_GEN_MODELS,
  'llama-3.3-70b-versatile,llama-3.1-8b-instant',
);

function splitEnv(value: string | undefined, fallback: string): string[] {
  return (value ?? fallback)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Coleta GEMINI_API_KEY + GEMINI_API_KEY_2..N (sequência contígua a partir de 2).
function collectGeminiKeys(): string[] {
  const keys: string[] = [];
  const base = process.env.GEMINI_API_KEY?.trim();
  if (base) keys.push(base);
  for (let i = 2; ; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`]?.trim();
    if (!k) break;
    keys.push(k);
  }
  return keys;
}

export interface ChatGenOptions {
  system: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  // Chave Gemini do usuário logado (BYOK). Quando presente, é tentada primeiro.
  userGeminiKey?: string | null;
}

/**
 * Monta a cadeia de tentativas (provedor × chave × modelo) na ordem de preferência.
 * Chaves duplicadas (ex.: a do usuário também estar nas compartilhadas) são
 * deduplicadas mantendo a 1ª posição.
 */
function buildAttempts(userGeminiKey?: string | null): Attempt[] {
  const geminiKeys: string[] = [];
  const seen = new Set<string>();
  const pushKey = (k: string | null | undefined) => {
    const t = k?.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      geminiKeys.push(t);
    }
  };
  pushKey(userGeminiKey);
  for (const k of collectGeminiKeys()) pushKey(k);

  const attempts: Attempt[] = [];
  for (const key of geminiKeys) {
    for (const model of GEMINI_MODELS) attempts.push({ provider: 'gemini', key, model });
  }
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqKey) {
    for (const model of GROQ_MODELS) attempts.push({ provider: 'groq', key: groqKey, model });
  }
  return attempts;
}

// ── Requisição por provedor ──────────────────────────────────────────────────

function geminiRequest(a: Attempt, opts: ChatGenOptions, temperature: number, maxTokens: number) {
  const generationConfig: Record<string, unknown> = { temperature, maxOutputTokens: maxTokens };
  // O "thinking" liga por padrão e consome o orçamento de saída ANTES do texto
  // visível, truncando a resposta. Geramos texto corrido — minimizamos por versão:
  //  - 2.5: thinkingBudget = 0 (desliga por completo; param exclusivo dos 2.5).
  //  - 3.x: thinkingLevel = 'minimal' (3.x não desliga de vez; 'minimal' ~ não pensa.
  //         Usar thinkingBudget nos 3.x não é suportado).
  if (a.model.includes('2.5')) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  } else if (/gemini-3/.test(a.model)) {
    generationConfig.thinkingConfig = { thinkingLevel: 'minimal' };
  }
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${a.model}:streamGenerateContent?alt=sse&key=${a.key}`,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
      generationConfig,
    }),
  };
}

function groqRequest(a: Attempt, opts: ChatGenOptions, temperature: number, maxTokens: number) {
  return {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${a.key}` },
    body: JSON.stringify({
      model: a.model,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.prompt },
      ],
      stream: true,
      temperature,
      max_tokens: maxTokens,
    }),
  };
}

// Extrai o delta de texto de um payload SSE já parseado, conforme o provedor.
// Gemini: candidates[0].content.parts[0].text | Groq (OpenAI): choices[0].delta.content
function extractDelta(provider: Provider, json: unknown): string | undefined {
  const j = json as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    choices?: Array<{ delta?: { content?: string } }>;
  };
  if (provider === 'gemini') return j.candidates?.[0]?.content?.parts?.[0]?.text;
  return j.choices?.[0]?.delta?.content;
}

/**
 * Converte a resposta SSE do provedor em um stream de TEXTO puro (UTF-8),
 * emitindo apenas os deltas de texto de cada evento `data:`.
 */
function sseToTextStream(
  upstream: ReadableStream<Uint8Array>,
  provider: Provider,
): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  const processLine = (controller: ReadableStreamDefaultController<Uint8Array>, line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    try {
      const text = extractDelta(provider, JSON.parse(payload));
      if (text) controller.enqueue(encoder.encode(text));
    } catch {
      // evento parcial/keep-alive — ignora
    }
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        // Flush: processa a última linha pendente (o evento final pode não
        // terminar com '\n' e seria perdido).
        buffer += decoder.decode();
        if (buffer.trim()) processLine(controller, buffer);
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // guarda a última linha (possivelmente parcial)
      for (const line of lines) processLine(controller, line);
    },
    cancel(reason) {
      void reader.cancel(reason);
    },
  });
}

/**
 * Gera texto em streaming. Tenta cada (provedor × chave × modelo) até uma
 * CONECTAR (HTTP 200); a partir daí faz passthrough do stream traduzido. Lança
 * se nenhuma combinação conectar (ou se não houver nenhuma chave configurada).
 */
export async function streamChatText(opts: ChatGenOptions): Promise<ReadableStream<Uint8Array>> {
  const attempts = buildAttempts(opts.userGeminiKey);
  if (attempts.length === 0) {
    throw new Error(
      'Nenhuma chave de IA configurada. Cadastre sua chave do Gemini em Configurações, ou defina GEMINI_API_KEY / GROQ_API_KEY no servidor.',
    );
  }

  const temperature = opts.temperature ?? 0.7;
  const maxTokens = opts.maxOutputTokens ?? 8192;

  let lastErr = '';
  for (const a of attempts) {
    const { url, headers, body } =
      a.provider === 'gemini'
        ? geminiRequest(a, opts, temperature, maxTokens)
        : groqRequest(a, opts, temperature, maxTokens);
    let res: Response;
    try {
      res = await fetch(url, { method: 'POST', headers, body });
    } catch (e) {
      lastErr = `rede (${a.provider}/${a.model}): ${e instanceof Error ? e.message : String(e)}`;
      continue;
    }
    if (res.ok && res.body) return sseToTextStream(res.body, a.provider);
    lastErr = `${a.provider}/${a.model} HTTP ${res.status}: ${await res.text().catch(() => '')}`.slice(0, 300);
  }
  throw new Error(`IA indisponível. Última falha: ${lastErr}`);
}
