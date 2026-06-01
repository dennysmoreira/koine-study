/**
 * Fonte única dos 39 livros do AT (cânon protestante).
 *
 * - `id` segue a ordem canônica (1 = Gênesis … 39 = Malaquias); o NT já ocupa
 *   40–66, então não há colisão de id.
 * - `osis` é o código OSIS, que também é o nome do arquivo no WLC do
 *   openscriptures/morphhb (ex.: "Gen" → "Gen.xml"). Reaproveitado pelas duas
 *   pontas (seed e ingestão hebraica), evitando um segundo mapa.
 * - `tb` é a abreviação do thiagobodruk/bible (traduções PT). ATENÇÃO: Jó é
 *   "jó" COM acento — normalizar removendo acentos colidiria com "jo" (João, NT).
 * - `sort_order` 1–39: o AT vem antes do NT na listagem (o NT será reordenado
 *   para 40–66 no seed, espelhando o id).
 */
export interface OtBookMeta {
  id: number;
  osis: string; // OSIS + nome do arquivo WLC (morphhb)
  name_pt: string;
  tb: string; // abreviação thiagobodruk/bible (PT)
  sort_order: number;
}

export const OT_BOOKS: OtBookMeta[] = [
  { id: 1, osis: 'Gen', name_pt: 'Gênesis', tb: 'gn', sort_order: 1 },
  { id: 2, osis: 'Exod', name_pt: 'Êxodo', tb: 'ex', sort_order: 2 },
  { id: 3, osis: 'Lev', name_pt: 'Levítico', tb: 'lv', sort_order: 3 },
  { id: 4, osis: 'Num', name_pt: 'Números', tb: 'nm', sort_order: 4 },
  { id: 5, osis: 'Deut', name_pt: 'Deuteronômio', tb: 'dt', sort_order: 5 },
  { id: 6, osis: 'Josh', name_pt: 'Josué', tb: 'js', sort_order: 6 },
  { id: 7, osis: 'Judg', name_pt: 'Juízes', tb: 'jz', sort_order: 7 },
  { id: 8, osis: 'Ruth', name_pt: 'Rute', tb: 'rt', sort_order: 8 },
  { id: 9, osis: '1Sam', name_pt: '1 Samuel', tb: '1sm', sort_order: 9 },
  { id: 10, osis: '2Sam', name_pt: '2 Samuel', tb: '2sm', sort_order: 10 },
  { id: 11, osis: '1Kgs', name_pt: '1 Reis', tb: '1rs', sort_order: 11 },
  { id: 12, osis: '2Kgs', name_pt: '2 Reis', tb: '2rs', sort_order: 12 },
  { id: 13, osis: '1Chr', name_pt: '1 Crônicas', tb: '1cr', sort_order: 13 },
  { id: 14, osis: '2Chr', name_pt: '2 Crônicas', tb: '2cr', sort_order: 14 },
  { id: 15, osis: 'Ezra', name_pt: 'Esdras', tb: 'ed', sort_order: 15 },
  { id: 16, osis: 'Neh', name_pt: 'Neemias', tb: 'ne', sort_order: 16 },
  { id: 17, osis: 'Esth', name_pt: 'Ester', tb: 'et', sort_order: 17 },
  { id: 18, osis: 'Job', name_pt: 'Jó', tb: 'jó', sort_order: 18 },
  { id: 19, osis: 'Ps', name_pt: 'Salmos', tb: 'sl', sort_order: 19 },
  { id: 20, osis: 'Prov', name_pt: 'Provérbios', tb: 'pv', sort_order: 20 },
  { id: 21, osis: 'Eccl', name_pt: 'Eclesiastes', tb: 'ec', sort_order: 21 },
  { id: 22, osis: 'Song', name_pt: 'Cânticos', tb: 'ct', sort_order: 22 },
  { id: 23, osis: 'Isa', name_pt: 'Isaías', tb: 'is', sort_order: 23 },
  { id: 24, osis: 'Jer', name_pt: 'Jeremias', tb: 'jr', sort_order: 24 },
  { id: 25, osis: 'Lam', name_pt: 'Lamentações', tb: 'lm', sort_order: 25 },
  { id: 26, osis: 'Ezek', name_pt: 'Ezequiel', tb: 'ez', sort_order: 26 },
  { id: 27, osis: 'Dan', name_pt: 'Daniel', tb: 'dn', sort_order: 27 },
  { id: 28, osis: 'Hos', name_pt: 'Oséias', tb: 'os', sort_order: 28 },
  { id: 29, osis: 'Joel', name_pt: 'Joel', tb: 'jl', sort_order: 29 },
  { id: 30, osis: 'Amos', name_pt: 'Amós', tb: 'am', sort_order: 30 },
  { id: 31, osis: 'Obad', name_pt: 'Obadias', tb: 'ob', sort_order: 31 },
  { id: 32, osis: 'Jonah', name_pt: 'Jonas', tb: 'jn', sort_order: 32 },
  { id: 33, osis: 'Mic', name_pt: 'Miquéias', tb: 'mq', sort_order: 33 },
  { id: 34, osis: 'Nah', name_pt: 'Naum', tb: 'na', sort_order: 34 },
  { id: 35, osis: 'Hab', name_pt: 'Habacuque', tb: 'hc', sort_order: 35 },
  { id: 36, osis: 'Zeph', name_pt: 'Sofonias', tb: 'sf', sort_order: 36 },
  { id: 37, osis: 'Hag', name_pt: 'Ageu', tb: 'ag', sort_order: 37 },
  { id: 38, osis: 'Zech', name_pt: 'Zacarias', tb: 'zc', sort_order: 38 },
  { id: 39, osis: 'Mal', name_pt: 'Malaquias', tb: 'ml', sort_order: 39 },
];

export const OT_BOOK_BY_OSIS = new Map(OT_BOOKS.map((b) => [b.osis, b]));
export const OT_BOOK_BY_TB = new Map(OT_BOOKS.map((b) => [b.tb, b]));

/** Código da "tradução" do texto original hebraico (WLC). */
export const HEBREW_TRANSLATION_CODE = 'hbo-wlc';
