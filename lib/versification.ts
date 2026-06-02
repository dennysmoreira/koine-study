import { OT_ENG_TO_ORG } from './versification-data';

// ── Versificação: Texto Massorético (hebraico) × numeração protestante ──────
//
// O hebraico (WLC) é armazenado na numeração do Texto Massorético (TM/`org`); as
// traduções protestantes (NVI, ACF, AA, Bíblia Livre, WEB) seguem a numeração
// inglesa/protestante (`eng`), que é o EIXO DE DISPLAY do app — o número que o
// usuário navega (goto), cita e ancora anotações. As duas numerações divergem em
// dezenas de capítulos do AT, não só nos títulos dos Salmos:
//   - título de Salmo: o TM numera o título como versículo(s); o eng não (→ v0);
//   - fronteira de capítulo movida: ex. eng 1Kgs 4:21-34 = org 1Kgs 5:1-14;
//   - deslocamento de ±1 no fim do capítulo: ex. eng Deut 12:32 = org Deut 13:1.
//
// Em vez de reescrever os dados (que vivem na numeração canônica de cada fonte),
// traduzimos as coordenadas numa única fronteira (Anti-Corruption Layer). O mapa
// `OT_ENG_TO_ORG` (Copenhagen Alliance, CC BY-SA 4.0) lista pares eng↔org com
// ranges; aqui expandimos para um índice verso-a-verso e expomos a direção que o
// comparador precisa: dado um versículo ORIGINAL (org), em qual linha de DISPLAY
// (eng) ele entra. Fora do AT (NT grego) não há divergência: identidade.

export interface DisplayRef {
  chapter: number;
  // 0 = linha de título (superscrição do Salmo), renderizada à parte.
  verse: number;
}

interface ParsedRange {
  osis: string;
  chapter: number;
  vStart: number;
  vEnd: number;
}

// "Ps 18:0-50" / "Gen 31:55" → {osis, chapter, vStart, vEnd}
function parseRange(ref: string): ParsedRange {
  const sp = ref.lastIndexOf(' ');
  const osis = ref.slice(0, sp);
  const cv = ref.slice(sp + 1);
  const [chPart, vPart = ''] = cv.split(':');
  const chapter = Number(chPart);
  const dash = vPart.indexOf('-');
  if (dash === -1) {
    const v = Number(vPart);
    return { osis, chapter, vStart: v, vEnd: v };
  }
  return {
    osis,
    chapter,
    vStart: Number(vPart.slice(0, dash)),
    vEnd: Number(vPart.slice(dash + 1)),
  };
}

const orgKey = (osis: string, chapter: number, verse: number) => `${osis} ${chapter}:${verse}`;

// org (TM) → display (eng). Construído invertendo cada par eng↔org expandido.
const ORG_TO_DISPLAY = new Map<string, DisplayRef>();
// Por (osis, capítulo org com título): o maior versículo org coberto pelo título
// (= verso org que o eng v0 aponta). Versículos org ≤ esse valor sem mapeamento
// próprio são versos de título órfãos (caso offset +2) e também caem no display 0.
const TITLE_ANCHOR = new Map<string, number>();

for (const [engRef, orgRef] of OT_ENG_TO_ORG) {
  const eng = parseRange(engRef);
  const org = parseRange(orgRef);
  const len = eng.vEnd - eng.vStart;
  for (let i = 0; i <= len; i++) {
    const engV = eng.vStart + i;
    const orgV = org.vStart + i;
    ORG_TO_DISPLAY.set(orgKey(org.osis, org.chapter, orgV), {
      chapter: eng.chapter,
      verse: engV,
    });
    if (engV === 0) {
      const k = `${eng.osis} ${org.chapter}`;
      const prev = TITLE_ANCHOR.get(k) ?? 0;
      if (orgV > prev) TITLE_ANCHOR.set(k, orgV);
    }
  }
}

/**
 * Linha de DISPLAY (eixo eng/protestante) em que um versículo ORIGINAL (org/TM)
 * deve aparecer. Identidade quando não há divergência (todo o NT e a maioria do
 * AT). `verse === 0` indica a linha de título do Salmo. Versos de merge (ex.: org
 * 1Kgs 22:43, absorvido pelo eng 22:43) caem na mesma linha do seu par e são
 * concatenados pelo chamador.
 */
export function originalToDisplay(osis: string, chapter: number, verse: number): DisplayRef {
  const mapped = ORG_TO_DISPLAY.get(orgKey(osis, chapter, verse));
  if (mapped) return mapped;
  // Verso de título órfão (offset +2): antes da âncora e sem mapa próprio.
  const anchor = TITLE_ANCHOR.get(`${osis} ${chapter}`);
  if (anchor !== undefined && verse <= anchor) return { chapter, verse: 0 };
  // Sem divergência: o número original já é o número de display.
  return { chapter, verse };
}

/**
 * O capítulo (no eixo de display) tem linha de título de Salmo? Usado para decidir
 * se a coluna original precisa buscar versículos do TM que não têm contrapartida
 * nas traduções.
 */
export function displayChapterHasTitle(osis: string, chapter: number): boolean {
  return TITLE_ANCHOR.has(`${osis} ${chapter}`);
}

/**
 * Os capítulos ORIGINAIS (org/TM) que podem conter versículos exibidos no capítulo
 * de DISPLAY `chapter`. As fronteiras movidas deslocam blocos no máximo ±1 capítulo
 * (ex.: eng 1Kgs 4:21-34 = org 1Kgs 5:1-14), então a janela [ch-1, ch, ch+1] cobre
 * toda divergência conhecida. Usado por quem lê dados na numeração original e
 * precisa saber quais capítulos buscar para montar um capítulo de display.
 */
export function originalChapterWindow(chapter: number): number[] {
  return [chapter - 1, chapter, chapter + 1].filter((c) => c >= 1);
}

/**
 * Reagrupa itens na numeração ORIGINAL (org/TM) no capítulo de DISPLAY `chapter`
 * (eixo eng/protestante). Cada item expõe sua coordenada org via `getCoord`;
 * traduzimos com [[originalToDisplay]] e mantemos só os que caem em `chapter`. O
 * resultado é um Map<displayVerse, T[]> (displayVerse 0 = linha de título), com a
 * ordem de inserção preservada — passe os itens já ordenados por (capítulo,
 * versículo) para que merges e títulos concatenem na ordem correta.
 */
export function groupByDisplay<T>(
  osis: string,
  chapter: number,
  items: readonly T[],
  getCoord: (item: T) => { chapter: number; verse: number },
): Map<number, T[]> {
  const groups = new Map<number, T[]>();
  for (const item of items) {
    const { chapter: orgChapter, verse: orgVerse } = getCoord(item);
    const dv = originalToDisplay(osis, orgChapter, orgVerse);
    if (dv.chapter !== chapter) continue;
    const list = groups.get(dv.verse);
    if (list) list.push(item);
    else groups.set(dv.verse, [item]);
  }
  return groups;
}
