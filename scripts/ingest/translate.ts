/**
 * Passo `translate` da ingestão: traduz as glosas do léxico EN -> PT (PT-BR).
 *
 * Lê data/build/lemmas.json, traduz gloss_en -> gloss_pt em lote via LLM e:
 *   1. salva um cache resumível em data/build/lemmas.pt.json (Strong's -> gloss_pt);
 *   2. aplica gloss_pt em public.lemmas no Supabase, por Strong's (se SUPABASE_* presentes).
 *
 * Provider configurável por TRANSLATE_PROVIDER (gemini | anthropic).
 *   - gemini    -> camada gratuita (https://aistudio.google.com/apikey); GEMINI_API_KEY
 *   - anthropic -> pago; ANTHROPIC_API_KEY
 *
 * É idempotente e resumível: lemas já no cache são pulados; o cache é gravado
 * a cada lote, então uma interrupção (rate limit, queda) não perde progresso.
 *
 * Execute os passos de tradução SERIALMENTE (um --step por vez). translate-lexicon
 * e localize-refs ambos escrevem lemmas.abbott_smith por Strong's; rodá-los em
 * paralelo pode fazer uma escrita obsoleta sobrescrever uma mais nova.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { lemmaIdsByStrongs } from './supabase-io.ts';

interface LemmaRow {
  id: number;
  strongs: string | null;
  gloss_en: string | null;
  abbott_smith: string | null;
  frequency: number;
}

interface LexiconEntryRow { strongs: string; source: string; text_en: string; sort_order: number }

type TranslateFn = (texts: string[]) => Promise<string[]>;
interface Translator { name: string; model: string; fn: TranslateFn }

const BATCH = Number(process.env.TRANSLATE_BATCH ?? 100); // lotes maiores = menos requisições (útil no free tier de 20 req/dia)
const LEXICON_BATCH = Number(process.env.TRANSLATE_LEXICON_BATCH ?? 10); // Abbott-Smith: entradas longas -> lotes menores p/ não estourar o output
// LSJ: entradas variam de ~200B a ~16KB. Lote por conta de caracteres (não de
// itens), senão um punhado de entradas longas estoura o output do modelo (Anthropic
// max_tokens=8192). Orçamento conservador (~4k chars de ENTRADA por lote) deixa
// folga p/ a saída PT, normalmente maior que o original.
const LSJ_CHARS = Number(process.env.TRANSLATE_LSJ_CHARS ?? 4000);
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

// ── prompts e parsing (compartilhados entre providers) ──────────────────
type PromptBuilder = (texts: string[]) => string;

// glosas curtas (Dodson): tradução concisa estilo dicionário
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

// entradas longas (Abbott-Smith): traduz só o texto explicativo, preservando
// grego, hebraico, referências bíblicas e a estrutura da entrada.
function buildLexiconPrompt(texts: string[]): string {
  return [
    'Você é um tradutor especializado em léxicos de grego koiné bíblico (Abbott-Smith).',
    'Traduza para português (PT-BR) cada ENTRADA lexical do array JSON a seguir.',
    'Regras OBRIGATÓRIAS:',
    '- Preserve EXATAMENTE todo o texto em grego e hebraico (não translitere, não traduza as palavras gregas/hebraicas).',
    '- Preserve referências bíblicas e versículos como estão (ex.: "Lk 7:37", "Mt 3:7", "al.").',
    '- Traduza apenas o texto explicativo em inglês: definições, descrições gramaticais e notas.',
    '- Mantenha abreviações gramaticais naturais em PT quando claras (ex.: "c. dat." → "c. dat.", "prep" → "prep.").',
    '- Mantenha o estilo de dicionário (conciso); preserve a ordem e a pontuação estrutural da entrada.',
    '- Não adicione comentários, títulos nem numeração.',
    '- Responda APENAS com um array JSON de strings, na MESMA ordem e tamanho da entrada.',
    '',
    'Entrada:',
    JSON.stringify(texts),
  ].join('\n');
}

// entradas LSJ (STEPBible TFLSJ): texto longo com grego clássico, marcadores de
// sentido (__1, __II, __b), referências de autores antigos e quebras de linha
// estruturais. Traduz só o texto explicativo, preservando tudo o que dá estrutura.
function buildLsjPrompt(texts: string[]): string {
  return [
    'Você é um tradutor especializado no léxico grego clássico/koiné Liddell-Scott-Jones (LSJ).',
    'Traduza para português (PT-BR) cada ENTRADA lexical do array JSON a seguir.',
    'Regras OBRIGATÓRIAS:',
    '- Preserve EXATAMENTE todo o texto em grego (não translitere, não traduza as palavras gregas).',
    '- Preserve EXATAMENTE os marcadores de estrutura/sentido como aparecem (ex.: "__1", "__II", "__b", "A.", "II.").',
    '- Preserve as quebras de linha (\\n) na MESMA posição: a estrutura da entrada depende delas.',
    '- Preserve referências a autores e obras antigas e referências bíblicas como estão (ex.: "Hom.", "Il.9.5", "Lk 7:37").',
    '- Traduza apenas o texto explicativo em inglês: definições, descrições gramaticais e notas.',
    '- Mantenha o estilo de dicionário (conciso); não expanda nem resuma.',
    '- Não adicione comentários, títulos nem numeração própria.',
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
  // rejeita elementos não-string (null/objeto) — String(x) viraria "null"/"[object Object]"
  // e seria persistido como "tradução". Força re-tentativa do lote.
  return arr.map((x, i) => {
    if (typeof x !== 'string') throw new Error(`elemento ${i} não é string (${typeof x})`);
    return x.trim();
  });
}

// ── providers ───────────────────────────────────────────────────────────
function makeGemini(prompt: PromptBuilder): Translator {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('defina GEMINI_API_KEY no .env (grátis em https://aistudio.google.com/apikey)');
  const model = process.env.TRANSLATE_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const fn: TranslateFn = async (texts) => {
    const res = await requestWithRetry(() => fetch(`${url}?key=${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt(texts) }] }],
        // maxOutputTokens alto evita truncar lotes de entradas longas (Abbott-Smith)
        generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 65536, thinkingConfig: { thinkingBudget: 0 } },
      }),
    }), 'Gemini');
    const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return parseArray(text, texts.length);
  };
  return { name: 'gemini', model, fn };
}

function makeAnthropic(prompt: PromptBuilder): Translator {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('defina ANTHROPIC_API_KEY no .env');
  const model = process.env.TRANSLATE_MODEL || 'claude-haiku-4-5-20251001';
  const fn: TranslateFn = async (texts) => {
    const res = await requestWithRetry(() => fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 8192, messages: [{ role: 'user', content: prompt(texts) }] }),
    }), 'Anthropic');
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    const text = data.content?.[0]?.text ?? '';
    return parseArray(text, texts.length);
  };
  return { name: 'anthropic', model, fn };
}

function getTranslator(prompt: PromptBuilder): Translator {
  const provider = (process.env.TRANSLATE_PROVIDER ?? 'gemini').toLowerCase();
  if (provider === 'gemini') return makeGemini(prompt);
  if (provider === 'anthropic') return makeAnthropic(prompt);
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

  // só lemas usados no corpus (frequency>0), com glosa EN e Strong's, ainda não traduzidos.
  // Chave de cache = Strong's (estável entre rebuilds); lemmas.id é identity volátil.
  const pending = lemmas.filter((l) => l.frequency > 0 && l.gloss_en && l.strongs && !(l.strongs in done));
  console.log(`lemmas a traduzir: ${pending.length} (em cache: ${Object.keys(done).length})`);

  if (pending.length > 0) {
    const { name, model, fn } = getTranslator(buildPrompt);
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
        // não cacheia vazios: ficam pendentes p/ re-tentar na próxima execução (auto-recuperável)
        chunk.forEach((l, j) => { const t = out![j]; if (t) done[l.strongs as string] = t; });
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

  // aplica gloss_pt por Strong's (UPDATE idempotente, sobrevive a rebuilds); concorrência limitada
  const client = createClient(url, key, { auth: { persistSession: false } });
  const entries = Object.entries(done).filter(([, gloss]) => gloss); // pula traduções vazias
  let applied = 0;
  await pMap(entries, UPDATE_CONCURRENCY, async ([strongs, gloss]) => {
    const { error } = await (client.from('lemmas') as any).update({ gloss_pt: gloss }).eq('strongs', strongs);
    if (error) throw new Error(`update lemma ${strongs}: ${error.message}`);
    if (++applied % 100 === 0) process.stdout.write(`\r  aplicados no banco: ${applied}/${entries.length}`);
  });
  process.stdout.write(`\r  aplicados no banco: ${applied}/${entries.length}\n`);
  console.log('glosas PT aplicadas ao Supabase.');
}

/**
 * Traduz as entradas do léxico Abbott-Smith (EN -> PT-BR) e SOBRESCREVE a coluna
 * abbott_smith no Supabase. Espelha translate() mas com:
 *   - prompt específico de léxico (preserva grego/hebraico/referências);
 *   - lotes menores (entradas longas);
 *   - cache resumível próprio em data/build/abbott.pt.json (Strong's -> texto PT).
 *
 * Idempotente/resumível: lemas já no cache são pulados; reexecuta a partir do
 * cache (interrupção por cota diária não perde progresso). A entrada vem do
 * abbott_smith (EN) de lemmas.json, então rode após `ingest:build`.
 */
