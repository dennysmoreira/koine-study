// Transliteração Erasmiana do grego politônico para escrita latina, usada como
// guia de pronúncia no leitor. Escolha do esquema (Erasmiano) é pedagógica: ele
// distingue sons que o iotacismo do grego moderno/koiné colapsa (η≠ι, ω≠ο, ει≠η),
// ajudando o aprendiz a mapear letra→som. O acento tônico do grego é preservado
// como acento agudo sobre a vogal correspondente.

const ROUGH = '̔'; // espírito áspero → h inicial
const ACUTE = '́';
const GRAVE = '̀';
const CIRCUMFLEX = '͂';
const DIAERESIS = '̈'; // quebra ditongo
const ACCENTS = new Set([ACUTE, GRAVE, CIRCUMFLEX]);

interface Unit {
  ch: string;
  marks: Set<string>;
}

const VOWELS: Record<string, string> = {
  α: 'a',
  ε: 'e',
  η: 'ē', // ē
  ι: 'i',
  ο: 'o',
  υ: 'y',
  ω: 'ō', // ō
};

// Ditongos (Erasmiano). O 'u' do segundo elemento vira 'u', não 'y'.
const DIPHTHONGS: Record<string, string> = {
  αι: 'ai',
  αυ: 'au',
  ει: 'ei',
  ευ: 'eu',
  ηυ: 'ēu', // ēu
  οι: 'oi',
  ου: 'ou',
  υι: 'yi',
  ωυ: 'ōu', // ōu
};

const CONSONANTS: Record<string, string> = {
  β: 'b',
  γ: 'g',
  δ: 'd',
  ζ: 'z',
  θ: 'th',
  κ: 'k',
  λ: 'l',
  μ: 'm',
  ν: 'n',
  ξ: 'x',
  π: 'p',
  σ: 's',
  ς: 's',
  τ: 't',
  φ: 'ph',
  χ: 'ch',
  ψ: 'ps',
};

const NASAL_GAMMA_NEXT = new Set(['γ', 'κ', 'ξ', 'χ']);

function toUnits(word: string): Unit[] {
  const units: Unit[] = [];
  for (const c of word.normalize('NFD')) {
    if (c >= '̀' && c <= 'ͯ') {
      const last = units[units.length - 1];
      if (last) last.marks.add(c);
    } else {
      units.push({ ch: c.toLowerCase(), marks: new Set() });
    }
  }
  return units;
}

function hasAccent(marks: Set<string>): boolean {
  for (const m of marks) if (ACCENTS.has(m)) return true;
  return false;
}

function transliterateWord(word: string): string {
  const units = toUnits(word);
  let out = '';
  let i = 0;

  while (i < units.length) {
    const u = units[i];
    if (!u) break;
    const next = units[i + 1];

    // Ditongo: dois vogais sem diérese no segundo elemento.
    const pair = next ? u.ch + next.ch : '';
    const diph = next && !next.marks.has(DIAERESIS) ? DIPHTHONGS[pair] : undefined;
    if (diph && next) {
      const h = u.marks.has(ROUGH) || next.marks.has(ROUGH) ? 'h' : '';
      const accent = hasAccent(u.marks) || hasAccent(next.marks) ? ACUTE : '';
      out += h + diph + accent;
      i += 2;
      continue;
    }

    const vowel = VOWELS[u.ch];
    if (vowel) {
      const h = u.marks.has(ROUGH) ? 'h' : '';
      const accent = hasAccent(u.marks) ? ACUTE : '';
      out += h + vowel + accent;
      i += 1;
      continue;
    }

    if (u.ch === 'ρ') {
      out += u.marks.has(ROUGH) ? 'rh' : 'r';
      i += 1;
      continue;
    }

    // γ nasal antes de γ/κ/ξ/χ soa como 'n' (ex.: ἄγγελος → angelos).
    if (u.ch === 'γ' && next && NASAL_GAMMA_NEXT.has(next.ch)) {
      out += 'n';
      i += 1;
      continue;
    }

    const cons = CONSONANTS[u.ch];
    if (cons) {
      out += cons;
      i += 1;
      continue;
    }

    // Espaço/pontuação: preserva; demais caracteres desconhecidos são ignorados.
    if (/[\s·,.;:!?]/.test(u.ch)) out += u.ch;
    i += 1;
  }

  return out.normalize('NFC');
}

export function transliterate(text: string): string {
  return text
    .split(/(\s+)/)
    .map((part) => (/\s/.test(part) ? part : transliterateWord(part)))
    .join('');
}

// Respelagem fonética para vozes de TTS em português (pt-BR/pt-PT). A síntese de
// fala aplica a ortografia do português sobre a romanização erasmiana, gerando
// sons errados: "ge/gi" → /ʒ/ ("j"), "ch" → /ʃ/, "c" antes de e/i → /s/, "s"
// intervocálico → /z/. Reescrevemos a romanização para que a voz portuguesa
// emita sons próximos aos do grego (Erasmiano). É aproximação — o ideal é uma
// voz grega nativa. Recebe a saída de `transliterate`.
export function phoneticPtBR(romanized: string): string {
  let s = romanized.normalize('NFC').toLowerCase();
  const FRONT = '[eiéíê]'; // vogais anteriores que abrandam g/c em PT

  // η→é, ω→ó (vogais abertas longas)
  s = s.replace(/ē/g, 'é').replace(/ō/g, 'ó');
  // ου soa /u/ (em PT "ou" → /o/). υ isolado (y) é /y/ (ü), inexistente no PT;
  // aproxima-se por /i/ — como a voz grega moderna pronuncia υ e como o BR lê "y".
  s = s.replace(/ou/g, 'u').replace(/y/g, 'i');
  // χ (/kʰ/) → som de k duro: "qu" antes de vogal anterior, senão "c"
  s = s.replace(new RegExp(`ch(?=${FRONT})`, 'g'), 'qu').replace(/ch/g, 'c');
  // θ (/tʰ/) → t ; φ (/pʰ/) → f
  s = s.replace(/th/g, 't').replace(/ph/g, 'f');
  // ξ (/ks/) → "cs" (evita o x ambíguo do PT)
  s = s.replace(/x/g, 'cs');
  // κ (/k/) → "qu" antes de vogal anterior, senão "c"
  s = s.replace(new RegExp(`k(?=${FRONT})`, 'g'), 'qu').replace(/k/g, 'c');
  // γ (/g/ duro) → "gu" antes de vogal anterior (impede o /ʒ/ do PT)
  s = s.replace(new RegExp(`g(?=${FRONT})`, 'g'), 'gu');
  // σ intervocálico → "ss" (mantém /s/; "s" simples entre vogais soa /z/ em PT)
  s = s.replace(/([aeiouáéíóúâêô])s(?=[aeiouáéíóúâêô])/g, '$1ss');
  return s;
}
