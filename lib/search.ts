/**
 * Busca no TEXTO bíblico (full-text search, config 'portuguese' — índice GIN em
 * verse_texts) + parser de REFERÊNCIA digitada ("Rm 8:28", "João 3", "1 Co 13").
 * server-only: usa a anon key do corpus; resultados são dados públicos imutáveis.
 */
import 'server-only';
import { supabase } from './supabase';
import { getBooks, type Book } from './corpus';
import { getTranslations } from './translations';

export interface SearchHit {
  osis: string;
  bookName: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface SearchOutcome {
  translationName: string;
  hits: SearchHit[];
  /** true quando o nº de resultados bateu no teto (há mais além dos exibidos). */
  capped: boolean;
}

const MAX_HITS = 60;

/**
 * Busca versículos por palavras numa tradução (a preferida do leitor; cai para a
 * primeira tradução do catálogo). websearch_to_tsquery entende aspas e "-termo".
 */
export async function searchVerses(
  query: string,
  preferredCode: string | null,
): Promise<SearchOutcome | null> {
  const q = query.trim();
  if (q.length < 2) return null;

  const [books, catalog] = await Promise.all([getBooks(), getTranslations()]);
  const preferred = preferredCode ? catalog.find((t) => t.code === preferredCode) : null;
  const translation =
    preferred && !preferred.is_original ? preferred : catalog.find((t) => !t.is_original) ?? null;
  if (!translation) return null;

  const { data, error } = await supabase
    .from('verse_texts')
    .select('book_id,chapter,verse,text')
    .eq('translation_code', translation.code)
    .textSearch('text', q, { config: 'portuguese', type: 'websearch' })
    .limit(MAX_HITS);
  if (error) throw new Error(`searchVerses: ${error.message}`);

  const byId = new Map(books.map((b) => [b.id, b]));
  const rows = (data ?? []) as Array<{ book_id: number; chapter: number; verse: number; text: string }>;

  const hits: SearchHit[] = rows
    .map((r) => ({ row: r, book: byId.get(r.book_id) }))
    .filter((x): x is { row: (typeof rows)[number]; book: Book } => Boolean(x.book))
    // ordem canônica (o PostgREST não garante ordem com FTS sem ranking)
    .sort(
      (a, b) =>
        a.book.sort_order - b.book.sort_order || a.row.chapter - b.row.chapter || a.row.verse - b.row.verse,
    )
    .map(({ row, book }) => ({
      osis: book.osis_code,
      bookName: book.name_pt,
      chapter: row.chapter,
      verse: row.verse,
      text: row.text,
    }));

  // capped pelo nº de LINHAS do banco (não de hits): se o teto foi atingido, há
  // mais resultados além dos exibidos, mesmo que algum hit caia no mapeamento.
  return { translationName: translation.name, hits, capped: rows.length >= MAX_HITS };
}

// ── Referência digitada ──────────────────────────────────────────────────────

export interface ParsedReference {
  osis: string;
  bookName: string;
  chapter: number;
  verse: number | null;
}

// Abreviações clássicas PT → OSIS (além do prefixo do nome completo, coberto
// pelo match abaixo). Minúsculas, sem acento.
const PT_ABBREVS: Record<string, string> = {
  gn: 'Gen', ex: 'Exod', lv: 'Lev', nm: 'Num', dt: 'Deut', js: 'Josh', jz: 'Judg', rt: 'Ruth',
  '1sm': '1Sam', '2sm': '2Sam', '1rs': '1Kgs', '2rs': '2Kgs', '1cr': '1Chr', '2cr': '2Chr',
  ed: 'Ezra', ne: 'Neh', et: 'Esth', jo: 'John', sl: 'Ps', pv: 'Prov', ec: 'Eccl', ct: 'Song',
  is: 'Isa', jr: 'Jer', lm: 'Lam', ez: 'Ezek', dn: 'Dan', os: 'Hos', jl: 'Joel', am: 'Amos',
  ob: 'Obad', jn: 'Jonah', mq: 'Mic', na: 'Nah', hc: 'Hab', sf: 'Zeph', ag: 'Hag', zc: 'Zech',
  ml: 'Mal', mt: 'Matt', mc: 'Mark', lc: 'Luke', at: 'Acts', rm: 'Rom', '1co': '1Cor',
  '2co': '2Cor', gl: 'Gal', ef: 'Eph', fp: 'Phil', cl: 'Col', '1ts': '1Thess', '2ts': '2Thess',
  '1tm': '1Tim', '2tm': '2Tim', tt: 'Titus', fm: 'Phlm', hb: 'Heb', tg: 'Jas', '1pe': '1Pet',
  '2pe': '2Pet', '1jo': '1John', '2jo': '2John', '3jo': '3John', jd: 'Jude', ap: 'Rev',
};

function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/**
 * Tenta interpretar a consulta como REFERÊNCIA ("rm 8:28", "joão 3.16",
 * "1 coríntios 13", "salmos 23"). Livro por abreviação clássica ou por prefixo
 * do nome PT (sem acento). Retorna null quando a consulta não tem essa cara —
 * aí é busca textual normal.
 *
 * Trade-off ACEITO: tokens curtos que também são palavras ("jo 3", "is 40")
 * sempre viram referência. Inofensivo porque o card "Ir para" é ADITIVO — ele
 * aparece ACIMA dos resultados da busca textual, nunca no lugar deles.
 */
export async function parseReference(query: string): Promise<ParsedReference | null> {
  // livro (pode começar com dígito: "1 co") + capítulo + versículo opcional
  const m = /^(\d?\s*[\p{L}.]+(?:\s+[\p{L}.]+)*)\s+(\d{1,3})(?:\s*[:. ]\s*(\d{1,3}))?$/u.exec(query.trim());
  if (!m) return null;

  const rawBook = normalize((m[1] ?? '').replace(/\./g, '').replace(/\s+/g, ' '));
  const chapter = Number(m[2]);
  const verse = m[3] ? Number(m[3]) : null;
  if (!Number.isInteger(chapter) || chapter < 1) return null;

  const books = await getBooks();

  // 1) abreviação clássica exata (sem espaços: "1 co" → "1co")
  const abbrevOsis = PT_ABBREVS[rawBook.replace(/\s+/g, '')];
  let book = abbrevOsis ? books.find((b) => b.osis_code === abbrevOsis) ?? null : null;

  // 2) prefixo do nome PT normalizado ("joa" → João; "1 cor" → 1 Coríntios).
  //    Exige 2+ letras após eventual dígito para não casar qualquer coisa.
  if (!book) {
    const letters = rawBook.replace(/[^a-z]/g, '');
    if (letters.length >= 2) {
      const matches = books.filter((b) => normalize(b.name_pt).startsWith(rawBook));
      if (matches.length === 1) book = matches[0] ?? null;
    }
  }

  if (!book) return null;
  return { osis: book.osis_code, bookName: book.name_pt, chapter, verse };
}