export async function translateLexicon(buildDir: string, limit?: number): Promise<void> {
  const srcPath = join(buildDir, 'lemmas.json');
  if (!existsSync(srcPath)) throw new Error('rode `npm run ingest:build` primeiro');
  const cachePath = join(buildDir, 'abbott.pt.json');

  const lemmas: LemmaRow[] = JSON.parse(readFileSync(srcPath, 'utf8'));
  const done: Record<string, string> = existsSync(cachePath)
    ? JSON.parse(readFileSync(cachePath, 'utf8'))
    : {};

  // só lemas usados no corpus (frequency>0), com entrada Abbott-Smith, não traduzidos.
  // Ordena por frequência desc para, em runs limitados (--limit), priorizar as
  // palavras mais comuns do NT. limit>0 corta o lote desta execução (útil no free tier).
  let pending = lemmas
    .filter((l) => l.frequency > 0 && l.abbott_smith && l.strongs && !(l.strongs in done))
    .sort((a, b) => b.frequency - a.frequency);
  if (limit && limit > 0) pending = pending.slice(0, limit);
  console.log(`entradas Abbott-Smith a traduzir: ${pending.length} (em cache: ${Object.keys(done).length})`);

  if (pending.length > 0) {
    const { name, model, fn } = getTranslator(buildLexiconPrompt);
    console.log(`provider: ${name} (${model}), lote=${LEXICON_BATCH}, intervalo=${SLEEP_MS}ms`);
    try {
      for (let i = 0; i < pending.length; i += LEXICON_BATCH) {
        const chunk = pending.slice(i, i + LEXICON_BATCH);
        const inputs = chunk.map((l) => l.abbott_smith as string);
        let out: string[] | undefined;
        for (let r = 0; r < 3; r++) {
          try { out = await fn(inputs); break; }
          catch (e) {
            if (r === 2) throw e;
            process.stdout.write(`\n  lote @${i} inválido (${(e as Error).message}); re-tentando ${r + 1}/2\n`);
            await sleep(2000);
          }
        }
        // não cacheia vazios: ficam pendentes p/ re-tentar na próxima execução (auto-recuperável)
        chunk.forEach((l, j) => { const t = out![j]; if (t) done[l.strongs as string] = t; });
        writeFileSync(cachePath, JSON.stringify(done), 'utf8'); // checkpoint por lote
        process.stdout.write(`\r  traduzidos: ${Math.min(i + LEXICON_BATCH, pending.length)}/${pending.length}`);
        if (i + LEXICON_BATCH < pending.length && SLEEP_MS > 0) await sleep(SLEEP_MS);
      }
      process.stdout.write('\n');
    } catch (e) {
      process.stdout.write('\n');
      console.warn(`tradução interrompida: ${(e as Error).message}`);
      console.warn(`progresso salvo no cache: ${Object.keys(done).length} de ${Object.keys(done).length + pending.length} entradas. Reexecute para retomar.`);
    }
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log(`SUPABASE_* ausentes: ${Object.keys(done).length} traduções salvas em abbott.pt.json (não aplicadas ao banco).`);
    return;
  }

  // sobrescreve abbott_smith por Strong's (UPDATE idempotente, sobrevive a rebuilds); concorrência limitada
  const client = createClient(url, key, { auth: { persistSession: false } });
  const entries = Object.entries(done).filter(([, text]) => text); // pula traduções vazias
  let applied = 0;
  await pMap(entries, UPDATE_CONCURRENCY, async ([strongs, text]) => {
    const { error } = await (client.from('lemmas') as any).update({ abbott_smith: text }).eq('strongs', strongs);
    if (error) throw new Error(`update lemma ${strongs}: ${error.message}`);
    if (++applied % 100 === 0) process.stdout.write(`\r  aplicados no banco: ${applied}/${entries.length}`);
  });
  process.stdout.write(`\r  aplicados no banco: ${applied}/${entries.length}\n`);
  console.log('Abbott-Smith PT aplicado ao Supabase.');
}

