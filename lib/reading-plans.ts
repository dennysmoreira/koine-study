// ── Planos de leitura ───────────────────────────────────────────────────────
//
// Catálogo ESTÁTICO de planos (conteúdo curado, não dado de usuário) — vive em
// código, sem tabela. Cada plano é uma sequência de DIAS; cada dia tem uma ou
// mais leituras (capítulos). As leituras são geradas a partir das contagens
// canônicas de capítulos por livro (numeração protestante = eixo de display do
// app), então os links caem direto no comparador. O PROGRESSO do usuário (quais
// dias concluídos) é que vive no banco (reading_progress, RLS) — ver lib/reading-progress.

export interface Reading {
  osis: string;
  chapter: number;
}

export interface PlanDay {
  /** índice 1-based do dia no plano. */
  day: number;
  readings: Reading[];
}

export interface ReadingPlan {
  id: string;
  title: string;
  description: string;
  days: PlanDay[];
}

// Contagem canônica de capítulos por livro, na ordem do cânon (osis_code = OSIS,
// igual ao books.osis_code). Numeração protestante (eixo de display).
const BOOKS: { osis: string; chapters: number }[] = [
  { osis: 'Gen', chapters: 50 }, { osis: 'Exod', chapters: 40 }, { osis: 'Lev', chapters: 27 },
  { osis: 'Num', chapters: 36 }, { osis: 'Deut', chapters: 34 }, { osis: 'Josh', chapters: 24 },
  { osis: 'Judg', chapters: 21 }, { osis: 'Ruth', chapters: 4 }, { osis: '1Sam', chapters: 31 },
  { osis: '2Sam', chapters: 24 }, { osis: '1Kgs', chapters: 22 }, { osis: '2Kgs', chapters: 25 },
  { osis: '1Chr', chapters: 29 }, { osis: '2Chr', chapters: 36 }, { osis: 'Ezra', chapters: 10 },
  { osis: 'Neh', chapters: 13 }, { osis: 'Esth', chapters: 10 }, { osis: 'Job', chapters: 42 },
  { osis: 'Ps', chapters: 150 }, { osis: 'Prov', chapters: 31 }, { osis: 'Eccl', chapters: 12 },
  { osis: 'Song', chapters: 8 }, { osis: 'Isa', chapters: 66 }, { osis: 'Jer', chapters: 52 },
  { osis: 'Lam', chapters: 5 }, { osis: 'Ezek', chapters: 48 }, { osis: 'Dan', chapters: 12 },
  { osis: 'Hos', chapters: 14 }, { osis: 'Joel', chapters: 3 }, { osis: 'Amos', chapters: 9 },
  { osis: 'Obad', chapters: 1 }, { osis: 'Jonah', chapters: 4 }, { osis: 'Mic', chapters: 7 },
  { osis: 'Nah', chapters: 3 }, { osis: 'Hab', chapters: 3 }, { osis: 'Zeph', chapters: 3 },
  { osis: 'Hag', chapters: 2 }, { osis: 'Zech', chapters: 14 }, { osis: 'Mal', chapters: 4 },
  { osis: 'Matt', chapters: 28 }, { osis: 'Mark', chapters: 16 }, { osis: 'Luke', chapters: 24 },
  { osis: 'John', chapters: 21 }, { osis: 'Acts', chapters: 28 }, { osis: 'Rom', chapters: 16 },
  { osis: '1Cor', chapters: 16 }, { osis: '2Cor', chapters: 13 }, { osis: 'Gal', chapters: 6 },
  { osis: 'Eph', chapters: 6 }, { osis: 'Phil', chapters: 4 }, { osis: 'Col', chapters: 4 },
  { osis: '1Thess', chapters: 5 }, { osis: '2Thess', chapters: 3 }, { osis: '1Tim', chapters: 6 },
  { osis: '2Tim', chapters: 4 }, { osis: 'Titus', chapters: 3 }, { osis: 'Phlm', chapters: 1 },
  { osis: 'Heb', chapters: 13 }, { osis: 'Jas', chapters: 5 }, { osis: '1Pet', chapters: 5 },
  { osis: '2Pet', chapters: 3 }, { osis: '1John', chapters: 5 }, { osis: '2John', chapters: 1 },
  { osis: '3John', chapters: 1 }, { osis: 'Jude', chapters: 1 }, { osis: 'Rev', chapters: 22 },
];

const byOsis = new Map(BOOKS.map((b) => [b.osis, b]));

// Catálogo leve (osis + nº de capítulos, ordem canônica) para o formulário de
// plano personalizado calcular a prévia ("X capítulos → Y dias") no cliente sem
// arrastar os PLANS inteiros para o bundle.
export const BOOK_CATALOG: ReadonlyArray<{ osis: string; chapters: number }> = BOOKS;

/** nº de capítulos de um livro (0 se osis desconhecido). */
export function chapterCountOf(osis: string): number {
  return byOsis.get(osis)?.chapters ?? 0;
}

// Expande uma lista de livros (por osis) na sequência plana de capítulos.
function chaptersOf(osisList: string[]): Reading[] {
  const out: Reading[] = [];
  for (const osis of osisList) {
    const b = byOsis.get(osis);
    if (!b) continue;
    for (let c = 1; c <= b.chapters; c++) out.push({ osis, chapter: c });
  }
  return out;
}

// Agrupa as leituras em dias de `perDay` capítulos (o último dia pode ter menos).
function intoDays(readings: Reading[], perDay: number): PlanDay[] {
  const days: PlanDay[] = [];
  for (let i = 0; i < readings.length; i += perDay) {
    days.push({ day: days.length + 1, readings: readings.slice(i, i + perDay) });
  }
  return days;
}

/**
 * Deriva os dias de um plano a partir da "receita" (livros + capítulos/dia) —
 * usada pelos planos fixos abaixo E pelos planos personalizados (custom_plans),
 * que armazenam só a receita e derivam os dias deterministicamente.
 */
export function buildPlanDays(osisList: string[], perDay: number): PlanDay[] {
  return intoDays(chaptersOf(osisList), perDay);
}

const NT = BOOKS.slice(39).map((b) => b.osis); // Mateus → Apocalipse
const ALL = BOOKS.map((b) => b.osis);

export const PLANS: ReadingPlan[] = [
  {
    id: 'gospels',
    title: 'Evangelhos',
    description: 'Mateus a João, um capítulo por dia (89 dias).',
    days: intoDays(chaptersOf(['Matt', 'Mark', 'Luke', 'John']), 1),
  },
  {
    id: 'nt',
    title: 'Novo Testamento',
    description: 'Todo o NT, um capítulo por dia (260 dias).',
    days: intoDays(chaptersOf(NT), 1),
  },
  {
    id: 'psalms',
    title: 'Salmos',
    description: 'Os 150 salmos, um por dia.',
    days: intoDays(chaptersOf(['Ps']), 1),
  },
  {
    id: 'bible',
    title: 'Bíblia inteira',
    description: 'Toda a Bíblia, três capítulos por dia (~397 dias).',
    days: intoDays(chaptersOf(ALL), 3),
  },
];

export function getPlan(id: string): ReadingPlan | undefined {
  return PLANS.find((p) => p.id === id);
}
