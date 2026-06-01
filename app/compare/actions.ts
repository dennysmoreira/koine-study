'use server';

import { supabase } from '@/lib/supabase';
import { getLexiconEntries, getBookByOsis, getBooks, type LexiconEntry } from '@/lib/corpus';
import { getTranslations } from '@/lib/translations';

export interface BookOption {
  osis: string;
  name: string;
}

// Lista de livros (osis + nome em PT) para o seletor de referências relacionadas
// das anotações. getBooks é cacheada (Data Cache, tag 'corpus'), então repetições
// não batem no banco.
export async function listBooks(): Promise<BookOption[]> {
  const books = await getBooks();
  return books.map((b) => ({ osis: b.osis_code, name: b.name_pt }));
}

// Server Action chamada pelo comparador unificado (client component) ao abrir o
// painel de um token grego. As entradas LSJ são grandes (mediana ~200, máx ~16 KB
// de texto), então NÃO viajam no payload do capítulo — são buscadas sob demanda,
// chaveadas pelo Strong's do lema (estável entre rebuilds). `getLexiconEntries` já
// é cacheada no Data Cache do Next (tag 'corpus'), então repetições vêm do cache.
export async function fetchLexicon(strongs: string): Promise<LexiconEntry[]> {
  const key = strongs.trim();
  if (!key) return [];
  return getLexiconEntries(key);
}

// Capítulos existentes de um livro (distintos, ordenados). Alimenta a cascata
// Livro → Capítulo → Versículo do sheet de navegação: ao trocar de livro sem
// navegar, o cliente busca por aqui os capítulos do livro escolhido. Usa a RPC
// `book_chapters` (DISTINCT no banco) — verse_texts tem uma linha por
// (versículo × versão), então um select cru estouraria o teto de 1.000 linhas
// do PostgREST. Retorna [] se o livro não existir.
export async function getBookChapters(osis: string): Promise<number[]> {
  const book = await getBookByOsis(osis);
  if (!book) return [];
  const { data, error } = await supabase.rpc('book_chapters', { p_book_id: book.id });
  if (error) throw new Error(`getBookChapters: ${error.message}`);
  return ((data ?? []) as number[]).slice().sort((a, b) => a - b);
}

// Versículos de um capítulo (ordenados). Filtra pela versão ORIGINAL do
// testamento do livro (grc no NT, hbo no AT) para ter uma linha por versículo —
// a lista fica completa sem multiplicar por versão nem estourar o teto do
// PostgREST. Retorna [] se o livro não existir ou não houver original.
export async function getChapterVerses(osis: string, chapter: number): Promise<number[]> {
  const book = await getBookByOsis(osis);
  if (!book) return [];

  const translations = await getTranslations();
  const originalCode = translations.find(
    (t) => t.is_original && t.language === (book.testament === 'OT' ? 'hbo' : 'grc'),
  )?.code;
  if (!originalCode) return [];

  const { data, error } = await supabase
    .from('verse_texts')
    .select('verse')
    .eq('book_id', book.id)
    .eq('chapter', chapter)
    .eq('translation_code', originalCode)
    .order('verse');
  if (error) throw new Error(`getChapterVerses: ${error.message}`);
  return ((data ?? []) as { verse: number }[]).map((r) => r.verse);
}