/**
 * Traduz as entradas LSJ (EN -> PT-BR) e aplica em public.lexicon_entries.text_pt
 * (source='lsj'). Espelha translateLexicon mas com:
 *   - prompt específico de LSJ (preserva grego, marcadores de sentido e quebras);
 *   - lotes por ORÇAMENTO DE CARACTERES (LSJ_CHARS) — entradas variam 200B–16KB,
 *     então lote por contagem fixa estouraria o output do modelo;
 *   - cache resumível próprio em data/build/lsj.pt.json (Strong's -> texto PT).
 *
 * O cache é a ÚNICA fonte de resumabilidade: a etapa de apply relê o cache, não o
 * banco. Apagar lsj.pt.json força re-traduzir o corpus inteiro (~5,6k entradas =
 * dias de free tier). Preserve-o entre execuções; é git-ignorado (data/build/).
 *
 * Entrada: data/build/lexicon-entries.json (source='lsj') + lemmas.json (frequência,
 * para priorizar as palavras mais comuns do NT em runs --limit). Aplica resolvendo
 * Strong's -> lemma_id(s) contra o corpus carregado (homógrafos: fan-out p/ vários ids).
 */
export async function translateLexiconEntries(buildDir: string, limit?: number): Promise<void> {
  const entriesPath = join(buildDir, 'lexicon-entries.json');
  const lemmasPath = join(buildDir, 'lemmas.json');
  if (!existsSync(entriesPath)) throw new Error('rode `npm run ingest:build-lexicons` primeiro');
  if (!existsSync(lemmasPath)) throw new Error('rode `npm run ingest:build` primeiro');
  const cachePath = join(buildDir, 'lsj.pt.json');

  const entries: LexiconEntryRow[] = JSON.parse(readFileSync(entriesPath, 'utf8'));
  const lemmas: LemmaRow[] = JSON.parse(readFileSync(lemmasPath, 'utf8'));
  const done: Record<string, string> = existsSync(cachePath)
    ? JSON.parse(readFileSync(cachePath, 'utf8'))
    : {};

  // frequência por Strong's (do corpus do NT) p/ priorizar as palavras mais comuns.
  const freq = new Map<string, number>();
  for (const l of lemmas) if (l.strongs) freq.set(l.strongs, (freq.get(l.strongs) ?? 0) + l.frequency);

  // só LSJ usadas no NT (frequency>0), com texto EN, ainda não traduzidas.
  // Ordena por frequência desc: em runs --limit, prioriza o vocabulário do NT.
  let pending = entries
    .filter((e) => e.source === 'lsj' && e.text_en && (freq.get(e.strongs) ?? 0) > 0 && !(e.strongs in done))
    .sort((a, b) => (freq.get(b.strongs) ?? 0) - (freq.get(a.strongs) ?? 0));
  if (limit && limit > 0) pending = pending.slice(0, limit);
  console.log(`entradas LSJ a traduzir: ${pending.length} (em cache: ${Object.keys(done).length})`);

  if (pending.length > 0) {
    const { name, model, fn } = getTranslator(buildLsjPrompt);
    console.log(`provider: ${name} (${model}), orçamento=${LSJ_CHARS} chars/lote, intervalo=${SLEEP_MS}ms`);
    // lotes por orçamento de caracteres. Invariante: um lote só ultrapassa LSJ_CHARS
    // quando contém UMA única entrada que sozinha já excede o orçamento (inevitável).
    // O guard explícito de "entrada grande sozinha" garante isso: sem ele, uma entrada
    // de 16KB poderia ancorar um lote e ainda receber a próxima, dobrando o input.
    const batches: LexiconEntryRow[][] = [];
    let cur: LexiconEntryRow[] = [];
    let curChars = 0;
    for (const e of pending) {
      const len = e.text_en.length;
      if (cur.length > 0 && curChars + len > LSJ_CHARS) { batches.push(cur); cur = []; curChars = 0; }
      if (len > LSJ_CHARS) { batches.push([e]); continue; } // maior que o orçamento -> lote próprio
      cur.push(e);
      curChars += len;
    }
    if (cur.length > 0) batches.push(cur);

    try {
      let translated = 0;
      for (let b = 0; b < batches.length; b++) {
        const chunk = batches[b]!;
        const inputs = chunk.map((e) => e.text_en);
        let out: string[] | undefined;
        for (let r = 0; r < 3; r++) {
          try { out = await fn(inputs); break; }
          catch (e) {
            if (r === 2) throw e;
            process.stdout.write(`\n  lote ${b} inválido (${(e as Error).message}); re-tentando ${r + 1}/2\n`);
            await sleep(2000);
          }
        }
        // não cacheia vazios: ficam pendentes p/ re-tentar na próxima execução (auto-recuperável)
        chunk.forEach((e, j) => { const t = out![j]; if (t) done[e.strongs] = t; });
        writeFileSync(cachePath, JSON.stringify(done), 'utf8'); // checkpoint por lote
        translated += chunk.length;
        process.stdout.write(`\r  traduzidos: ${translated}/${pending.length}`);
        if (b + 1 < batches.length && SLEEP_MS > 0) await sleep(SLEEP_MS);
      }
      process.stdout.write('\n');
    } catch (e) {
      process.stdout.write('\n');
      console.warn(`tradução interrompida: ${(e as Error).message}`);
      console.warn(`progresso salvo no cache: ${Object.keys(done).length} entradas. Reexecute para retomar.`);
    }
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log(`SUPABASE_* ausentes: ${Object.keys(done).length} traduções salvas em lsj.pt.json (não aplicadas ao banco).`);
    return;
  }

  // aplica text_pt por Strong's -> lemma_id(s), source='lsj' (idempotente); concorrência limitada
  const client = createClient(url, key, { auth: { persistSession: false } });
  const byStrongs = await lemmaIdsByStrongs(client);
  const cached = Object.entries(done).filter(([, text]) => text); // pula vazios
  let applied = 0;
  let noLemma = 0;
  await pMap(cached, UPDATE_CONCURRENCY, async ([strongs, text]) => {
    const ids = byStrongs.get(strongs);
    if (!ids) { noLemma++; return; }
    const { error } = await (client.from('lexicon_entries') as any)
      .update({ text_pt: text }).in('lemma_id', ids).eq('source', 'lsj');
    if (error) throw new Error(`update lexicon_entries ${strongs}: ${error.message}`);
    if (++applied % 100 === 0) process.stdout.write(`\r  aplicados no banco: ${applied}/${cached.length}`);
  });
  process.stdout.write(`\r  aplicados no banco: ${applied}/${cached.length}\n`);
  if (noLemma > 0) console.warn(`AVISO: ${noLemma} Strong's sem lema no corpus (cache à frente do load?)`);
  console.log('LSJ PT aplicado a public.lexicon_entries.');
}

