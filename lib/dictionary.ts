import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getLexiconEntries, type LexiconEntry } from './corpus';

// O corpus (incluindo lemmas) é imutável entre reingestões do ETL — mesma
// política de cache de corpus.ts. A tag 'corpus' permite invalidação manual.
const CORPUS_CACHE = { revalidate: 60 * 60 * 24, tags: ['corpus'] };

// Dicionário: busca e consulta de lemas. A tabela `lemmas` é compartilhada entre
// grego (NT) e hebraico (AT); o discriminador é o prefixo do Strong's: 'H' para
// hebraico, 'G' para grego. O grego reaproveita a stack de léxicos LSJ
// (lexicon_entries) + Abbott-Smith; o hebraico usa transliteração/pronúncia da
// própria linha (xlit/pron) + definição BDB.

export type DictLang = 'grc' | 'hbo';

export interface DictResult {
  lemma_id: number;
  lemma: string;
  gloss_pt: string | null;
  gloss_en: string | null;
  strongs: string | null;
  frequency: number;
  /** idioma do lema, derivado do prefixo do Strong's (H→hbo, G→grc). */
  language: DictLang;
  /** transliteração (hebraico): coluna do banco; o grego usa transliterate(). */
  xlit: string | null;
  /** pronúncia aproximada (hebraico). */
  pron: string | null;
}

export interface DictEntry extends DictResult {
  abbott_smith: string | null;
  /** definição BDB em inglês (hebraico). */
  bdb_def: string | null;
  /** definição BDB traduzida para PT (hebraico). */
  bdb_def_pt: string | null;
  lexicon: LexiconEntry[];
}

const SELECT = 'id,lemma,gloss_pt,gloss_en,strongs,frequency,xlit,pron';

type Row = {
  id: number;
  lemma: string;
  gloss_pt: string | null;
  gloss_en: string | null;
  strongs: string | null;
  frequency: number;
  xlit: string | null;
  pron: string | null;
};

/** Deriva o idioma pelo prefixo do Strong's (H = hebraico, demais = grego). */
function langOf(strongs: string | null): DictLang {
  return strongs?.toUpperCase().startsWith('H') ? 'hbo' : 'grc';
}

function toResult(r: Row): DictResult {
  return {
    lemma_id: r.id,
    lemma: r.lemma,
    gloss_pt: r.gloss_pt,
    gloss_en: r.gloss_en,
    strongs: r.strongs,
    frequency: r.frequency,
    language: langOf(r.strongs),
    xlit: r.xlit,
    pron: r.pron,
  };
}

// Remove caracteres que quebrariam a sintaxe do filtro `.or()` do PostgREST
// (vírgulas separam condições; parênteses agrupam) e os curingas do ilike
// (% e _ casam, respectivamente, qualquer sequência e qualquer caractere único).
function sanitize(query: string): string {
  return query.replace(/[%_,()*\\]/g, ' ').trim();
}

/**
 * Busca lemas por idioma. No grego (lang='grc'), filtra por frequência > 0 e
 * ordena pelas palavras mais frequentes (as mais úteis ao aprendiz primeiro). No
 * hebraico (lang='hbo'), os lemas têm frequency=0 (não computada), então o gate
 * de frequência é dispensado e a ordenação cai no id (estável). A busca casa por
 * forma original, transliteração (xlit), glosa PT ou Strong's. Sem query, devolve
 * o início da lista do idioma (modo navegação).
 */
export async function searchDictionary(
  query: string,
  lang: DictLang = 'grc',
  limit = 40,
): Promise<DictResult[]> {
  const safe = sanitize(query);

  let q = supabase.from('lemmas').select(SELECT);
  if (lang === 'hbo') {
    q = q.like('strongs', 'H%');
  } else {
    // Grego: exclui hebraico (frequency=0) e mantém só lemas com frequência real.
    q = q.gt('frequency', 0);
  }

  if (safe.length > 0) {
    const like = `%${safe}%`;
    q = q.or(`lemma.ilike.${like},gloss_pt.ilike.${like},xlit.ilike.${like},strongs.ilike.${like}`);
  }

  q =
    lang === 'hbo'
      ? q.order('id').limit(limit)
      : q.order('frequency', { ascending: false }).order('id').limit(limit);

  const { data, error } = await q;
  if (error) throw new Error(`searchDictionary: ${error.message}`);
  return ((data ?? []) as Row[]).map(toResult);
}

async function fetchDictionaryEntry(lemmaId: number): Promise<DictEntry | null> {
  const { data, error } = await supabase
    .from('lemmas')
    .select(`${SELECT},abbott_smith,bdb_def,bdb_def_pt`)
    .eq('id', lemmaId)
    .maybeSingle();
  if (error) throw new Error(`getDictionaryEntry: ${error.message}`);
  if (!data) return null;

  const row = data as Row & {
    abbott_smith: string | null;
    bdb_def: string | null;
    bdb_def_pt: string | null;
  };
  // LSJ/Abbott-Smith são gregos; para hebraico a definição vem do BDB (sem fetch).
  const lexicon = row.strongs && langOf(row.strongs) === 'grc' ? await getLexiconEntries(row.strongs) : [];

  return {
    ...toResult(row),
    abbott_smith: row.abbott_smith,
    bdb_def: row.bdb_def,
    bdb_def_pt: row.bdb_def_pt,
    lexicon,
  };
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
