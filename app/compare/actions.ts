'use server';

import { supabase } from '@/lib/supabase';
import { getLexiconEntries, getAbbottSmith, getBookByOsis, getBooks, type LexiconEntry } from '@/lib/corpus';
import { getTranslations } from '@/lib/translations';
import { originalToDisplay, originalChapterWindow } from '@/lib/versification';
import { getCrossReferences, type CrossRef } from '@/lib/cross-references';

/**
 * Referências cruzadas (TSK) de um versículo, no eixo de display. Chamada sob
 * demanda pelo comparador quando o usuário abre o painel de um versículo.
 */
export async function getVerseCrossReferences(
  osis: string,
  chapter: number,
  verse: number,
): Promise<CrossRef[]> {
  if (!osis || !Number.isInteger(chapter) || !Number.isInteger(verse)) return [];
  return getCrossReferences(osis, chapter, verse);
}

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
// painel de um token grego. Entradas de léxico são grandes (LSJ: mediana ~200,
// máx ~16 KB; Abbott-Smith também é texto longo), então NÃO viajam no payload do
// capítulo — são buscadas sob demanda, chaveadas pelo Strong's do lema (estável
// entre rebuilds). Ambas as leituras são cacheadas no Data Cache (tag 'corpus').
// O Abbott-Smith entra como primeira "fonte" da pilha de léxicos do painel.
export async function fetchLexicon(strongs: string): Promise<LexiconEntry[]> {
  const key = strongs.trim();
  if (!key) return [];
  const [abbott, entries] = await Promise.all([getAbbottSmith(key), getLexiconEntries(key)]);
  return abbott ? [{ source: 'abbott_smith', text_en: abbott, text_pt: null }, ...entries] : entries;
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

// Versículos de um capítulo (ordenados, eixo de display protestante). Filtra pela
// versão ORIGINAL do testamento do livro (grc no NT, hbo no AT) para ter uma linha
// por versículo — a lista fica completa sem multiplicar por versão nem estourar o
// teto do PostgREST. O original vive na numeração canônica da fonte (TM no AT), que
// diverge do eixo de display: títulos de Salmo numerados e fronteiras de capítulo
// movidas. Buscamos a janela [ch-1, ch, ch+1] e traduzimos cada verso org → display
// via originalToDisplay, mantendo só os que caem neste capítulo e descartando
// títulos (display verse 0). Retorna [] se o livro não existir ou não houver original.
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
    .select('chapter,verse')
    .eq('book_id', book.id)
    .in('chapter', originalChapterWindow(chapter))
    .eq('translation_code', originalCode)
    .order('chapter')
    .order('verse');
  if (error) throw new Error(`getChapterVerses: ${error.message}`);

  const seen = new Set<number>();
  for (const r of (data ?? []) as { chapter: number; verse: number }[]) {
    const dv = originalToDisplay(book.osis_code, r.chapter, r.verse);
    if (dv.chapter === chapter && dv.verse > 0) seen.add(dv.verse);
  }
  return [...seen].sort((a, b) => a - b);
}