// ── localize-refs: abreviações de livros EN -> PT (Almeida) ──────────────
// O prompt de tradução instrui a "preservar referências bíblicas exatamente",
// então o LLM manteve as abreviações inglesas (Mk, Lk, Ac...). Esta etapa
// determinística normaliza só os livros do NT cujo mapeamento é inequívoco.
//
// Idempotente e reexecutável: a regex casa o token de livro apenas quando
// seguido de referência (cap:vers ou cap.vers), então após Mk->Mc não resta
// nenhum "Mk" para recasar. Aplica no cache abbott.pt.json E no Supabase, por
// Strong's, mantendo as duas fontes em sincronia.
//
// Só NT inequívoco. Livros do AT/LXX ficam de fora por ambiguidade de colisão
// na convenção PT (ex.: He pode ser Hebreus; Es/Ki/Ca são ambíguos).
const NT_BOOK_MAP: Record<string, string> = {
  Mk: 'Mc', Lk: 'Lc', Ac: 'At', Ro: 'Rm', Ga: 'Gl', Eph: 'Ef',
  Phl: 'Fp', Col: 'Cl', Ja: 'Tg', Re: 'Ap', He: 'Hb', Th: 'Ts',
  Ti: 'Tm', Tit: 'Tt', Phm: 'Fm',
};

