import 'server-only';
import { getChapter, type Book, type Token } from './corpus';
import { getHebrewChapter, type HebrewWord } from './hebrew';
import { getParallelChapter, type Translation } from './translations';
import { groupByDisplay, originalChapterWindow } from './versification';

// ── Vista unificada do capítulo ────────────────────────────────────────────
//
// Funde as DUAS fontes do capítulo numa estrutura só, alinhada por número de
// versículo:
//   - traduções (lib/translations) → texto plano por versão, de `verse_texts`;
//   - grego original (lib/corpus)   → tokens com lema/morfologia, de `tokens`.
//
// O grego existe nas duas tabelas: como texto plano em `verse_texts`
// (`grc-sblgnt`) e como tokens em `tokens`. Para a coluna original renderizamos
// os TOKENS (interlinear clicável), caindo para o texto plano só se faltarem
// tokens num versículo. Assim a tela única compara versões E mostra a definição
// das palavras gregas. É um Aggregate: compõe duas leituras já cacheadas, então
// não precisa de cache próprio.
//
// No AT a coluna original é hebraica: o texto plano vem de `verse_texts`
// (`hbo-wlc`) e o interlinear (palavras clicáveis com morfemas/morfologia) de
// `hebrew_words`. Mesmo padrão do grego — renderiza as PALAVRAS quando existem,
// caindo para o texto plano por versículo.

export interface ChapterViewRow {
  verse: number;
  ref: string;
  // Tokens gregos do versículo (só para a coluna original). null quando: não há
  // coluna original selecionada; o capítulo não existe no corpus tokenizado
  // (getChapter null); ou o versículo específico não foi tokenizado. Nesses casos
  // a coluna original cai para o texto plano (ou "—" se também ausente).
  tokens: Token[] | null;
  // Palavras hebraicas do versículo (só para a coluna original no AT). null pelos
  // mesmos motivos dos tokens; nesse caso a coluna cai para o texto plano hebraico.
  hebrewWords: HebrewWord[] | null;
  // Texto plano por código de versão (inclui o original plano como fallback).
  texts: Record<string, string | null>;
}

export interface ChapterView {
  book: Book;
  number: number;
  chapters: number[];
  translations: Translation[];
  rows: ChapterViewRow[];
}

/**
 * Capítulo unificado para as versões pedidas (`codes`). A coluna `is_original`
 * traz tokens gregos; as demais, texto plano. Retorna null se o livro/capítulo
 * não existir.
 */
export async function getChapterView(
  osis: string,
  chapter: number,
  codes: string[],
): Promise<ChapterView | null> {
  const parallel = await getParallelChapter(osis, chapter, codes);
  if (!parallel) return null;

  const original = parallel.translations.find((t) => t.is_original) ?? null;

  // Interlinear só importa para a coluna original e depende da língua:
  //   - grego (NT) → tokens de `tokens`;
  //   - hebraico (AT) → palavras de `hebrew_words`.
  // Buscamos apenas o lado relevante; o outro fica null.
  const greek = original?.language === 'grc' ? await getChapter(osis, chapter) : null;
  const tokensByVerse = new Map<number, Token[]>();
  if (greek) {
    for (const v of greek.verses) tokensByVerse.set(v.verse, v.tokens);
  }

  // O interlinear hebraico vive na numeração do TM (org), que diverge do eixo de
  // display: títulos de Salmo são numerados e fronteiras de capítulo movidas trazem
  // versos de capítulos org vizinhos para este capítulo de display. Buscamos a
  // janela [ch-1, ch, ch+1] e reagrupamos cada palavra no verso de display via
  // originalToDisplay (título → display verse 0). No NT a coluna é grega e este
  // bloco nem roda.
  let hebrewByDisplay: Map<number, HebrewWord[]> | null = null;
  if (original?.language === 'hbo') {
    const orgChapters = originalChapterWindow(chapter);
    const fetched = await Promise.all(orgChapters.map((c) => getHebrewChapter(osis, c)));
    const words: Array<{ chapter: number; verse: number; word: HebrewWord }> = [];
    orgChapters.forEach((c, i) => {
      const hc = fetched[i];
      if (!hc) return;
      for (const v of hc.verses) for (const w of v.words) words.push({ chapter: c, verse: v.verse, word: w });
    });
    hebrewByDisplay = new Map();
    for (const [dv, items] of groupByDisplay(osis, chapter, words, (x) => x)) {
      hebrewByDisplay.set(dv, items.map((x) => x.word));
    }
  }
  const hebrewForRow = (displayVerse: number): HebrewWord[] | null =>
    hebrewByDisplay?.get(displayVerse) ?? null;

  const rows: ChapterViewRow[] = parallel.rows.map((r) => ({
    verse: r.verse,
    ref: r.ref,
    tokens: greek ? tokensByVerse.get(r.verse) ?? null : null,
    hebrewWords: hebrewForRow(r.verse),
    texts: r.texts,
  }));

  return {
    book: parallel.book,
    number: parallel.number,
    chapters: parallel.chapters,
    translations: parallel.translations,
    rows,
  };
}
