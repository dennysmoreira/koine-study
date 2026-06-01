/**
 * Tipos e helpers ISOMÓRFICOS das "anotações pessoais" — sem `server-only`, para
 * poderem ser usados tanto em Server Components quanto em Client Components
 * (o comparador, as folhas de edição, o seletor de referências).
 *
 * As LEITURAS no banco (com sessão por cookie/RLS) ficam em `annotations-server.ts`.
 */

/**
 * Referência bíblica relacionada anexada a uma anotação (passagem além da âncora).
 * Mesma forma de uma faixa de versículos: cobre verseStart..verseEnd de um livro.
 */
export interface CrossRef {
  osis: string;
  bookName: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  ref: string;
}

export interface Annotation {
  id: number;
  osis: string;
  bookName: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  ref: string;
  body: string;
  crossRefs: CrossRef[];
  createdAt: string;
  updatedAt: string;
}

/** Rótulo legível de uma faixa de versículos ("João 3:16" ou "João 3:16-18"). */
export function annotationLabel(a: Pick<Annotation, 'bookName' | 'chapter' | 'verseStart' | 'verseEnd'>): string {
  const range = a.verseStart === a.verseEnd ? `${a.verseStart}` : `${a.verseStart}-${a.verseEnd}`;
  return `${a.bookName} ${a.chapter}:${range}`;
}

/** Monta o rótulo `ref` de uma faixa (reaproveitado pelo seletor de referências). */
export function rangeRef(bookName: string, chapter: number, verseStart: number, verseEnd: number): string {
  const range = verseStart === verseEnd ? `${verseStart}` : `${verseStart}-${verseEnd}`;
  return `${bookName} ${chapter}:${range}`;
}

// Fronteira de confiança das referências bíblicas. O `osis` vira segmento de URL
// no comparador (/compare/{osis}/{chapter}); restringir ao charset alfanumérico
// barra path traversal e injeção de query, que o escape de HTML do React NÃO cobre
// (ele protege atributos, não a semântica da URL). Os tetos evitam payload abusivo
// e estouro das colunas smallint (chapter/verse) do banco.
export const OSIS_RE = /^[A-Za-z0-9]{1,16}$/;
export const MAX_BOOK_NAME_LEN = 64;
export const MAX_CHAPTER = 200;
export const MAX_VERSE = 200;

/**
 * Valida e normaliza UMA referência relacionada vinda de fonte não confiável
 * (cliente). Recusa charset/comprimento/limites inválidos; reconstrói o rótulo
 * `ref` no servidor para não confiar no texto do cliente. Retorna null se inválida.
 */
export function sanitizeCrossRef(r: unknown): CrossRef | null {
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>;
  const osis = o.osis;
  const bookName = o.bookName;
  const chapter = o.chapter;
  const verseStart = o.verseStart;
  const verseEnd = o.verseEnd;
  if (
    typeof osis !== 'string' ||
    !OSIS_RE.test(osis) ||
    typeof bookName !== 'string' ||
    bookName.length === 0 ||
    bookName.length > MAX_BOOK_NAME_LEN ||
    !Number.isInteger(chapter) ||
    !Number.isInteger(verseStart) ||
    !Number.isInteger(verseEnd) ||
    (chapter as number) < 1 ||
    (chapter as number) > MAX_CHAPTER ||
    (verseStart as number) < 1 ||
    (verseEnd as number) < (verseStart as number) ||
    (verseEnd as number) > MAX_VERSE
  ) {
    return null;
  }
  const ch = chapter as number;
  const vs = verseStart as number;
  const ve = verseEnd as number;
  return { osis, bookName, chapter: ch, verseStart: vs, verseEnd: ve, ref: rangeRef(bookName, ch, vs, ve) };
}

/**
 * Normaliza uma lista de referências relacionadas para LEITURA (ex.: vinda do
 * JSONB cross_refs). Descarta entradas inválidas em vez de quebrar a página.
 */
export function parseCrossRefs(raw: unknown): CrossRef[] {
  if (!Array.isArray(raw)) return [];
  const out: CrossRef[] = [];
  for (const item of raw) {
    const ref = sanitizeCrossRef(item);
    if (ref) out.push(ref);
  }
  return out;
}
