import 'server-only';
import { getChapter, getBookByOsis, type Book, type Token } from './corpus';
import { getHebrewChapter, type HebrewWord } from './hebrew';
import { getParallelChapter, getTranslations, type Translation } from './translations';
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
//
// DIETA DE PAYLOAD (fronteira servidor→cliente): este módulo NORMALIZA o que
// viaja ao Comparator. Os dados de léxico não vão embutidos por ocorrência —
// palavras repetidas (καί ~50×/capítulo) duplicavam a mesma entrada e o HTML de
// um capítulo passava de 1 MB (e o App Router ainda envia as props 2×: HTML +
// payload RSC). Em vez disso:
//   - cada token/morfema leva só os campos de RENDERIZAÇÃO + uma CHAVE de léxico;
//   - o capítulo leva UM índice por idioma (cada lema/Strong's uma única vez);
//   - textos longos (Abbott-Smith, LSJ) nem entram: o TokenSheet busca sob
//     demanda ao abrir (fetchLexicon).

/** Token enxuto para o cliente: campos de exibição + análise; léxico via chave. */
export interface LeanToken {
  position: number;
  surface: string;
  gloss_context: string | null;
  m_pos: string | null;
  m_tense: string | null;
  m_voice: string | null;
  m_mood: string | null;
  m_case: string | null;
  m_number: string | null;
  m_gender: string | null;
  m_person: string | null;
  /** chave no greekLexicon do capítulo (null = token sem lema). */
  lemmaKey: string | null;
}

/** Entrada do léxico grego do capítulo (1× por lema, sem textos longos). */
export interface ChapterLemma {
  lemma: string;
  gloss_pt: string | null;
  gloss_en: string | null;
  strongs: string | null;
}

/** Morfema hebraico enxuto: grafema + chave (Strong's) no hebrewLexicon. */
export interface LeanMorpheme {
  surface: string;
  lemmaRaw: string;
  strongs: string | null;
  code: string | null;
}

export interface LeanHebrewWord {
  position: number;
  surface: string;
  morphemes: LeanMorpheme[];
}

/** Entrada do léxico hebraico do capítulo (1× por Strong's). */
export interface HebrewLexemeInfo {
  form: string | null;
  xlit: string | null;
  pron: string | null;
  gloss: string | null;
  bdbDef: string | null;
}

export interface ChapterViewRow {
  verse: number;
  ref: string;
  // Tokens gregos do versículo (só para a coluna original). null quando: não há
  // coluna original selecionada; o capítulo não existe no corpus tokenizado
  // (getChapter null); ou o versículo específico não foi tokenizado. Nesses casos
  // a coluna original cai para o texto plano (ou "—" se também ausente).
  tokens: LeanToken[] | null;
  // Palavras hebraicas do versículo (só para a coluna original no AT). null pelos
  // mesmos motivos dos tokens; nesse caso a coluna cai para o texto plano hebraico.
  hebrewWords: LeanHebrewWord[] | null;
  // Texto plano por código de versão (inclui o original plano como fallback).
  texts: Record<string, string | null>;
}

export interface ChapterView {
  book: Book;
  number: number;
  chapters: number[];
  translations: Translation[];
  rows: ChapterViewRow[];
  /** léxico grego do capítulo, chaveado por lemmaKey (deduplicado). */
  greekLexicon: Record<string, ChapterLemma>;
  /** léxico hebraico do capítulo, chaveado por Strong's (deduplicado). */
  hebrewLexicon: Record<string, HebrewLexemeInfo>;
}

// Chave estável do lema no índice do capítulo. O headword sozinho colide em
// homógrafos; o par (headword, Strong's) os distingue.
function lemmaKeyOf(lemma: { lemma: string; strongs: string | null }): string {
  return `${lemma.lemma}#${lemma.strongs ?? ''}`;
}

/**
 * Capítulo unificado para as versões pedidas (`codes`). A coluna `is_original`
 * traz tokens gregos; as demais, texto plano. Retorna null se o livro/capítulo
 * não existir.
 *
 * As fontes são buscadas em PARALELO: o catálogo cacheado (livro + traduções)
 * decide de antemão se o interlinear é grego ou hebraico, então o texto paralelo
 * e o interlinear partem juntos — antes eram duas idas sequenciais ao banco.
 */