// regexes compiladas uma vez (não por chamada): ordena por comprimento desc para
// "Tit" casar antes de "Ti". \b<livro>\b + lookahead ".?␠+dígito[:.]dígito" (cap:vers).
const LOCALIZE_RULES: Array<{ re: RegExp; pt: string }> = Object.entries(NT_BOOK_MAP)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([en, pt]) => ({ re: new RegExp(`\\b${en}\\b(?=\\.?\\s+\\d+[:.]\\d)`, 'g'), pt }));

function localizeRefsText(text: string): string {
  let out = text;
  for (const { re, pt } of LOCALIZE_RULES) out = out.replace(re, pt);
  return out;
}

export async function localizeRefs(buildDir: string): Promise<void> {
  const cachePath = join(buildDir, 'abbott.pt.json');
  if (!existsSync(cachePath)) throw new Error('rode `--step=translate-lexicon` primeiro (abbott.pt.json ausente)');
  const done: Record<string, string> = JSON.parse(readFileSync(cachePath, 'utf8'));

  // só reescreve (cache + banco) as entradas que de fato mudaram
  const changed: Array<[string, string]> = [];
  for (const [id, text] of Object.entries(done)) {
    const next = localizeRefsText(text);
    if (next !== text) {
      done[id] = next;
      changed.push([id, next]);
    }
  }
  console.log(`entradas com referências localizadas: ${changed.length} de ${Object.keys(done).length}`);
  if (changed.length === 0) { console.log('nada a fazer (já localizado).'); return; }

  writeFileSync(cachePath, JSON.stringify(done), 'utf8'); // mantém o cache em sincronia

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log(`SUPABASE_* ausentes: ${changed.length} entradas atualizadas no cache (não aplicadas ao banco).`);
    return;
  }

  const client = createClient(url, key, { auth: { persistSession: false } });
  let applied = 0;
  await pMap(changed, UPDATE_CONCURRENCY, async ([strongs, text]) => {
    const { error } = await (client.from('lemmas') as any).update({ abbott_smith: text }).eq('strongs', strongs);
    if (error) throw new Error(`update lemma ${strongs}: ${error.message}`);
    if (++applied % 100 === 0) process.stdout.write(`\r  aplicados no banco: ${applied}/${changed.length}`);
  });
  process.stdout.write(`\r  aplicados no banco: ${applied}/${changed.length}\n`);
  console.log('Abreviações de livros (NT) localizadas no Supabase.');
}
