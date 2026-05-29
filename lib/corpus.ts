import { unstable_cache } from 'next/cache';
import { supabase } from './supabase';

export interface Book {
  id: number;
  osis_code: string;
  name_pt: string;
  name_grc: string | null;
  testament: string;
  sort_order: number;
}

export interface Lemma {
  lemma: string;
  gloss_pt: string | null;
  gloss_en: string | null;
  strongs: string | null;
  abbott_smith: string | null;
}

export interface Token {
  position: number;
  surface: string;
  normalized: string | null;
  strongs: string | null;
  morph_code: string | null;
  m_pos: string | null;
  m_tense: string | null;
  m_voice: string | null;
  m_mood: string | null;
  m_case: string | null;
  m_number: string | null;
  m_gender: string | null;
  m_person: string | null;
  gloss_context: string | null;
  lemma: Lemma | null;
}

export interface Verse {
  id: number;
  chapter: number;
  verse: number;
  ref: string;
  tokens: Token[];
}

export interface Chapter {
  book: Book;
  number: number;
  verses: Verse[];
  chapters: number[];
}

const TOKEN_COLUMNS =
  'position,surface,normalized,strongs,morph_code,m_pos,m_tense,m_voice,m_mood,m_case,m_number,m_gender,m_person,gloss_context,lemmas(lemma,gloss_pt,gloss_en,strongs,abbott_smith)';

// O corpus (livros, versículos, tokens, léxico) é imutável — só muda quando o ETL
// reingere os dados. Por isso cacheamos as leituras no Data Cache do Next por meio
// de unstable_cache: a 1ª visita bate no Supabase; as demais são servidas do cache,
// mesmo em rotas `force-dynamic`. A tag 'corpus' permite invalidação manual após
// uma reingestão (revalidateTag('corpus')).
const CORPUS_CACHE = { revalidate: 60 * 60 * 24, tags: ['corpus'] };

async function fetchBooks(): Promise<Book[]> {
  const { data, error } = await supabase
    .from('books')
    .select('id,osis_code,name_pt,name_grc,testament,sort_order')
    .order('sort_order');
  if (error) throw new Error(`getBooks: ${error.message}`);
  return (data ?? []) as Book[];
}

export const getBooks = unstable_cache(fetchBooks, ['corpus:books'], CORPUS_CACHE);

export async function getBookByOsis(osis: string): Promise<Book | null> {
  const { data, error } = await supabase
    .from('books')
    .select('id,osis_code,name_pt,name_grc,testament,sort_order')
    .eq('osis_code', osis)
    .maybeSingle();
  if (error) throw new Error(`getBookByOsis: ${error.message}`);
  return (data as Book | null) ?? null;
}

// lista de capítulos existentes para um livro (distintos, ordenados)
async function getChapterNumbers(bookId: number): Promise<number[]> {
  const { data, error } = await supabase
    .from('verses')
    .select('chapter')
    .eq('book_id', bookId)
    .order('chapter');
  if (error) throw new Error(`getChapterNumbers: ${error.message}`);
  const set = new Set<number>();
  for (const row of data ?? []) set.add((row as { chapter: number }).chapter);
  return [...set].sort((a, b) => a - b);
}

async function fetchChapter(
  osis: string,
  chapter: number,
): Promise<Chapter | null> {
  const book = await getBookByOsis(osis);
  if (!book) return null;

  const [{ data, error }, chapters] = await Promise.all([
    supabase
      .from('verses')
      .select(`id,chapter,verse,ref,tokens(${TOKEN_COLUMNS})`)
      .eq('book_id', book.id)
      .eq('chapter', chapter)
      .order('verse')
      .order('position', { referencedTable: 'tokens' }),
    getChapterNumbers(book.id),
  ]);
  if (error) throw new Error(`getChapter: ${error.message}`);

  // Supabase devolve a relação pelo nome da tabela (`lemmas`) e infere o tipo como
  // array mesmo sendo to-one; normaliza para um único `lemma` por token.
  type RawToken = Omit<Token, 'lemma'> & { lemmas: Lemma | Lemma[] | null };
  type RawVerse = Omit<Verse, 'tokens'> & { tokens: RawToken[] };
  const rows = (data ?? []) as unknown as RawVerse[];

  const verses: Verse[] = rows.map((r) => ({
    id: r.id,
    chapter: r.chapter,
    verse: r.verse,
    ref: r.ref,
    tokens: r.tokens.map(({ lemmas, ...t }) => ({
      ...t,
      lemma: Array.isArray(lemmas) ? (lemmas[0] ?? null) : lemmas,
    })),
  }));

  return { book, number: chapter, verses, chapters };
}

export const getChapter = unstable_cache(fetchChapter, ['corpus:chapter'], CORPUS_CACHE);

// ── stack de léxicos (lexicon_entries) ──────────────────────────────────
// Entradas longas (LSJ etc.) NÃO viajam no payload do capítulo — seriam centenas
// de KB por capítulo. São buscadas sob demanda quando o leitor abre o painel de um
// token, chaveadas pelo Strong's do lema (estável entre rebuilds).
export interface LexiconEntry {
  source: string; // 'lsj' | 'thayers' | ...
  text_en: string | null;
  text_pt: string | null;
}

async function fetchLexiconEntries(strongs: string): Promise<LexiconEntry[]> {
  // Cardinalidade: por Strong's existe UMA entrada lógica por `source` (ex.: 'lsj').
  // Homógrafos (vários lemas no mesmo Strong's) fazem o load replicar a MESMA entrada
  // por lemma_id; logo várias linhas chegam com (source, texto) idênticos. `sort_order`
  // ordena as fontes ENTRE si (display), não partes dentro de uma fonte. Por isso:
  // deduplicamos por source mantendo a 1ª. O `.order('source')` secundário torna o
  // "1ª" determinístico entre rebuilds de cache (sem ele a ordem dentro do mesmo
  // sort_order seria a do Postgres, não garantida).
  const { data, error } = await supabase
    .from('lexicon_entries')
    .select('source,text_en,text_pt,sort_order,lemmas!inner(strongs)')
    .eq('lemmas.strongs', strongs)
    .order('sort_order')
    .order('source');
  if (error) throw new Error(`getLexiconEntries: ${error.message}`);

  const seen = new Set<string>();
  const out: LexiconEntry[] = [];
  for (const r of (data ?? []) as Array<LexiconEntry & { sort_order: number }>) {
    if (seen.has(r.source)) continue;
    // Sem texto (EN e PT nulos) não há o que mostrar — não emite seção vazia.
    if (!r.text_pt && !r.text_en) continue;
    seen.add(r.source);
    out.push({ source: r.source, text_en: r.text_en, text_pt: r.text_pt });
  }
  return out;
}

export const getLexiconEntries = unstable_cache(fetchLexiconEntries, ['corpus:lexicon'], CORPUS_CACHE);
