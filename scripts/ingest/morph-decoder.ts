/**
 * Decodificador de códigos morfológicos de Robinson (esquema usado pelo
 * byztxt/byzantine-majority-text e por Tauber/MorphGNT).
 *
 * Formato geral:
 *   - Nominais (substantivo, adjetivo, artigo, pronomes):  POS-CASO+NÚMERO+GÊNERO
 *       Ex.: N-NSM  = Substantivo, Nominativo Singular Masculino
 *            T-GSF  = Artigo, Genitivo Singular Feminino
 *            A-APN  = Adjetivo, Acusativo Plural Neutro
 *   - Verbos finitos:        V-[2?]TVM-PESSOA+NÚMERO
 *       Ex.: V-PAI-3S   = Verbo, Presente Ativo Indicativo, 3ª pessoa Singular
 *            V-2AAI-3S  = Verbo, 2º Aoristo Ativo Indicativo, 3ª p. Singular
 *   - Verbos particípio:     V-[2?]TVP-CASO+NÚMERO+GÊNERO
 *       Ex.: V-PAP-NSM  = Verbo, Presente Ativo Particípio, Nom. Sing. Masc.
 *   - Verbos infinitivo:     V-[2?]TVN   (sem pessoa/número)
 *       Ex.: V-PAN      = Verbo, Presente Ativo Infinitivo
 *   - Indeclináveis e partículas:  N-PRI, A-NUI, ADV, CONJ, PREP, PRT, COND, etc.
 *
 * Referência: "Robinson's Morphological Analysis Codes".
 */

export interface MorphFeatures {
  pos: string | null; // parte do discurso (legível)
  tense: string | null;
  voice: string | null;
  mood: string | null;
  case: string | null;
  number: string | null;
  gender: string | null;
  person: string | null;
  /** true quando o código não foi reconhecido pelo parser */
  unparsed?: boolean;
}

const POS: Record<string, string> = {
  N: 'noun',
  A: 'adjective',
  T: 'article',
  V: 'verb',
  P: 'personal-pronoun',
  R: 'relative-pronoun',
  C: 'reciprocal-pronoun',
  D: 'demonstrative-pronoun',
  K: 'correlative-pronoun',
  I: 'interrogative-pronoun',
  X: 'indefinite-pronoun',
  Q: 'correlative-interrogative-pronoun',
  F: 'reflexive-pronoun',
  S: 'possessive-pronoun',
  ADV: 'adverb',
  CONJ: 'conjunction',
  PREP: 'preposition',
  PRT: 'particle',
  INJ: 'interjection',
  COND: 'conditional',
  ARAM: 'aramaic-transliteration',
  HEB: 'hebrew-transliteration',
};

// Suporta os dois esquemas: RMAC/Robinson (R=perfeito, L=mais-que-perfeito)
// e Tauber/MorphGNT (X=perfeito, Y=mais-que-perfeito). Sem colisão na posição de tempo.
const TENSE: Record<string, string> = {
  P: 'present',
  I: 'imperfect',
  F: 'future',
  A: 'aorist',
  R: 'perfect',
  X: 'perfect',
  L: 'pluperfect',
  Y: 'pluperfect',
};

const VOICE: Record<string, string> = {
  A: 'active',
  M: 'middle',
  P: 'passive',
  E: 'middle-or-passive',
  D: 'middle-deponent',
  O: 'passive-deponent',
  N: 'middle-or-passive-deponent',
  Q: 'impersonal-active',
  X: 'no-voice',
};

const MOOD: Record<string, string> = {
  I: 'indicative',
  S: 'subjunctive',
  O: 'optative',
  M: 'imperative',
  N: 'infinitive',
  P: 'participle',
};

const CASE: Record<string, string> = {
  N: 'nominative',
  G: 'genitive',
  D: 'dative',
  A: 'accusative',
  V: 'vocative',
};

const NUMBER: Record<string, string> = { S: 'singular', P: 'plural' };
const GENDER: Record<string, string> = { M: 'masculine', F: 'feminine', N: 'neuter' };
const PERSON: Record<string, string> = { '1': 'first', '2': 'second', '3': 'third' };

