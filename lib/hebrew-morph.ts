// Decodificador de códigos morfológicos OSHM (Open Scriptures Hebrew Morphology),
// o esquema usado pelo openscriptures/morphhb no atributo `morph` de cada <w>.
//
// Formato (resumo do HebrewMorphologyCodes.html da fonte):
//   - Um prefixo de LÍNGUA ("H" hebraico | "A" aramaico) abre a string INTEIRA.
//   - "/" separa MORFEMAS (prefixos, palavra principal, sufixos). O número de
//     morfemas casa com os "/" do lema e da superfície.
//   - Cada morfema: 1ª letra = parte do discurso; as letras seguintes são
//     features que dependem da POS:
//       A adjetivo    → tipo, gênero, número, estado
//       C conjunção   → (nada)
//       D advérbio     → (nada)
//       N substantivo → tipo, gênero, número, estado
//       P pronome     → tipo, pessoa, gênero, número
//       R preposição  → [tipo]   (d = artigo definido embutido)
//       S sufixo      → tipo, pessoa, gênero, número
//       T partícula   → tipo
//       V verbo       → stem(binyan), conjugação, [pessoa, gênero, número | estado]
//   - "x" é placeholder para valor desconhecido/desnecessário no meio do código.
//
// É o análogo hebraico do morph-decoder.ts (Robinson, grego). Puro: nunca lança;
// códigos não reconhecidos vêm com `unparsed: true`.

export type HebrewLanguage = 'hebrew' | 'aramaic';

export interface HebrewFeatures {
  language: HebrewLanguage;
  pos: string | null; // parte do discurso (legível, em inglês — traduzida nos labels)
  type: string | null; // subtipo (noun-common, pronoun-personal, particle-object, ...)
  stem: string | null; // binyan do verbo (qal, niphal, piel, ...)
  conjugation: string | null; // perfect, imperfect, participle-active, infinitive-construct, ...
  person: string | null;
  gender: string | null;
  number: string | null;
  state: string | null; // absolute | construct | determined
  /** true quando o código não foi reconhecido pelo parser */
  unparsed?: boolean;
}

const POS: Record<string, string> = {
  A: 'adjective',
  C: 'conjunction',
  D: 'adverb',
  N: 'noun',
  P: 'pronoun',
  R: 'preposition',
  S: 'suffix',
  T: 'particle',
  V: 'verb',
};

const ADJECTIVE_TYPE: Record<string, string> = {
  a: 'adjective',
  c: 'cardinal-number',
  g: 'gentilic',
  o: 'ordinal-number',
};

const NOUN_TYPE: Record<string, string> = {
  c: 'common',
  g: 'gentilic',
  p: 'proper-name',
};

const PRONOUN_TYPE: Record<string, string> = {
  d: 'demonstrative',
  f: 'indefinite',
  i: 'interrogative',
  p: 'personal',
  r: 'relative',
};

const PREPOSITION_TYPE: Record<string, string> = {
  d: 'definite-article',
};

const SUFFIX_TYPE: Record<string, string> = {
  d: 'directional-he',
  h: 'paragogic-he',
  n: 'paragogic-nun',
  p: 'pronominal',
};

const PARTICLE_TYPE: Record<string, string> = {
  a: 'affirmation',
  d: 'definite-article',
  e: 'exhortation',
  i: 'interrogative',
  j: 'interjection',
  m: 'demonstrative',
  n: 'negative',
  o: 'object-marker',
  r: 'relative',
};

// Verb stems (binyanim). Cobre hebraico e aramaico; algumas letras se repetem
// entre as duas línguas com nomes diferentes (ex.: "p" = piel em hebraico, pael
// em aramaico). Por isso resolvemos o stem em função da língua.
const VERB_STEM_HEBREW: Record<string, string> = {
  q: 'qal', N: 'niphal', p: 'piel', P: 'pual', h: 'hiphil', H: 'hophal',
  t: 'hithpael', o: 'polel', O: 'polal', r: 'hithpolel', m: 'poel', M: 'poal',
  k: 'palel', K: 'pulal', Q: 'qal-passive', l: 'pilpel', L: 'polpal',
  f: 'hithpalpel', D: 'nithpael', j: 'pealal', i: 'pilel', u: 'hothpaal',
  c: 'tiphil', v: 'hishtaphel', w: 'nithpalel', y: 'nithpoel', z: 'hithpoel',
};