export async function getChapterView(
  osis: string,
  chapter: number,
  codes: string[],
): Promise<ChapterView | null> {
  const [book, catalog] = await Promise.all([getBookByOsis(osis), getTranslations()]);
  if (!book) return null;

  // O interlinear só importa quando alguma versão original foi pedida; a língua
  // (grego/hebraico) segue o testamento do livro — mesmo critério que o
  // getParallelChapter usa para trocar a coluna original.
  const originalCodes = new Set(catalog.filter((t) => t.is_original).map((t) => t.code));
  const wantsOriginal = codes.some((c) => originalCodes.has(c));
  const isOT = book.testament === 'OT';

  const [parallel, greek, hebrewFetched] = await Promise.all([
    getParallelChapter(osis, chapter, codes),
    wantsOriginal && !isOT ? getChapter(osis, chapter) : Promise.resolve(null),
    // O interlinear hebraico vive na numeração do TM (org), que diverge do eixo
    // de display: títulos de Salmo são numerados e fronteiras movidas trazem
    // versos de capítulos org vizinhos. Busca a janela [ch-1, ch, ch+1].
    wantsOriginal && isOT
      ? Promise.all(originalChapterWindow(chapter).map((c) => getHebrewChapter(osis, c)))
      : Promise.resolve(null),
  ]);
  if (!parallel) return null;

  // ── Grego: tokens enxutos + índice de lemas do capítulo ──
  const greekLexicon: Record<string, ChapterLemma> = {};
  const toLeanTokens = (tokens: Token[]): LeanToken[] =>
    tokens.map((t) => {
      let lemmaKey: string | null = null;
      if (t.lemma) {
        lemmaKey = lemmaKeyOf(t.lemma);
        if (!greekLexicon[lemmaKey]) {
          greekLexicon[lemmaKey] = {
            lemma: t.lemma.lemma,
            gloss_pt: t.lemma.gloss_pt,
            gloss_en: t.lemma.gloss_en,
            strongs: t.lemma.strongs,
          };
        }
      }
      return {
        position: t.position,
        surface: t.surface,
        gloss_context: t.gloss_context,
        m_pos: t.m_pos,
        m_tense: t.m_tense,
        m_voice: t.m_voice,
        m_mood: t.m_mood,
        m_case: t.m_case,
        m_number: t.m_number,
        m_gender: t.m_gender,
        m_person: t.m_person,
        lemmaKey,
      };
    });

  const tokensByVerse = new Map<number, LeanToken[]>();
  if (greek) {
    for (const v of greek.verses) tokensByVerse.set(v.verse, toLeanTokens(v.tokens));
  }

  // ── Hebraico: palavras enxutas + índice por Strong's; reagrupado no eixo de
  // display via groupByDisplay (título → display verse 0). ──
  const hebrewLexicon: Record<string, HebrewLexemeInfo> = {};
  const toLeanWord = (w: HebrewWord): LeanHebrewWord => ({
    position: w.position,
    surface: w.surface,
    morphemes: w.morphemes.map((m) => {
      if (m.strongs && !hebrewLexicon[m.strongs]) {
        hebrewLexicon[m.strongs] = {
          form: m.lemmaForm,
          xlit: m.xlit,
          pron: m.pron,
          gloss: m.gloss,
          bdbDef: m.bdbDef,
        };
      }
      return { surface: m.surface, lemmaRaw: m.lemmaRaw, strongs: m.strongs, code: m.code };
    }),
  });

  let hebrewByDisplay: Map<number, LeanHebrewWord[]> | null = null;
  if (hebrewFetched) {
    const orgChapters = originalChapterWindow(chapter);
    const words: Array<{ chapter: number; verse: number; word: LeanHebrewWord }> = [];
    orgChapters.forEach((c, i) => {
      const hc = hebrewFetched[i];
      if (!hc) return;
      for (const v of hc.verses) for (const w of v.words) words.push({ chapter: c, verse: v.verse, word: toLeanWord(w) });
    });
    hebrewByDisplay = new Map();
    for (const [dv, items] of groupByDisplay(osis, chapter, words, (x) => x)) {
      hebrewByDisplay.set(dv, items.map((x) => x.word));
    }
  }
  const hebrewForRow = (displayVerse: number): LeanHebrewWord[] | null =>
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
    greekLexicon,
    hebrewLexicon,
  };
}