/** Sufixos indeclináveis que dispensam parsing de caso/número/gênero. */
const INDECLINABLE = new Set(['PRI', 'NUI', 'LI', 'OI']);

const empty = (): MorphFeatures => ({
  pos: null, tense: null, voice: null, mood: null,
  case: null, number: null, gender: null, person: null,
});

function decodeCNG(seg: string, out: MorphFeatures): void {
  // CASO + NÚMERO + GÊNERO (ex.: "NSM")
  if (seg.length >= 1) out.case = CASE[seg[0]!] ?? null;
  if (seg.length >= 2) out.number = NUMBER[seg[1]!] ?? null;
  if (seg.length >= 3) out.gender = GENDER[seg[2]!] ?? null;
}

function decodeVerb(parts: string[], out: MorphFeatures): void {
  // parts[0] = "V"; parts[1] = TVM (ex.: "PAI", "2AAP"); parts[2] = sufixo opcional
  let tvm = parts[1] ?? '';
  // prefixo "2" (segundo aoristo/futuro/perfeito) — registramos só o tempo base
  if (tvm.startsWith('2')) tvm = tvm.slice(1);

  out.tense = TENSE[tvm[0] ?? ''] ?? null;
  out.voice = VOICE[tvm[1] ?? ''] ?? null;
  out.mood = MOOD[tvm[2] ?? ''] ?? null;

  const suffix = parts[2];
  if (!suffix) return; // infinitivo (V-PAN) — sem pessoa/número
  if (out.mood === 'participle') {
    decodeCNG(suffix, out); // particípio declina: caso/número/gênero
  } else {
    // finito: PESSOA + NÚMERO (ex.: "3S")
    out.person = PERSON[suffix[0] ?? ''] ?? null;
    out.number = NUMBER[suffix[1] ?? ''] ?? null;
  }
}

/**
 * Decodifica um código morfológico Robinson em features estruturadas.
 * Nunca lança: códigos desconhecidos retornam `unparsed: true`.
 */
export function decodeMorph(rawCode: string | null | undefined): MorphFeatures {
  const out = empty();
  if (!rawCode) return out;

  const code = rawCode.trim();
  const parts = code.split('-');
  const head = parts[0]!;

  // Partículas / indeclináveis sem hífen (ADV, CONJ, PREP, PRT, COND, INJ...)
  if (parts.length === 1) {
    out.pos = POS[head] ?? null;
    if (out.pos === null) out.unparsed = true;
    return out;
  }

  out.pos = POS[head] ?? null;
  const tail = parts[1]!;

  // Indeclináveis: N-PRI, A-NUI, N-LI, N-OI
  if (INDECLINABLE.has(tail)) return out;

  if (head === 'V') {
    decodeVerb(parts, out);
    if (out.tense === null && out.mood === null) out.unparsed = true;
    return out;
  }

  // Nominais (N, A, T, e pronomes): CASO+NÚMERO+GÊNERO no segmento final.
  // Pronomes pessoais podem trazer pessoa antes (ex.: P-1NS). Detecta dígito inicial.
  if (/^[123]/.test(tail)) {
    out.person = PERSON[tail[0]!] ?? null;
    out.number = NUMBER[tail[1] ?? ''] ?? null;
    out.case = CASE[tail[2] ?? ''] ?? null; // alguns esquemas: P-1NS = pessoa-número-caso
  } else {
    decodeCNG(tail, out);
  }
  if (out.pos === null) out.unparsed = true;
  return out;
}

// ── Teste rápido: `npm run morph:test` ──────────────────────────────────
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const samples = ['N-NSM', 'T-GSF', 'A-APN', 'V-PAI-3S', 'V-2AAI-3S',
    'V-PAP-NSM', 'V-PAN', 'V-RPI-3S', 'N-PRI', 'CONJ', 'PREP', 'P-1NS', '???'];
  for (const s of samples) {
    console.log(s.padEnd(12), JSON.stringify(decodeMorph(s)));
  }
}
