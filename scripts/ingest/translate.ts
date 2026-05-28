/**
 * Passo `translate` da ingestão: traduz as glosas do léxico EN -> PT (PT-BR).
 *
 * Lê data/build/lemmas.json, traduz gloss_en -> gloss_pt em lote via LLM e:
 *   1. salva um cache resumível em data/build/lemmas.pt.json (id -> gloss_pt);
 *   2. aplica gloss_pt em public.lemmas no Supabase (se SUPABASE_* presentes).
 *
 * Provider configurável por TRANSLATE_PROVIDER (gemini | anthropic).
 *   - gemini    -> camada gratuita (https://aistudio.google.com/apikey); GEMINI_API_KEY
 *   - anthropic -> pago; ANTHROPIC_API_KEY
 *
 * É idempotente e resumível: lemas já no cache são pulados; o cache é gravado
 * a cada lote, então uma interrupção (rate limit, queda) não perde progresso.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

interface LemmaRow {
  id: number;
  gloss_en: string | null;
  frequency: number;
}

type TranslateFn = (texts: string[]) => Promise<string[]>;
interface Translator { name: string; model: string; fn: TranslateFn }

const BATCH = Number(process.env.TRANSLATE_BATCH ?? 100); // lotes maiores = menos requisições (útil no free tier de 20 req/dia)
const UPDATE_CONCURRENCY = 8;
const SLEEP_MS = Number(process.env.TRANSLATE_SLEEP_MS ?? 7000); // ~8,5 req/min: respeita o free tier do Gemini 2.5-flash (10 RPM)

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// faz fetch com retry/backoff em erros transientes (429 rate limit, 5xx sobrecarga)
async function requestWithRetry(doFetch: () => Promise<Response>, label: string, maxRetries = 6): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await doFetch();
    if (res.ok) return res;
    const retriable = [429, 500, 502, 503, 504].includes(res.status);
    const body = await res.text();
    // 429 por cota DIÁRIA: esperar não resolve — falha imediata para o chamador parar e aplicar o parcial
    if (res.status === 429 && /PerDay/i.test(body)) {
      throw new Error(`${label} cota diária do free tier esgotada (HTTP 429)`);
    }
    if (!retriable || attempt >= maxRetries) throw new Error(`${label} HTTP ${res.status}: ${body}`);
    const m = body.match(/"retryDelay":\s*"(\d+)(?:\.\d+)?s"/);
    const wait = m?.[1] ? Number(m[1]) * 1000 + 1000 : Math.min(64000, 2 ** attempt * 1000);
    process.stdout.write(`\n  ${label} ${res.status}; retry ${attempt + 1}/${maxRetries} em ${Math.round(wait / 1000)}s\n`);
    await sleep(wait);
  }
}

// ── prompt e parsing (compartilhados entre providers) ───────────────────
function buildPrompt(texts: string[]): string {
  return [
    'Você é um tradutor especializado em léxico de grego koiné bíblico.',
    'Traduza para português (PT-BR) cada glosa lexical do array JSON a seguir.',
    'Regras:',
    '- Preserve o sentido lexical/teológico e mantenha conciso (estilo de dicionário).',
    '- Não adicione explicações, comentários nem numeração.',
    '- Responda APENAS com um array JSON de strings, na MESMA ordem e tamanho da entrada.',
    '',
    'Entrada:',
    JSON.stringify(texts),
  ].join('\n');
}

// extrai o primeiro array JSON balanceado, ignorando cercas de código e lixo após o array
function extractFirstArray(text: string): string {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) t = fence[1].trim();
  const start = t.indexOf('[');
  if (start === -1) throw new Error('sem array JSON na resposta');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '[') depth++;
    else if (ch === ']' && --depth === 0) return t.slice(start, i + 1);
  }
  throw new Error('array JSON não fechado na resposta');
}

function parseArray(text: string, expected: number): string[] {
  const arr: unknown = JSON.parse(extractFirstArray(text));
  if (!Array.isArray(arr) || arr.length !== expected) {
    throw new Error(`resposta inesperada: ${Array.isArray(arr) ? `${arr.length} itens` : 'não é array'} (esperado ${expected})`);
  }
  return arr.map((x) => String(x).trim());
}

// ── providers ───────────────────────────────────────────────────────────
function makeGemini(): Translator {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('defina GEMINI_API_KEY no .env (grátis em https://aistudio.google.com/apikey)');
  const model = process.env.TRANSLATE_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const fn: TranslateFn = async (texts) => {
    const res = await requestWithRetry(() => fetch(`${url}?key=${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(texts) }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
      }),
    }), 'Gemini');
    const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return parseArray(text, texts.length);
  };
  return { name: 'gemini', model, fn };
}

function makeAnthropic(): Translator {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('defina ANTHROPIC_API_KEY no .env');
  const model = process.env.TRANSLATE_MODEL || 'claude-haiku-4-5-20251001';
  const fn: TranslateFn = async (texts) => {
    const res = await requestWithRetry(() => fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: 'user', content: buildPrompt(texts) }] }),
    }), 'Anthropic');
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    const text = data.content?.[0]?.text ?? '';
    return parseArray(text, texts.length);
  };
  return { name: 'anthropic', model, fn };
}

function getTranslator(): Translator {
  const provider = (process.env.TRANSLATE_PROVIDER ?? 'gemini').toLowerCase();
  if (provider === 'gemini') return makeGemini();
  if (provider === 'anthropic') return makeAnthropic();
  throw new Error(`TRANSLATE_PROVIDER inválido: "${provider}" (use gemini | anthropic)`);
}

// ── concorrência limitada para os UPDATEs no Supabase ───────────────────
async function pMap<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const cur = items[i++];
      if (cur !== undefined) await worker(cur);
    }
  });
  await Promise.all(runners);
}

export async function translate(buildDir: string): Promise<void> {
  const srcPath = join(buildDir, 'lemmas.json');
  if (!existsSync(srcPath)) throw new Error('rode `npm run ingest:build` primeiro');
  const cachePath = join(buildDir, 'lemmas.pt.json');

  const lemmas: LemmaRow[] = JSON.parse(readFileSync(srcPath, 'utf8'));
  const done: Record<string, string> = existsSync(cachePath)
    ? JSON.parse(readFileSync(cachePath, 'utf8'))
    : {};

  // só lemas usados no corpus (frequency>0), com glosa EN, ainda não traduzidos
  const pending = lemmas.filter((l) => l.frequency > 0 && l.gloss_en && !(String(l.id) in done));
  console.log(`lemmas a traduzir: ${pending.length} (em cache: ${Object.keys(done).length})`);

  if (pending.length > 0) {
    const { name, model, fn } = getTranslator();
    console.log(`provider: ${name} (${model}), lote=${BATCH}, intervalo=${SLEEP_MS}ms`);
    try {
      for (let i = 0; i < pending.length; i += BATCH) {
        const chunk = pending.slice(i, i + BATCH);
        const inputs = chunk.map((l) => l.gloss_en as string);
        let out: string[] | undefined;
        for (let r = 0; r < 3; r++) {
          try { out = await fn(inputs); break; }
          catch (e) {
            if (r === 2) throw e;
            process.stdout.write(`\n  lote @${i} inválido (${(e as Error).message}); re-tentando ${r + 1}/2\n`);
            await sleep(2000);
          }
        }
        chunk.forEach((l, j) => { done[String(l.id)] = out![j] ?? ''; });
        writeFileSync(cachePath, JSON.stringify(done), 'utf8'); // checkpoint por lote
        process.stdout.write(`\r  traduzidos: ${Math.min(i + BATCH, pending.length)}/${pending.length}`);
        if (i + BATCH < pending.length && SLEEP_MS > 0) await sleep(SLEEP_MS);
      }
      process.stdout.write('\n');
    } catch (e) {
      // interrupção (ex: cota diária do free tier) não é fatal: progresso está no cache.
      // Segue para aplicar o parcial no banco; reexecute amanhã para concluir.
      process.stdout.write('\n');
      console.warn(`tradução interrompida: ${(e as Error).message}`);
      console.warn(`progresso salvo no cache: ${Object.keys(done).length} de ${Object.keys(done).length + pending.length} lemas. Reexecute para retomar.`);
    }
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log(`SUPABASE_* ausentes: ${Object.keys(done).length} traduções salvas em lemmas.pt.json (não aplicadas ao banco).`);
    return;
  }

  // aplica gloss_pt por id (UPDATE é idempotente); concorrência limitada
  const client = createClient(url, key, { auth: { persistSession: false } });
  const entries = Object.entries(done);
  let applied = 0;
  await pMap(entries, UPDATE_CONCURRENCY, async ([id, gloss]) => {
    const { error } = await (client.from('lemmas') as any).update({ gloss_pt: gloss }).eq('id', Number(id));
    if (error) throw new Error(`update lemma ${id}: ${error.message}`);
    if (++applied % 100 === 0) process.stdout.write(`\r  aplicados no banco: ${applied}/${entries.length}`);
  });
  process.stdout.write(`\r  aplicados no banco: ${applied}/${entries.length}\n`);
  console.log('glosas PT aplicadas ao Supabase.');
}
