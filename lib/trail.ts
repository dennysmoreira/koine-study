import { unstable_cache } from 'next/cache';
import { supabase } from './supabase';
import { createClient } from './supabase/server';

// Trilha de vocabulário por frequência: as palavras que mais aparecem no NT,
// ordenadas da mais comum para a menos comum, com a cobertura acumulada do texto.
// É o maior alavancador para iniciantes — aprender as poucas palavras mais
// frequentes já permite reconhecer boa parte do Novo Testamento (input compreensível).

export interface TrailWord {
  rank: number;
  lemma_id: number;
  lemma: string; // forma de dicionário (grego)
  gloss_pt: string | null;
  strongs: string | null;
  frequency: number; // ocorrências no corpus
  cumulativePct: number; // cobertura acumulada do NT até esta palavra (inclusive)
}

export interface FrequencyTrail {
  words: TrailWord[];
  totalTokens: number; // tamanho do NT (denominador da cobertura)
}

// Cobertura pessoal: quanto do NT o usuário já "conhece" (palavras com srs_card).
export interface KnownCoverage {
  knownCount: number;
  knownPct: number;
}

const TRAIL_CACHE = { revalidate: 60 * 60 * 24, tags: ['corpus'] };

async function fetchTotalTokens(): Promise<number> {
  const { count, error } = await supabase
    .from('tokens')
    .select('*', { count: 'exact', head: true });
  if (error) throw new Error(`getTotalTokens: ${error.message}`);
  return count ?? 0;
}

const getTotalTokens = unstable_cache(fetchTotalTokens, ['trail:total-tokens'], TRAIL_CACHE);

async function fetchTopLemmas(limit: number): Promise<Omit<TrailWord, 'rank' | 'cumulativePct'>[]> {
  const { data, error } = await supabase
    .from('lemmas')
    .select('id,lemma,gloss_pt,strongs,frequency')
    .gt('frequency', 0)
    .order('frequency', { ascending: false })
    .order('id') // desempate determinístico entre rebuilds de cache
    .limit(limit);
  if (error) throw new Error(`getTopLemmas: ${error.message}`);

  type Row = { id: number; lemma: string; gloss_pt: string | null; strongs: string | null; frequency: number };
  return ((data ?? []) as Row[]).map((r) => ({
    lemma_id: r.id,
    lemma: r.lemma,
    gloss_pt: r.gloss_pt,
    strongs: r.strongs,
    frequency: r.frequency,
  }));
}

// Hoisted ao escopo de módulo (como getChapter em corpus.ts): unstable_cache
// serializa os argumentos no key automaticamente, então getTopLemmas(150) e
// getTopLemmas(50) ficam em entradas distintas sem keypart manual.
const getTopLemmas = unstable_cache(fetchTopLemmas, ['trail:top'], TRAIL_CACHE);

/**
 * Retorna a trilha: as `limit` palavras mais frequentes do NT com a cobertura
 * acumulada do texto. Dados estáticos do corpus (cacheados); independe de usuário.
 */
export async function getFrequencyTrail(limit = 150): Promise<FrequencyTrail> {
  const [totalTokens, top] = await Promise.all([getTotalTokens(), getTopLemmas(limit)]);

  let cumulative = 0;
  const words: TrailWord[] = top.map((w, i) => {
    cumulative += w.frequency;
    return {
      ...w,
      rank: i + 1,
      cumulativePct: totalTokens > 0 ? (cumulative / totalTokens) * 100 : 0,
    };
  });

  return { words, totalTokens };
}

/**
 * Cobertura pessoal do usuário logado: soma das frequências das palavras que ele
 * já estuda (têm srs_card) sobre o total de tokens do NT. Sem usuário, a RLS
 * devolve zero cards e a cobertura é 0.
 */
export async function getKnownCoverage(): Promise<KnownCoverage> {
  // Numerador per-user (srs_cards via RLS no client com cookie) e denominador
  // cross-user (getTotalTokens, cacheado no client anon): combiná-los só é seguro
  // porque o total de tokens do NT independe de usuário. NÃO trocar o denominador
  // por algo per-user sem remover o cache — vazaria entre usuários.
  const server = createClient();
  const [{ data, error }, totalTokens] = await Promise.all([
    server.from('srs_cards').select('lemmas(frequency)'),
    getTotalTokens(),
  ]);
  if (error) throw new Error(`getKnownCoverage: ${error.message}`);

  type Row = { lemmas: { frequency: number } | { frequency: number }[] | null };
  let knownFreq = 0;
  let knownCount = 0;
  for (const r of (data ?? []) as Row[]) {
    const lex = Array.isArray(r.lemmas) ? r.lemmas[0] : r.lemmas;
    if (!lex) continue;
    knownFreq += lex.frequency ?? 0;
    knownCount += 1;
  }

  return {
    knownCount,
    knownPct: totalTokens > 0 ? (knownFreq / totalTokens) * 100 : 0,
  };
}
