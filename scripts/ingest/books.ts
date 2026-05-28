/**
 * Mapa dos 27 livros do NT no esquema de códigos do byztxt (nome do arquivo CSV).
 * id segue a ordem canônica do cânon protestante (40 = Mateus … 66 = Apocalipse).
 * name_grc deixado null por ora (será preenchido com os títulos gregos tradicionais
 * numa etapa posterior, para evitar introduzir grego incorreto agora).
 */
export interface BookMeta {
  code: string; // código do arquivo byztxt (ex.: "MAT", "1JO")
  id: number;
  osis: string;
  name_pt: string;
  sort_order: number;
}

export const BOOKS: BookMeta[] = [
  { code: 'MAT', id: 40, osis: 'Matt', name_pt: 'Mateus', sort_order: 1 },
  { code: 'MAR', id: 41, osis: 'Mark', name_pt: 'Marcos', sort_order: 2 },
  { code: 'LUK', id: 42, osis: 'Luke', name_pt: 'Lucas', sort_order: 3 },
  { code: 'JOH', id: 43, osis: 'John', name_pt: 'João', sort_order: 4 },
  { code: 'ACT', id: 44, osis: 'Acts', name_pt: 'Atos', sort_order: 5 },
  { code: 'ROM', id: 45, osis: 'Rom', name_pt: 'Romanos', sort_order: 6 },
  { code: '1CO', id: 46, osis: '1Cor', name_pt: '1 Coríntios', sort_order: 7 },
  { code: '2CO', id: 47, osis: '2Cor', name_pt: '2 Coríntios', sort_order: 8 },
  { code: 'GAL', id: 48, osis: 'Gal', name_pt: 'Gálatas', sort_order: 9 },
  { code: 'EPH', id: 49, osis: 'Eph', name_pt: 'Efésios', sort_order: 10 },
  { code: 'PHP', id: 50, osis: 'Phil', name_pt: 'Filipenses', sort_order: 11 },
  { code: 'COL', id: 51, osis: 'Col', name_pt: 'Colossenses', sort_order: 12 },
  { code: '1TH', id: 52, osis: '1Thess', name_pt: '1 Tessalonicenses', sort_order: 13 },
  { code: '2TH', id: 53, osis: '2Thess', name_pt: '2 Tessalonicenses', sort_order: 14 },
  { code: '1TI', id: 54, osis: '1Tim', name_pt: '1 Timóteo', sort_order: 15 },
  { code: '2TI', id: 55, osis: '2Tim', name_pt: '2 Timóteo', sort_order: 16 },
  { code: 'TIT', id: 56, osis: 'Titus', name_pt: 'Tito', sort_order: 17 },
  { code: 'PHM', id: 57, osis: 'Phlm', name_pt: 'Filemom', sort_order: 18 },
  { code: 'HEB', id: 58, osis: 'Heb', name_pt: 'Hebreus', sort_order: 19 },
  { code: 'JAM', id: 59, osis: 'Jas', name_pt: 'Tiago', sort_order: 20 },
  { code: '1PE', id: 60, osis: '1Pet', name_pt: '1 Pedro', sort_order: 21 },
  { code: '2PE', id: 61, osis: '2Pet', name_pt: '2 Pedro', sort_order: 22 },
  { code: '1JO', id: 62, osis: '1John', name_pt: '1 João', sort_order: 23 },
  { code: '2JO', id: 63, osis: '2John', name_pt: '2 João', sort_order: 24 },
  { code: '3JO', id: 64, osis: '3John', name_pt: '3 João', sort_order: 25 },
  { code: 'JUD', id: 65, osis: 'Jude', name_pt: 'Judas', sort_order: 26 },
  { code: 'REV', id: 66, osis: 'Rev', name_pt: 'Apocalipse', sort_order: 27 },
];

export const BOOK_BY_CODE = new Map(BOOKS.map((b) => [b.code, b]));

/** Normaliza um número de Strong para a forma canônica "G<n>" (sem zeros à esquerda). */
export function normalizeStrongs(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^0*(\d+)([a-zA-Z]?)$/);
  if (!m) return null;
  return `G${m[1]}${(m[2] ?? '').toLowerCase()}`;
}
