/**
 * Cliente Gemini server-only para GERAÇÃO de texto (streaming).
 *
 * Reaproveita o mesmo provedor/credenciais do ETL (GEMINI_API_KEY[_2..N]), mas
 * focado em texto corrido (não JSON estruturado) e com saída em STREAMING via
 * o endpoint streamGenerateContent?alt=sse — assim o usuário vê o texto surgir
 * em tempo real em vez de esperar o bloco inteiro.
 *
 * A chave NUNCA chega ao cliente: este módulo é server-only e só é importado por
 * Route Handlers / Server Actions.
 */
import 'server-only';

// Modelos de geração, em ordem de preferência. A cadeia é um FAILOVER: o 1º que
// responder 200 é usado; se um devolver 429 (cota diária estourada) ou erro, cai
// para o próximo. O `flash` (melhor qualidade, porém com cota diária menor no free
// tier) vem à frente do `flash-lite` (qualidade boa e cota bem maior): usa-se o
// melhor enquanto dura e degrada graciosamente quando a cota acaba. Os modelos 2.0
// foram desativados pelo Google em 2026-06-01 e por isso saíram da cadeia.
const GEN_MODELS = (
  process.env.GEMINI_GEN_MODELS ??
  'gemini-2.5-flash,gemini-2.5-flash-lite'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Coleta GEMINI_API_KEY + GEMINI_API_KEY_2..N (sequência contígua a partir de 2).
function collectKeys(): string[] {
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

export interface GeminiGenOptions {
  system: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

/**
 * Transforma a resposta SSE do Gemini em um stream de TEXTO puro (UTF-8),
 * extraindo apenas os deltas de texto de cada evento `data:`.
 */
function sseToTextStream(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  // Extrai o delta de texto de uma linha `data:` e o emite no stream de saída.
  const processLine = (controller: ReadableStreamDefaultController<Uint8Array>, line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    try {
      const json = JSON.parse(payload) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) controller.enqueue(encoder.encode(text));
    } catch {
      // evento parcial/keep-alive — ignora
    }
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        // Flush: decodifica o resto e processa a última linha pendente no buffer
        // (o evento final pode não terminar com '\n' e seria perdido).
        buffer += decoder.decode();
        if (buffer.trim()) processLine(controller, buffer);
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      // SSE separa eventos por linha; cada evento de dado começa com "data: ".
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
 * Gera texto em streaming. Tenta as combinações (chave × modelo) até uma
 * CONECTAR (resposta 200); a partir daí faz passthrough do stream. Lança se
 * nenhuma combinação conectar.
 */
export async function streamGeminiText(opts: GeminiGenOptions): Promise<ReadableStream<Uint8Array>> {
  const keys = collectKeys();
  if (keys.length === 0) {
    throw new Error('defina GEMINI_API_KEY no .env (grátis em https://aistudio.google.com/apikey)');
  }

  const temperature = opts.temperature ?? 0.7;
  const maxOutputTokens = opts.maxOutputTokens ?? 8192;

  // Corpo por modelo: nos modelos 2.5 o "thinking" é ligado por padrão e consome
  // o orçamento de saída ANTES do texto visível, truncando a resposta no meio.
  // Como aqui geramos texto corrido (não raciocínio passo-a-passo), desligamos
  // (thinkingBudget: 0) para liberar todo o budget ao conteúdo e acelerar.
  const bodyFor = (model: string): string => {
    const generationConfig: Record<string, unknown> = { temperature, maxOutputTokens };
    if (model.includes('2.5')) {
      generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }
    return JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
      generationConfig,
    });
  };

  let lastErr = '';
  for (const key of keys) {
    for (const model of GEN_MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${key}`;
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: bodyFor(model),
        });
      } catch (e) {
        lastErr = `rede (${model}): ${e instanceof Error ? e.message : String(e)}`;
        continue;
      }
      if (res.ok && res.body) return sseToTextStream(res.body);
      lastErr = `${model} HTTP ${res.status}: ${await res.text().catch(() => '')}`.slice(0, 300);
    }
  }
  throw new Error(`Gemini indisponível. Última falha: ${lastErr}`);
}
