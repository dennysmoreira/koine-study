import { unstable_cache } from 'next/cache';
import { supabase } from './supabase';
import { getBookByOsis, type Book } from './corpus';
import { originalToDisplay, originalChapterWindow } from './versification';

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

  // A coluna original vive na numeração canônica da fonte (TM/`org` no AT), que
  // diverge do eixo de display (eng/protestante) em dezenas de capítulos — não só
  // por título de Salmo, mas por fronteiras de capítulo movidas, que trazem versos
  // de capítulos org vizinhos para este capítulo de display. Por isso buscamos o
  // original na janela [ch-1, ch, ch+1] e traduzimos cada verso com originalToDisplay.
  // As traduções já estão no eixo de display, então só precisam do próprio capítulo.
  const [{ data, error }, chapters] = await Promise.all([
    supabase
      .from('verse_texts')
      .select('translation_code,ref,chapter,verse,text')
      .eq('book_id', book.id)
      .in('chapter', originalChapterWindow(chapter))
      .in('translation_code', selected.map((t) => t.code))
      .order('chapter')
      .order('verse'),
    fetchChapterNumbers(book.id),
  ]);
  if (error) throw new Error(`getParallelChapter: ${error.message}`);

  const rows = (data ?? []) as VerseTextRow[];

  // Agrupa por número de versículo de DISPLAY (chave de alinhamento entre
  // versões). Cada versão pode trazer um `ref` ligeiramente diferente para o
  // mesmo versículo (diferenças de versificação), então guardamos o ref por
  // código e escolhemos um ref canônico de forma determinística depois — nunca
  // "o primeiro que chegou" (a ordem das linhas do PostgREST dentro de um mesmo
  // versículo não é garantida).
  interface Grouped {
    chapter: number;
    verse: number;
    texts: Record<string, string | null>;
    refByCode: Record<string, string>;
  }
  const byVerse = new Map<number, Grouped>();
  for (const r of rows) {
    let displayVerse: number;
    if (r.translation_code === originalForBook) {
      // Coluna original: traduz a coordenada org → display. Versos que caem em
      // outro capítulo de display (fronteira movida) são descartados; título → 0.
      const dv = originalToDisplay(book.osis_code, r.chapter, r.verse);
      if (dv.chapter !== chapter) continue;
      displayVerse = dv.verse;
    } else {
      // Tradução: já no eixo de display; a janela traz capítulos vizinhos que aqui
      // não interessam.
      if (r.chapter !== chapter) continue;
      displayVerse = r.verse;
    }
    let g = byVerse.get(displayVerse);
    if (!g) {
      g = { chapter, verse: displayVerse, texts: {}, refByCode: {} };
      // inicializa todas as versões como ausentes para colunas consistentes
      for (const t of selected) g.texts[t.code] = null;
      byVerse.set(displayVerse, g);
    }
    // Merge de versificação (título de 2 versos, ou versos org fundidos numa linha
    // de display) concatena na ordem de leitura — daí o order by (chapter, verse).
    const prev = g.texts[r.translation_code];
    g.texts[r.translation_code] = prev ? `${prev} ${r.text}` : r.text;
    if (!g.refByCode[r.translation_code]) g.refByCode[r.translation_code] = r.ref;
  }

  // ref canônico: as traduções estão no eixo de display, então seu ref serve
  // direto. O ref do original vive na numeração org (que pode estar adiantada ou
  // em outro capítulo), então nunca é canônico — quando só há original, montamos o
  // ref a partir do display verse.
  const canonicalRef = (g: Grouped): string => {
    for (const t of selected) {
      if (t.code === originalForBook) continue;
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