const VERB_STEM_ARAMAIC: Record<string, string> = {
  q: 'peal', Q: 'peil', u: 'hithpeel', p: 'pael', P: 'ithpaal', M: 'hithpaal',
  a: 'aphel', h: 'haphel', s: 'saphel', e: 'shaphel', H: 'hophal', i: 'ithpeel',
  t: 'hishtaphel', v: 'ishtaphel', w: 'hithaphel', o: 'polel', z: 'ithpoel',
  r: 'hithpolel', f: 'hithpalpel', b: 'hephal', c: 'tiphel', m: 'poel',
  l: 'palpel', L: 'ithpalpel', O: 'ithpolel', G: 'ittaphal',
};

const VERB_CONJUGATION: Record<string, string> = {
  p: 'perfect',
  q: 'sequential-perfect',
  i: 'imperfect',
  w: 'sequential-imperfect',
  h: 'cohortative',
  j: 'jussive',
  v: 'imperative',
  r: 'participle-active',
  s: 'participle-passive',
  a: 'infinitive-absolute',
  c: 'infinitive-construct',
};

const PERSON: Record<string, string> = { '1': 'first', '2': 'second', '3': 'third' };
const GENDER: Record<string, string> = { b: 'both', c: 'common', f: 'feminine', m: 'masculine' };
const NUMBER: Record<string, string> = { d: 'dual', p: 'plural', s: 'singular' };
const STATE: Record<string, string> = { a: 'absolute', c: 'construct', d: 'determined' };

const empty = (language: HebrewLanguage): HebrewFeatures => ({
  language,
  pos: null, type: null, stem: null, conjugation: null,
  person: null, gender: null, number: null, state: null,
});

// Lê uma sequência de features posicionais (gênero, número, estado) a partir de
// um cursor, pulando "x" (placeholder). Cada feature é opcional: o código pode
// terminar antes (ex.: nome próprio "Np" não traz gênero/número).
function readGNS(letters: string, start: number, out: HebrewFeatures): void {
  let i = start;
  const next = () => (i < letters.length ? letters[i++]! : null);
  const g = next();
  if (g && g !== 'x') out.gender = GENDER[g] ?? null;
  const n = next();
  if (n && n !== 'x') out.number = NUMBER[n] ?? null;
  const s = next();
  if (s && s !== 'x') out.state = STATE[s] ?? null;
}

// Lê pessoa, gênero, número (pronomes e sufixos) a partir de um cursor.
function readPGN(letters: string, start: number, out: HebrewFeatures): void {
  let i = start;
  const next = () => (i < letters.length ? letters[i++]! : null);
  const p = next();
  if (p && p !== 'x') out.person = PERSON[p] ?? null;
  const g = next();
  if (g && g !== 'x') out.gender = GENDER[g] ?? null;
  const n = next();
  if (n && n !== 'x') out.number = NUMBER[n] ?? null;
}

function decodeVerb(letters: string, out: HebrewFeatures): void {
  // letters (sem a POS "V"): stem + conjugação + [pessoa/gênero/número | gênero/número/estado]
  const stemMap = out.language === 'aramaic' ? VERB_STEM_ARAMAIC : VERB_STEM_HEBREW;
  out.stem = stemMap[letters[0] ?? ''] ?? null;
  const conj = letters[1] ?? '';
  out.conjugation = VERB_CONJUGATION[conj] ?? null;

  const rest = letters.slice(2);
  if (out.conjugation === 'participle-active' || out.conjugation === 'participle-passive') {
    // particípio: declina como nominal (gênero, número, estado), sem pessoa
    readGNS(rest, 0, out);
  } else if (
    out.conjugation === 'infinitive-absolute' ||
    out.conjugation === 'infinitive-construct'
  ) {
    // infinitivo: sem pessoa/gênero/número
  } else {
    // finito (perfeito, imperfeito, imperativo, coortativo, jussivo, sequenciais)
    readPGN(rest, 0, out);
  }
  if (out.stem === null && out.conjugation === null) out.unparsed = true;
}

