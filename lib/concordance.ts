import 'server-only';
import { unstable_cache } from 'next/cache';
import { supabase } from './supabase';
import { originalToDisplay } from './versification';

// ── Concordância: todas as ocorrências de um lema no corpus ─────────────────
//
// Dado um lema (pelo id na tabela `lemmas`), lista os versículos onde ele aparece,
// no eixo de DISPLAY (para o link abrir o comparador na linha certa). Duas fontes,
// conforme o idioma do lema (derivado do prefixo do Strong's):
//   - grego (G…): `tokens` referenciam `lemma_id` diretamente → join em `verses`.
//   - hebraico (H…): `hebrew_words.morphemes` é um jsonb [{ s: strongs, … }] sem
//     lemma_id; casamos por Strong's via containment (@>), e remapeamos a
//     coordenada org→display (versificação) para o ref e o link.
//
// O corpus é imutável entre reingestões — leitura cacheada (tag 'corpus').

export interface Occurrence {
  osis: string;
  bookName: string;
  chapter: number;
  verse: number;
  /** ref legível no eixo de display ("John 3:16"). */
  ref: string;
  /** forma flexionada naquela ocorrência (surface). */
  surface: string;
  /** trecho de contexto: texto do versículo numa tradução PT (null se ausente). */
  text: string | null;
}

// Tradução usada para o trecho de contexto (KWIC) na concordância.
const SNIPPET_CODE = 'pt-nvi';

// Anexa o texto do versículo (contexto) a cada ocorrência, em UMA query batelada
// por `ref`. Refs sem texto na tradução padrão ficam com text=null (sem snippet).
async function withSnippets(occ: Occurrence[]): Promise<Occurrence[]> {
  if (occ.length === 0) return occ;
  const refs = [...new Set(occ.map((o) => o.ref))];
  const byRef = new Map<string, string>();
  // Chunked: um `.in()` com ~300 refs estoura o tamanho da URL do PostgREST (a
  // lista vai no query string). Lotes pequenos mantêm cada requisição curta.
  const CHUNK = 80;
  for (let i = 0; i < refs.length; i += CHUNK) {
    const { data } = await supabase
      .from('verse_texts')
      .select('ref,text')
      .eq('translation_code', SNIPPET_CODE)
      .in('ref', refs.slice(i, i + CHUNK));
    for (const r of (data ?? []) as { ref: string; text: string }[]) byRef.set(r.ref, r.text);
  }
  return occ.map((o) => ({ ...o, text: byRef.get(o.ref) ?? null }));
}

export interface Concordance {
  /** total de ocorrências no corpus (pode exceder os itens retornados). */
  total: number;
  occurrences: Occurrence[];
  /** true quando há mais ocorrências do que o teto retornado. */
  truncated: boolean;
}

// Teto de ocorrências materializadas por consulta. Lemas muito frequentes (ex.:
// καί, ~9k) não cabem numa lista útil; mostramos as primeiras N em ordem canônica
// e sinalizamos o corte. O total real vem à parte (frequency / count).
const LIMIT = 300;

function langOf(strongs: string | null): 'grc' | 'hbo' {
  return strongs?.toUpperCase().startsWith('H') ? 'hbo' : 'grc';
}

async function fetchConcordance(lemmaId: number): Promise<Concordance> {
  const empty: Concordance = { total: 0, occurrences: [], truncated: false };

  const { data: lemmaRow } = await supabase
    .from('lemmas')
    .select('strongs,frequency')
    .eq('id', lemmaId)
    .maybeSingle();
  const lemma = lemmaRow as { strongs: string | null; frequency: number } | null;
  if (!lemma) return empty;

  if (langOf(lemma.strongs) === 'hbo') {
    if (!lemma.strongs) return empty;
    return fetchHebrew(lemma.strongs);
  }
  return fetchGreek(lemmaId, lemma.frequency);
}

// Grego: tokens.lemma_id → verses (com book). Ordena por verse_id (≈ ordem
// canônica de inserção do corpus) e position. O total vem de lemmas.frequency.
async function fetchGreek(lemmaId: number, frequency: number): Promise<Concordance> {
  const { data, error } = await supabase
    .from('tokens')
    .select('surface,verses!inner(chapter,verse,ref,books!inner(osis_code,name_pt))')
    .eq('lemma_id', lemmaId)
    .order('verse_id')
    .order('position')
    .limit(LIMIT + 1);
  if (error) throw new Error(`getConcordance(grc): ${error.message}`);

  type Row = {
    surface: string;
    verses: { chapter: number; verse: number; ref: string; books: { osis_code: string; name_pt: string } };
  };
  const rows = (data ?? []) as unknown as Row[];
  const truncated = rows.length > LIMIT;
  const occurrences: Occurrence[] = rows.slice(0, LIMIT).map((r) => ({
    osis: r.verses.books.osis_code,
    bookName: r.verses.books.name_pt,
    chapter: r.verses.chapter,
    verse: r.verses.verse,
    ref: r.verses.ref,
    surface: r.surface,
    text: null,
  }));
  return { total: frequency || occurrences.length, occurrences: await withSnippets(occurrences), truncated };
}

// Hebraico: hebrew_words.morphemes @> [{ g: strongs }] — no jsonb cru a chave do
// Strong's é `g` (s=surface, l=lema, m=morfologia; ver lib/hebrew.ts). A numeração
// é org (TM); remapeamos para o eixo de display e descartamos títulos (display 0).
async function fetchHebrew(strongs: string): Promise<Concordance> {
  // Containment jsonb: o supabase-js só serializa corretamente quando o valor é
  // uma STRING JSON — passar o array/objeto cru vira literal de array do PG e o
  // PostgREST rejeita (22P02). Daí o JSON.stringify.
  const filter = JSON.stringify([{ g: strongs }]);

  const { count } = await supabase
    .from('hebrew_words')
    .select('id', { count: 'exact', head: true })
    .contains('morphemes', filter);

  const { data, error } = await supabase
    .from('hebrew_words')
    .select('chapter,verse,surface,books!inner(osis_code,name_pt)')
    .contains('morphemes', filter)
    .order('book_id')
    .order('chapter')
    .order('verse')
    .order('position')
    .limit(LIMIT + 1);
  if (error) throw new Error(`getConcordance(hbo): ${error.message}`);

  type Row = {
    chapter: number;
    verse: number;
    surface: string;
    books: { osis_code: string; name_pt: string };
  };
  const rows = (data ?? []) as unknown as Row[];
  const truncated = rows.length > LIMIT;

  const occurrences: Occurrence[] = [];
  for (const r of rows.slice(0, LIMIT)) {
    const osis = r.books.osis_code;
    const dv = originalToDisplay(osis, r.chapter, r.verse);
    if (dv.verse === 0) continue; // verso de título do Salmo: sem linha de display
    occurrences.push({
      osis,
      bookName: r.books.name_pt,
      chapter: dv.chapter,
      verse: dv.verse,
      ref: `${osis} ${dv.chapter}:${dv.verse}`,
      surface: r.surface,
      text: null,
    });
  }
  return { total: count ?? occurrences.length, occurrences: await withSnippets(occurrences), truncated };
}

/**
 * Concordância de um lema (cacheada; corpus imutável). Retorna as ocorrências no
 * eixo de display, em ordem canônica, mais o total e o flag de truncamento.
 */
export const getConcordance = unstable_cache(fetchConcordance, ['concordance'], {
  revalidate: 60 * 60 * 24,
  tags: ['corpus'],
});
