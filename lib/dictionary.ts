import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getLexiconEntries, type LexiconEntry } from './corpus';

// O corpus (incluindo lemmas) é imutável entre reingestões do ETL — mesma
// política de cache de corpus.ts. A tag 'corpus' permite invalidação manual.
const CORPUS_CACHE = { revalidate: 60 * 60 * 24, tags: ['corpus'] };

// Dicionário: busca e consulta de lemas do NT. Reaproveita a stack de léxicos
// (lexicon_entries) já usada pelo leitor, chaveada pelo Strong's.

export interface DictResult {
  lemma_id: number;
  lemma: string;
  gloss_pt: string | null;
  gloss_en: string | null;
  strongs: string | null;
  frequency: number;
}

export interface DictEntry extends DictResult {
  abbott_smith: string | null;
  lexicon: LexiconEntry[];
}

const SELECT = 'id,lemma,gloss_pt,gloss_en,strongs,frequency';

type Row = {
  id: number;
  lemma: string;
  gloss_pt: string | null;
  gloss_en: string | null;
  strongs: string | null;
  frequency: number;
};

function toResult(r: Row): DictResult {
  return {
    lemma_id: r.id,
    lemma: r.lemma,
    gloss_pt: r.gloss_pt,
    gloss_en: r.gloss_en,
    strongs: r.strongs,
    frequency: r.frequency,
  };
}

// Remove caracteres que quebrariam a sintaxe do filtro `.or()` do PostgREST
// (vírgulas separam condições; parênteses agrupam) e os curingas do ilike
// (% e _ casam, respectivamente, qualquer sequência e qualquer caractere único).
function sanitize(query: string): string {
  return query.replace(/[%_,()*\\]/g, ' ').trim();
}

/**
 * Busca lemas por forma grega, glosa PT ou Strong's. Sem query, devolve as
 * palavras mais frequentes (modo navegação). Ordena por frequência decrescente —
 * as mais úteis para o aprendiz primeiro.
 */
export async function searchDictionary(query: string, limit = 40): Promise<DictResult[]> {
  const safe = sanitize(query);

  let q = supabase.from('lemmas').select(SELECT).gt('frequency', 0);
  if (safe.length > 0) {
    const like = `%${safe}%`;
    q = q.or(`lemma.ilike.${like},gloss_pt.ilike.${like},strongs.ilike.${like}`);
  }
  q = q.order('frequency', { ascending: false }).order('id').limit(limit);

  const { data, error } = await q;
  if (error) throw new Error(`searchDictionary: ${error.message}`);
  return ((data ?? []) as Row[]).map(toResult);
}

async function fetchDictionaryEntry(lemmaId: number): Promise<DictEntry | null> {
  const { data, error } = await supabase
    .from('lemmas')
    .select(`${SELECT},abbott_smith`)
    .eq('id', lemmaId)
    .maybeSingle();
  if (error) throw new Error(`getDictionaryEntry: ${error.message}`);
  if (!data) return null;

  const row = data as Row & { abbott_smith: string | null };
  const lexicon = row.strongs ? await getLexiconEntries(row.strongs) : [];

  return { ...toResult(row), abbott_smith: row.abbott_smith, lexicon };
}

/**
 * Entrada completa de um lema: dados básicos + Abbott-Smith + léxicos (LSJ etc.).
 * Cacheada (corpus imutável); chaveada por lemmaId via unstable_cache.
 */
export const getDictionaryEntry = unstable_cache(fetchDictionaryEntry, ['dictionary:entry'], CORPUS_CACHE);

/**
 * Indica se um lema já está no baralho do usuário. O `client` deve ser o cliente
 * server (cookie) — a RLS escopa srs_cards ao auth.uid(), por isso não filtramos
 * user_id manualmente. Compartilhado entre a página de detalhe e a action.
 */
export async function isInDeck(client: SupabaseClient, lemmaId: number): Promise<boolean> {
  const { data } = await client
    .from('srs_cards')
    .select('lemma_id')
    .eq('lemma_id', lemmaId)
    .maybeSingle();
  return Boolean(data);
}
