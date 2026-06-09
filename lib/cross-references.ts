import 'server-only';
import { unstable_cache } from 'next/cache';
import { supabase } from './supabase';
import { getBooks } from './corpus';

// ── Referências cruzadas (TSK / openbible.info) ─────────────────────────────
//
// Dado um versículo de ORIGEM (no eixo de display), lista os versículos/faixas de
// DESTINO mais relevantes (ordenados pelos votos do TSK). As refs já estão na
// versificação protestante (= eixo de display), então não há remapeamento. O nome
// do livro de destino vem de `getBooks` (não há FK de to_osis → books: osis é texto).
//
// Corpus imutável → leitura cacheada (tag 'corpus').

export interface CrossRef {
  osis: string;
  bookName: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  /** rótulo PT ("João 3:16" ou "João 3:16-18"). */
  ref: string;
  votes: number;
}

// Teto de refs por versículo: o TSK pode trazer 100+; as primeiras por relevância
// cobrem o essencial sem poluir o painel.
const LIMIT = 50;

async function fetchCrossReferences(osis: string, chapter: number, verse: number): Promise<CrossRef[]> {
  const { data, error } = await supabase
    .from('cross_references')
    .select('to_osis,to_chapter,to_verse_start,to_verse_end,votes')
    .eq('from_osis', osis)
    .eq('from_chapter', chapter)
    .eq('from_verse', verse)
    .order('votes', { ascending: false })
    .limit(LIMIT);
  if (error) throw new Error(`getCrossReferences: ${error.message}`);

  const rows = (data ?? []) as Array<{
    to_osis: string;
    to_chapter: number;
    to_verse_start: number;
    to_verse_end: number;
    votes: number;
  }>;
  if (rows.length === 0) return [];

  const names = new Map((await getBooks()).map((b) => [b.osis_code, b.name_pt]));

  return rows.map((r) => {
    const bookName = names.get(r.to_osis) ?? r.to_osis;
    const range = r.to_verse_end > r.to_verse_start ? `${r.to_verse_start}-${r.to_verse_end}` : `${r.to_verse_start}`;
    return {
      osis: r.to_osis,
      bookName,
      chapter: r.to_chapter,
      verseStart: r.to_verse_start,
      verseEnd: r.to_verse_end,
      ref: `${bookName} ${r.to_chapter}:${range}`,
      votes: r.votes,
    };
  });
}

export const getCrossReferences = unstable_cache(fetchCrossReferences, ['cross-references'], {
  revalidate: 60 * 60 * 24,
  tags: ['corpus'],
});
