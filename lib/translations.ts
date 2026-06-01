import { unstable_cache } from 'next/cache';
import { supabase } from './supabase';
import { getBookByOsis, type Book } from './corpus';

// ── Comparador de traduções ───────────────────────────────────────────────
//
// Estrutura version-agnostic (estilo theWord): cada versão — inclusive o grego
// original — é uma linha em `translations`, e os versículos vivem em
// `verse_texts` chaveados por `ref` (OSIS, ex: "John 1:1"). O comparador junta
// versões pelo `ref`, então adicionar uma versão licenciada no futuro não exige
// mudança de schema nem de código (Open/Closed).

export interface Translation {
  code: string;
  name: string;
  language: string;
  source_url: string | null;
  text_type: string | null;
  is_original: boolean;
  sort_order: number;
}

// Uma linha do leitor paralelo: um versículo com o texto de cada versão pedida.
// `texts[code]` é null quando aquela versão não traz o versículo (ex.: variantes
// do Texto Recebido ausentes no texto crítico).
export interface ParallelRow {
  ref: string;
  chapter: number;
  verse: number;
  texts: Record<string, string | null>;
}

export interface ParallelChapter {
  book: Book;
  number: number;
  chapters: number[];
  translations: Translation[];
  rows: ParallelRow[];
}

const TRANSLATIONS_CACHE = { revalidate: 60 * 60 * 24, tags: ['translations'] };

const TRANSLATION_COLUMNS =
  'code,name,language,source_url,text_type,is_original,sort_order';

async function fetchTranslations(): Promise<Translation[]> {
  const { data, error } = await supabase
    .from('translations')
    .select(TRANSLATION_COLUMNS)
    .order('sort_order')
    .order('code');
  if (error) throw new Error(`getTranslations: ${error.message}`);
  return (data ?? []) as Translation[];
}

export const getTranslations = unstable_cache(
  fetchTranslations,
  ['translations:list'],
  TRANSLATIONS_CACHE,
);

// Capítulos existentes de um livro (distintos, ordenados). Deriva de verse_texts
// para refletir o que de fato existe no comparador (não só o corpus tokenizado).
//
// Usa a RPC `book_chapters` (DISTINCT no banco) em vez de `select chapter` cru:
// verse_texts tem uma linha por (versículo × versão), então o select cru estourava
// o teto de 1.000 linhas do PostgREST e truncava a lista de capítulos.
async function fetchChapterNumbers(bookId: number): Promise<number[]> {
  const { data, error } = await supabase.rpc('book_chapters', { p_book_id: bookId });
  if (error) throw new Error(`getChapterNumbers: ${error.message}`);
  return ((data ?? []) as number[]).slice().sort((a, b) => a - b);
}

interface VerseTextRow {
  translation_code: string;
  ref: string;
  chapter: number;
  verse: number;
  text: string;
}

/**
 * Versículos de um capítulo lado a lado para as versões pedidas (`codes`). A
 * ordem das colunas segue a ordem de `codes`; versões inexistentes em `codes`
 * são ignoradas. Retorna null quando o livro não existe.
 */
async function fetchParallelChapter(
  osis: string,
  chapter: number,
  codes: string[],
): Promise<ParallelChapter | null> {
  const book = await getBookByOsis(osis);
  if (!book) return null;

  const allTranslations = await getTranslations();

  // A coluna "Original" é UMA versão lógica que troca de língua por testamento:
  // grego (grc) no NT, hebraico (hbo) no AT. Existem duas linhas is_original no
  // catálogo (grc-sblgnt, hbo-wlc); aqui trocamos QUALQUER original pedido pelo
  // da língua certa do livro atual. Assim navegar João → Gênesis mantém a coluna
  // original presente e correta, sem o usuário reescolher a versão.
  const originalCodes = new Set(
    allTranslations.filter((t) => t.is_original).map((t) => t.code),
  );
  const originalForBook =
    allTranslations.find(
      (t) => t.is_original && t.language === (book.testament === 'OT' ? 'hbo' : 'grc'),
    )?.code ?? null;
  const resolvedCodes: string[] = [];
  for (const c of codes) {
    const next = originalCodes.has(c) ? originalForBook : c;
    if (next && !resolvedCodes.includes(next)) resolvedCodes.push(next);
  }

  // preserva a ordem pedida e descarta códigos desconhecidos
  const byCode = new Map(allTranslations.map((t) => [t.code, t]));
  const selected = resolvedCodes
    .map((c) => byCode.get(c))
    .filter((t): t is Translation => Boolean(t));

  const [{ data, error }, chapters] = await Promise.all([
    supabase
      .from('verse_texts')
      .select('translation_code,ref,chapter,verse,text')
      .eq('book_id', book.id)
      .eq('chapter', chapter)
      .in('translation_code', selected.map((t) => t.code))
      .order('verse'),
    fetchChapterNumbers(book.id),
  ]);
  if (error) throw new Error(`getParallelChapter: ${error.message}`);

  const rows = (data ?? []) as VerseTextRow[];

  // Agrupa por número de versículo (chave de alinhamento entre versões). Cada
  // versão pode trazer um `ref` ligeiramente diferente para o mesmo versículo
  // (diferenças de versificação), então guardamos o ref por código e escolhemos
  // um ref canônico de forma determinística depois — nunca "o primeiro que
  // chegou" (a ordem das linhas do PostgREST dentro de um mesmo versículo não é
  // garantida).
  interface Grouped {
    chapter: number;
    verse: number;
    texts: Record<string, string | null>;
    refByCode: Record<string, string>;
  }
  const byVerse = new Map<number, Grouped>();
  for (const r of rows) {
    let g = byVerse.get(r.verse);
    if (!g) {
      g = { chapter: r.chapter, verse: r.verse, texts: {}, refByCode: {} };
      // inicializa todas as versões como ausentes para colunas consistentes
      for (const t of selected) g.texts[t.code] = null;
      byVerse.set(r.verse, g);
    }
    g.texts[r.translation_code] = r.text;
    g.refByCode[r.translation_code] = r.ref;
  }

  // ref canônico: prioriza a versão de maior precedência presente no versículo.
  // `selected` já vem ordenado por sort_order (original = 0 vence), então a
  // primeira que tiver ref define a chave estável da linha.
  const canonicalRef = (g: Grouped): string => {
    for (const t of selected) {
      const ref = g.refByCode[t.code];
      if (ref) return ref;
    }
    return `${book.osis_code} ${g.chapter}:${g.verse}`;
  };

  const ordered: ParallelRow[] = [...byVerse.values()]
    .sort((a, b) => a.verse - b.verse)
    .map((g) => ({ ref: canonicalRef(g), chapter: g.chapter, verse: g.verse, texts: g.texts }));

  return {
    book,
    number: chapter,
    chapters,
    translations: selected,
    rows: ordered,
  };
}

export const getParallelChapter = unstable_cache(
  fetchParallelChapter,
  ['translations:chapter'],
  TRANSLATIONS_CACHE,
);
