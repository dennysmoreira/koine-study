// Conteúdo estático do alfabeto grego para o minijogo gamificado.
// Não é dado de usuário: vive no código. Os nomes e sons espelham a lição
// `alfabeto` em lib/lessons.ts para manter consistência didática.

export interface GreekLetter {
  /** Forma minúscula (a que mais aparece na leitura do NT). */
  lower: string;
  /** Forma maiúscula. */
  upper: string;
  /** Nome da letra, em PT. */
  name: string;
  /** Som aproximado, em PT. */
  sound: string;
}

export const ALPHABET: GreekLetter[] = [
  { lower: 'α', upper: 'Α', name: 'alfa', sound: 'a' },
  { lower: 'β', upper: 'Β', name: 'beta', sound: 'b' },
  { lower: 'γ', upper: 'Γ', name: 'gama', sound: 'g (de "gato")' },
  { lower: 'δ', upper: 'Δ', name: 'delta', sound: 'd' },
  { lower: 'ε', upper: 'Ε', name: 'épsilon', sound: 'e (breve)' },
  { lower: 'ζ', upper: 'Ζ', name: 'zeta', sound: 'dz' },
  { lower: 'η', upper: 'Η', name: 'eta', sound: 'ê (longo)' },
  { lower: 'θ', upper: 'Θ', name: 'theta', sound: 'th' },
  { lower: 'ι', upper: 'Ι', name: 'iota', sound: 'i' },
  { lower: 'κ', upper: 'Κ', name: 'kappa', sound: 'k' },
  { lower: 'λ', upper: 'Λ', name: 'lambda', sound: 'l' },
  { lower: 'μ', upper: 'Μ', name: 'mu', sound: 'm' },
  { lower: 'ν', upper: 'Ν', name: 'nu', sound: 'n' },
  { lower: 'ξ', upper: 'Ξ', name: 'xi', sound: 'ks' },
  { lower: 'ο', upper: 'Ο', name: 'ômicron', sound: 'o (breve)' },
  { lower: 'π', upper: 'Π', name: 'pi', sound: 'p' },
  { lower: 'ρ', upper: 'Ρ', name: 'rho', sound: 'r' },
  { lower: 'σ', upper: 'Σ', name: 'sigma', sound: 's' },
  { lower: 'τ', upper: 'Τ', name: 'tau', sound: 't' },
  { lower: 'υ', upper: 'Υ', name: 'ípsilon', sound: 'ü (entre i e u)' },
  { lower: 'φ', upper: 'Φ', name: 'phi', sound: 'f' },
  { lower: 'χ', upper: 'Χ', name: 'chi', sound: 'kh (aspirado)' },
  { lower: 'ψ', upper: 'Ψ', name: 'psi', sound: 'ps' },
  { lower: 'ω', upper: 'Ω', name: 'ômega', sound: 'ô (longo)' },
];

export type QuestionMode = 'name' | 'sound';

export interface AlphabetQuestion {
  /** Letra-alvo da pergunta. */
  letter: GreekLetter;
  /** Se a pergunta cobra o nome ou o som da letra. */
  mode: QuestionMode;
  /** Enunciado já pronto para exibição. */
  prompt: string;
  /** Resposta correta (texto). */
  answer: string;
  /** Alternativas embaralhadas, incluindo a correta. */
  options: string[];
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = tmp;
  }
  return copy;
}

/**
 * Sorteia até `count` distratores distintos para o valor correto, no mesmo
 * campo. Deduplica antes de sortear (caso haja nomes/sons repetidos no futuro)
 * para nunca repetir uma alternativa. Com 24 letras sempre há >= 3 disponíveis.
 */
function pickDistractors(correct: string, field: 'name' | 'sound', count: number): string[] {
  const distinct = [...new Set(ALPHABET.map((l) => l[field]))].filter((v) => v !== correct);
  return shuffle(distinct).slice(0, count);
}

/**
 * Gera uma pergunta aleatória. Quando `mode` é omitido, sorteia entre
 * "nome" e "som". `optionCount` controla o total de alternativas (>= 2).
 */
export function makeQuestion(mode?: QuestionMode, optionCount = 4): AlphabetQuestion {
  const letter = ALPHABET[Math.floor(Math.random() * ALPHABET.length)] as GreekLetter;
  const chosenMode: QuestionMode = mode ?? (Math.random() < 0.5 ? 'name' : 'sound');
  const field: 'name' | 'sound' = chosenMode;
  const answer = letter[field];
  const distractors = pickDistractors(answer, field, Math.max(1, optionCount - 1));
  const options = shuffle([answer, ...distractors]);
  const prompt = chosenMode === 'name' ? 'Qual o nome desta letra?' : 'Que som ela faz?';
  return { letter, mode: chosenMode, prompt, answer, options };
}