/**
 * Decodifica UM código de morfema OSHM (sem o "/"). Pode trazer o prefixo de
 * língua "H"/"A"; se ausente, usa `defaultLanguage` (a língua já lida do 1º
 * morfema da palavra). Retorna features estruturadas; nunca lança.
 */
export function decodeHebrewMorpheme(
  rawCode: string | null | undefined,
  defaultLanguage: HebrewLanguage = 'hebrew',
): HebrewFeatures {
  let code = (rawCode ?? '').trim();
  let language = defaultLanguage;
  if (code.startsWith('H')) {
    language = 'hebrew';
    code = code.slice(1);
  } else if (code.startsWith('A')) {
    language = 'aramaic';
    code = code.slice(1);
  }

  const out = empty(language);
  if (!code) {
    out.unparsed = true;
    return out;
  }

  const head = code[0]!;
  out.pos = POS[head] ?? null;
  const rest = code.slice(1);

  switch (head) {
    case 'C': // conjunção — sem features
    case 'D': // advérbio — sem features
      break;
    case 'A': {
      out.type = ADJECTIVE_TYPE[rest[0] ?? ''] ?? null;
      readGNS(rest, 1, out);
      break;
    }
    case 'N': {
      out.type = NOUN_TYPE[rest[0] ?? ''] ?? null;
      // nome próprio (Np) não traz gênero/número/estado
      if (out.type !== 'proper-name') readGNS(rest, 1, out);
      break;
    }
    case 'P': {
      out.type = PRONOUN_TYPE[rest[0] ?? ''] ?? null;
      readPGN(rest, 1, out);
      break;
    }
    case 'R': {
      if (rest[0]) out.type = PREPOSITION_TYPE[rest[0]] ?? null;
      break;
    }
    case 'S': {
      out.type = SUFFIX_TYPE[rest[0] ?? ''] ?? null;
      readPGN(rest, 1, out);
      break;
    }
    case 'T': {
      out.type = PARTICLE_TYPE[rest[0] ?? ''] ?? null;
      break;
    }
    case 'V': {
      decodeVerb(rest, out);
      break;
    }
    default:
      out.unparsed = true;
  }

  if (out.pos === null) out.unparsed = true;
  return out;
}

/**
 * Separa o `morph` cru de uma palavra (ex.: "HTd/Ncmpa") em código por morfema,
 * já SEM o prefixo de língua nos morfemas seguintes (o "H"/"A" abre só o 1º).
 * Devolve a língua e os códigos individuais (cada um ainda pode ser re-decodado
 * com decodeHebrewMorpheme passando a língua resolvida).
 */
export function splitHebrewMorph(raw: string | null | undefined): {
  language: HebrewLanguage;
  codes: string[];
} {
  const code = (raw ?? '').trim();
  let language: HebrewLanguage = 'hebrew';
  let body = code;
  if (code.startsWith('H')) {
    language = 'hebrew';
    body = code.slice(1);
  } else if (code.startsWith('A')) {
    language = 'aramaic';
    body = code.slice(1);
  }
  const codes = body.split('/').filter((c) => c.length > 0);
  return { language, codes };
}

// ── Rótulos PT-BR ───────────────────────────────────────────────────────────

const POS_PT: Record<string, string> = {
  adjective: 'adjetivo',
  conjunction: 'conjunção',
  adverb: 'advérbio',
  noun: 'substantivo',
  pronoun: 'pronome',
  preposition: 'preposição',
  suffix: 'sufixo',
  particle: 'partícula',
  verb: 'verbo',
};

