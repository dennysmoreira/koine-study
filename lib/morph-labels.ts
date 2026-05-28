// Traduz os valores morfológicos (inglês, vindos do morph-decoder do ETL) para PT-BR
// e monta a análise legível exibida ao tocar num token no leitor interlinear.

import type { Token } from './corpus';

const POS: Record<string, string> = {
  noun: 'substantivo',
  adjective: 'adjetivo',
  article: 'artigo',
  verb: 'verbo',
  'personal-pronoun': 'pronome pessoal',
  'relative-pronoun': 'pronome relativo',
  'reciprocal-pronoun': 'pronome recíproco',
  'demonstrative-pronoun': 'pronome demonstrativo',
  'correlative-pronoun': 'pronome correlativo',
  'interrogative-pronoun': 'pronome interrogativo',
  'indefinite-pronoun': 'pronome indefinido',
  'correlative-interrogative-pronoun': 'pronome correlativo/interrogativo',
  'reflexive-pronoun': 'pronome reflexivo',
  'possessive-pronoun': 'pronome possessivo',
  adverb: 'advérbio',
  conjunction: 'conjunção',
  preposition: 'preposição',
  particle: 'partícula',
  interjection: 'interjeição',
  conditional: 'condicional',
  'aramaic-transliteration': 'transliteração (aramaico)',
  'hebrew-transliteration': 'transliteração (hebraico)',
};

const TENSE: Record<string, string> = {
  present: 'presente',
  imperfect: 'imperfeito',
  future: 'futuro',
  aorist: 'aoristo',
  perfect: 'perfeito',
  pluperfect: 'mais-que-perfeito',
};

const VOICE: Record<string, string> = {
  active: 'ativa',
  middle: 'média',
  passive: 'passiva',
  'middle-or-passive': 'média ou passiva',
  'middle-deponent': 'média depoente',
  'passive-deponent': 'passiva depoente',
  'middle-or-passive-deponent': 'média/passiva depoente',
  'impersonal-active': 'ativa impessoal',
  'no-voice': 'sem voz',
};

const MOOD: Record<string, string> = {
  indicative: 'indicativo',
  subjunctive: 'subjuntivo',
  optative: 'optativo',
  imperative: 'imperativo',
  infinitive: 'infinitivo',
  participle: 'particípio',
};

const CASE: Record<string, string> = {
  nominative: 'nominativo',
  genitive: 'genitivo',
  dative: 'dativo',
  accusative: 'acusativo',
  vocative: 'vocativo',
};

const NUMBER: Record<string, string> = {
  singular: 'singular',
  plural: 'plural',
};

const GENDER: Record<string, string> = {
  masculine: 'masculino',
  feminine: 'feminino',
  neuter: 'neutro',
};

const PERSON: Record<string, string> = {
  first: '1ª pessoa',
  second: '2ª pessoa',
  third: '3ª pessoa',
};

// ── fonte única das dimensões morfológicas (reutilizada pelo quiz de parsing) ──
export type MorphDimension = 'tense' | 'voice' | 'mood' | 'case' | 'number' | 'gender' | 'person';

export const MORPH_LABELS: Record<MorphDimension, Record<string, string>> = {
  tense: TENSE,
  voice: VOICE,
  mood: MOOD,
  case: CASE,
  number: NUMBER,
  gender: GENDER,
  person: PERSON,
};

export const DIMENSION_COLUMN: Record<MorphDimension, string> = {
  tense: 'm_tense',
  voice: 'm_voice',
  mood: 'm_mood',
  case: 'm_case',
  number: 'm_number',
  gender: 'm_gender',
  person: 'm_person',
};

export const DIMENSION_TITLE: Record<MorphDimension, string> = {
  tense: 'Qual o tempo verbal?',
  voice: 'Qual a voz?',
  mood: 'Qual o modo?',
  case: 'Qual o caso?',
  number: 'Qual o número?',
  gender: 'Qual o gênero?',
  person: 'Qual a pessoa?',
};

function label(map: Record<string, string>, value: string | null): string | null {
  if (!value) return null;
  return map[value] ?? value;
}

export function posLabel(token: Token): string {
  return label(POS, token.m_pos) ?? 'palavra';
}

// Análise morfológica legível: ex. "verbo · presente · ativo · indicativo · 3ª pessoa · plural".
// A ordem segue a convenção de parsing grego (tempo, voz, modo, pessoa; depois caso, número, gênero).
export function parsingLabel(token: Token): string {
  const parts = [
    posLabel(token),
    label(TENSE, token.m_tense),
    label(VOICE, token.m_voice),
    label(MOOD, token.m_mood),
    label(PERSON, token.m_person),
    label(CASE, token.m_case),
    label(NUMBER, token.m_number),
    label(GENDER, token.m_gender),
  ].filter((p): p is string => Boolean(p));
  return parts.join(' · ');
}

// Glosa preferida em PT: contexto > léxico PT > léxico EN.
export function glossLabel(token: Token): string | null {
  return token.gloss_context ?? token.lemma?.gloss_pt ?? token.lemma?.gloss_en ?? null;
}
