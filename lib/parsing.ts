import { supabase } from './supabase';
import { MORPH_LABELS, DIMENSION_COLUMN, DIMENSION_TITLE, type MorphDimension } from './morph-labels';

// Dimensões com conjunto de opções pequeno e sempre presente na POS-alvo.
// Voz (variações depoentes → muitas opções) e pessoa (nula em particípio/infinitivo)
// ficam de fora do MVP para manter o quiz objetivo.
const VERB_DIMS: MorphDimension[] = ['tense', 'mood'];
const NOUN_DIMS: MorphDimension[] = ['case', 'gender', 'number'];

export interface ParsingOption {
  value: string;
  label: string;
}

export interface ParsingQuestion {
  tokenId: number;
  dimension: MorphDimension;
  questionType: string; // identify_<dim>
  title: string;
  surface: string;
  lemma: string | null;
  gloss: string | null;
  verseRef: string;
  context: { surface: string; isTarget: boolean }[];
  options: ParsingOption[];
}

// O corpus é estático (NT read-only); cacheamos a contagem por (pos, coluna) no
// processo para não recontar a cada questão.
const countCache = new Map<string, number>();

async function tokenCount(pos: string, col: string): Promise<number> {
  const key = `${pos}|${col}`;
  const cached = countCache.get(key);
  if (cached != null) return cached;
  const { count, error } = await supabase
    .from('tokens')
    .select('id', { count: 'exact', head: true })
    .eq('m_pos', pos)
    .not(col, 'is', null);
  if (error) throw new Error(`tokenCount: ${error.message}`);
  const total = count ?? 0;
  countCache.set(key, total);
  return total;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

type RawTok = {
  id: number;
  surface: string;
  position: number;
  verse_id: number;
  lemmas: { lemma: string; gloss_pt: string | null; gloss_en: string | null } | { lemma: string; gloss_pt: string | null; gloss_en: string | null }[] | null;
};

// Gera uma questão de parsing. NÃO inclui a resposta correta — a validação é
// feita server-side em submitAnswer relendo a coluna m_<dim> do token.
export async function getParsingQuestion(): Promise<ParsingQuestion> {
  const isVerb = Math.random() < 0.5;
  const pos = isVerb ? 'verb' : 'noun';
  const dimension = pick(isVerb ? VERB_DIMS : NOUN_DIMS);
  const col = DIMENSION_COLUMN[dimension];

  const total = await tokenCount(pos, col);
  const offset = Math.floor(Math.random() * total);

  const { data: tok, error: tokErr } = await supabase
    .from('tokens')
    .select('id,surface,position,verse_id,lemmas(lemma,gloss_pt,gloss_en)')
    .eq('m_pos', pos)
    .not(col, 'is', null)
    .order('id')
    .range(offset, offset)
    .single();
  if (tokErr) throw new Error(`getParsingQuestion/token: ${tokErr.message}`);

  const raw = tok as unknown as RawTok;
  const lex = Array.isArray(raw.lemmas) ? raw.lemmas[0] : raw.lemmas;

  const { data: verse, error: verseErr } = await supabase
    .from('verses')
    .select('ref,tokens(surface,position)')
    .eq('id', raw.verse_id)
    .single();
  if (verseErr) throw new Error(`getParsingQuestion/verse: ${verseErr.message}`);

  const verseRow = verse as unknown as { ref: string; tokens: { surface: string; position: number }[] };
  const context = [...verseRow.tokens]
    .sort((a, b) => a.position - b.position)
    .map((t) => ({ surface: t.surface, isTarget: t.position === raw.position }));

  const options = shuffle(
    Object.entries(MORPH_LABELS[dimension]).map(([value, label]) => ({ value, label })),
  );

  return {
    tokenId: raw.id,
    dimension,
    questionType: `identify_${dimension}`,
    title: DIMENSION_TITLE[dimension],
    surface: raw.surface,
    lemma: lex?.lemma ?? null,
    gloss: lex?.gloss_pt ?? lex?.gloss_en ?? null,
    verseRef: verseRow.ref,
    context,
    options,
  };
}