const TYPE_PT: Record<string, string> = {
  // adjetivo
  adjective: 'adjetivo',
  'cardinal-number': 'numeral cardinal',
  gentilic: 'gentílico',
  'ordinal-number': 'numeral ordinal',
  // substantivo
  common: 'comum',
  'proper-name': 'nome próprio',
  // pronome
  demonstrative: 'demonstrativo',
  indefinite: 'indefinido',
  interrogative: 'interrogativo',
  personal: 'pessoal',
  relative: 'relativo',
  // preposição / partícula
  'definite-article': 'artigo definido',
  affirmation: 'afirmação',
  exhortation: 'exortação',
  interjection: 'interjeição',
  negative: 'negação',
  'object-marker': 'marcador de objeto direto',
  // sufixo
  'directional-he': 'he direcional',
  'paragogic-he': 'he paragógico',
  'paragogic-nun': 'nun paragógico',
  pronominal: 'pronominal',
};

const STEM_PT: Record<string, string> = {
  qal: 'qal', niphal: 'nifal', piel: 'piel', pual: 'pual', hiphil: 'hifil',
  hophal: 'hofal', hithpael: 'hitpael', 'qal-passive': 'qal passivo', peal: 'peal',
};

const CONJUGATION_PT: Record<string, string> = {
  perfect: 'perfeito',
  'sequential-perfect': 'perfeito sequencial',
  imperfect: 'imperfeito',
  'sequential-imperfect': 'imperfeito sequencial',
  cohortative: 'coortativo',
  jussive: 'jussivo',
  imperative: 'imperativo',
  'participle-active': 'particípio ativo',
  'participle-passive': 'particípio passivo',
  'infinitive-absolute': 'infinitivo absoluto',
  'infinitive-construct': 'infinitivo construto',
};

const PERSON_PT: Record<string, string> = { first: '1ª pessoa', second: '2ª pessoa', third: '3ª pessoa' };
const GENDER_PT: Record<string, string> = { both: 'ambos', common: 'comum', feminine: 'feminino', masculine: 'masculino' };
const NUMBER_PT: Record<string, string> = { dual: 'dual', plural: 'plural', singular: 'singular' };
const STATE_PT: Record<string, string> = { absolute: 'absoluto', construct: 'construto', determined: 'determinado' };

function lbl(map: Record<string, string>, value: string | null): string | null {
  if (!value) return null;
  return map[value] ?? value;
}

/** Classe gramatical legível (com subtipo quando relevante). Ex.: "substantivo próprio". */
export function hebrewPosLabel(f: HebrewFeatures): string {
  const pos = lbl(POS_PT, f.pos) ?? 'palavra';
  // o subtipo só agrega quando difere/qualifica a classe
  if (f.type && f.pos !== 'particle' && f.pos !== 'preposition' && f.pos !== 'suffix') {
    const t = lbl(TYPE_PT, f.type);
    if (t && t !== pos) return `${pos} ${t}`;
  }
  return pos;
}

/** Análise morfológica legível: ex. "verbo · qal · perfeito · 3ª pessoa · masculino · singular". */
export function hebrewParsingLabel(f: HebrewFeatures): string {
  const parts = [
    hebrewPosLabel(f),
    lbl(STEM_PT, f.stem),
    lbl(CONJUGATION_PT, f.conjugation),
    lbl(PERSON_PT, f.person),
    lbl(GENDER_PT, f.gender),
    lbl(NUMBER_PT, f.number),
    lbl(STATE_PT, f.state),
  ];
  // partícula/preposição/sufixo: anexa o subtipo ao final (não cabe em hebrewPosLabel)
  if ((f.pos === 'particle' || f.pos === 'preposition' || f.pos === 'suffix') && f.type) {
    parts.push(lbl(TYPE_PT, f.type));
  }
  return parts.filter((p): p is string => Boolean(p)).join(' · ');
}
