// Catálogo estático de lições de gramática koiné (conteúdo autoral, em PT).
// O conteúdo das lições NÃO é dado de usuário: vive no código. Apenas o progresso
// (quais lições foram concluídas) é persistido por usuário em `study_progress`.

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'example'; greek: string; translit?: string; gloss: string }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'note'; text: string };

export interface LessonSection {
  heading: string;
  blocks: Block[];
}

export interface Lesson {
  id: string;
  order: number;
  title: string;
  summary: string;
  durationMin: number;
  sections: LessonSection[];
}

const LESSONS: Lesson[] = [
  {
    id: 'alfabeto',
    order: 1,
    title: 'O alfabeto grego',
    summary: 'As 24 letras, seus nomes e sons. A base para ler qualquer palavra.',
    durationMin: 8,
    sections: [
      {
        heading: 'As 24 letras',
        blocks: [
          {
            kind: 'p',
            text: 'O grego koiné usa 24 letras. Cada uma tem uma forma maiúscula e uma minúscula. Na leitura do Novo Testamento você lidará quase sempre com as minúsculas.',
          },
          {
            kind: 'table',
            head: ['Minúscula', 'Maiúscula', 'Nome', 'Som'],
            rows: [
              ['α', 'Α', 'alfa', 'a'],
              ['β', 'Β', 'beta', 'b'],
              ['γ', 'Γ', 'gama', 'g (de "gato")'],
              ['δ', 'Δ', 'delta', 'd'],
              ['ε', 'Ε', 'épsilon', 'e (breve)'],
              ['ζ', 'Ζ', 'zeta', 'dz'],
              ['η', 'Η', 'eta', 'ê (longo)'],
              ['θ', 'Θ', 'theta', 'th'],
              ['ι', 'Ι', 'iota', 'i'],
              ['κ', 'Κ', 'kappa', 'k'],
              ['λ', 'Λ', 'lambda', 'l'],
              ['μ', 'Μ', 'mu', 'm'],
              ['ν', 'Ν', 'nu', 'n'],
              ['ξ', 'Ξ', 'xi', 'ks'],
              ['ο', 'Ο', 'ômicron', 'o (breve)'],
              ['π', 'Π', 'pi', 'p'],
              ['ρ', 'Ρ', 'rho', 'r'],
              ['σ / ς', 'Σ', 'sigma', 's'],
              ['τ', 'Τ', 'tau', 't'],
              ['υ', 'Υ', 'ípsilon', 'ü (entre i e u)'],
              ['φ', 'Φ', 'phi', 'f'],
              ['χ', 'Χ', 'chi', 'kh (aspirado)'],
              ['ψ', 'Ψ', 'psi', 'ps'],
              ['ω', 'Ω', 'ômega', 'ô (longo)'],
            ],
          },
          {
            kind: 'note',
            text: 'O sigma tem duas formas: ς é usado só no fim da palavra; σ em qualquer outra posição. Ex.: Ἰησοῦς termina com ς.',
          },
        ],
      },
      {
        heading: 'Vogais longas e breves',
        blocks: [
          {
            kind: 'p',
            text: 'Sete letras são vogais: α, ε, η, ι, ο, υ, ω. Duas são sempre longas (η, ω), duas sempre breves (ε, ο) e três podem ser longas ou breves conforme a palavra (α, ι, υ).',
          },
          {
            kind: 'p',
            text: 'A duração da vogal importa para a acentuação e para distinguir certas formas verbais e nominais — algo que você vai reconhecer com o tempo.',
          },
        ],
      },
    ],
  },
  {
    id: 'espiritos-acentos',
    order: 2,
    title: 'Espíritos e acentos',
    summary: 'Os sinais sobre as vogais: respiração áspera/suave e os três acentos.',
    durationMin: 7,
    sections: [
      {
        heading: 'Espíritos (respirações)',
        blocks: [
          {
            kind: 'p',
            text: 'Toda palavra que começa por vogal recebe um sinal de respiração sobre ela. O espírito suave (᾽) não muda o som; o espírito áspero (῾) acrescenta um som de "h" inicial.',
          },
          {
            kind: 'example',
            greek: 'ἐν',
            translit: 'en',
            gloss: 'em (espírito suave — sem "h")',
          },
          {
            kind: 'example',
            greek: 'ἡμέρα',
            translit: 'heméra',
            gloss: 'dia (espírito áspero — "h" inicial)',
          },
          {
            kind: 'note',
            text: 'A letra ρ no início de palavra leva sempre espírito áspero: ῥ (daí transliterações como "rh").',
          },
        ],
      },
      {
        heading: 'Os três acentos',
        blocks: [
          {
            kind: 'p',
            text: 'O grego tem três acentos: agudo (´), grave (`) e circunflexo (˜). No koiné eles pouco afetam a pronúncia, mas ajudam a distinguir palavras parecidas.',
          },
          {
            kind: 'example',
            greek: 'τίς / τις',
            gloss: 'τίς (com acento) = "quem?"; τις (sem acento próprio) = "alguém"',
          },
          {
            kind: 'note',
            text: 'Há ainda o iota subscrito — um ι minúsculo escrito embaixo da vogal (ᾳ, ῃ, ῳ). Ele costuma marcar o caso dativo.',
          },
        ],
      },
    ],
  },
  {
    id: 'artigo',
    order: 3,
    title: 'O artigo definido',
    summary: 'ὁ, ἡ, τό — o artigo grego e por que ele é a chave da análise sintática.',
    durationMin: 10,
    sections: [
      {
        heading: 'O grego só tem artigo definido',
        blocks: [
          {
            kind: 'p',
            text: 'Diferente do português, o grego tem apenas o artigo definido ("o/a"). Não existe artigo indefinido ("um/uma") — a ausência de artigo já sugere indefinição.',
          },
          {
            kind: 'p',
            text: 'O artigo concorda com o substantivo em gênero, número e caso. Por isso ele é uma das ferramentas mais úteis para identificar a função de uma palavra na frase.',
          },
        ],
      },
      {
        heading: 'A declinação completa',
        blocks: [
          {
            kind: 'table',
            head: ['Caso', 'Masc. sing.', 'Fem. sing.', 'Neut. sing.'],
            rows: [
              ['Nominativo', 'ὁ', 'ἡ', 'τό'],
              ['Genitivo', 'τοῦ', 'τῆς', 'τοῦ'],
              ['Dativo', 'τῷ', 'τῇ', 'τῷ'],
              ['Acusativo', 'τόν', 'τήν', 'τό'],
            ],
          },
          {
            kind: 'table',
            head: ['Caso', 'Masc. pl.', 'Fem. pl.', 'Neut. pl.'],
            rows: [
              ['Nominativo', 'οἱ', 'αἱ', 'τά'],
              ['Genitivo', 'τῶν', 'τῶν', 'τῶν'],
              ['Dativo', 'τοῖς', 'ταῖς', 'τοῖς'],
              ['Acusativo', 'τούς', 'τάς', 'τά'],
            ],
          },
          {
            kind: 'note',
            text: 'Decorar o artigo é um ótimo investimento: como ele carrega caso, gênero e número, reconhecê-lo já entrega boa parte da análise do substantivo seguinte.',
          },
        ],
      },
      {
        heading: 'O artigo em uso',
        blocks: [
          {
            kind: 'p',
            text: 'Sozinhas, as formas do artigo podem parecer abstratas. Veja o que cada caso significa quando o artigo acompanha um substantivo como λόγος ("palavra"):',
          },
          { kind: 'example', greek: 'ὁ λόγος', gloss: 'a palavra (nominativo — o sujeito da frase)' },
          { kind: 'example', greek: 'τοῦ λόγου', gloss: 'da palavra (genitivo — posse/origem)' },
          { kind: 'example', greek: 'τῷ λόγῳ', gloss: 'à/para a palavra (dativo — objeto indireto)' },
          { kind: 'example', greek: 'τὸν λόγον', gloss: 'a palavra (acusativo — objeto direto)' },
          {
            kind: 'note',
            text: 'O mesmo padrão vale para os três gêneros: ἡ ἀγάπη ("o amor", fem.) e τὸ ἔργον ("a obra", neut.) mudam a terminação do mesmo jeito conforme o caso.',
          },
        ],
      },
    ],
  },
  {
    id: 'casos',
    order: 4,
    title: 'Os cinco casos',
    summary: 'Nominativo, genitivo, dativo, acusativo e vocativo — a função das palavras.',
    durationMin: 12,
    sections: [
      {
        heading: 'O que o caso indica',
        blocks: [
          {
            kind: 'p',
            text: 'Em grego, a função de uma palavra na frase é marcada pela sua terminação (caso), não pela ordem das palavras como no português. São cinco casos.',
          },
          {
            kind: 'table',
            head: ['Caso', 'Função básica', 'Equivalente em PT'],
            rows: [
              ['Nominativo', 'sujeito', 'o/a (sujeito)'],
              ['Genitivo', 'posse, origem', 'de'],
              ['Dativo', 'objeto indireto, meio, lugar', 'a/para, com, em'],
              ['Acusativo', 'objeto direto', '(complemento direto)'],
              ['Vocativo', 'chamamento direto', 'ó! (ao se dirigir a alguém)'],
            ],
          },
        ],
      },
      {
        heading: 'θεός nos quatro casos principais',
        blocks: [
          { kind: 'example', greek: 'ὁ θεός', gloss: 'Deus (nominativo — sujeito)' },
          { kind: 'example', greek: 'τοῦ θεοῦ', gloss: 'de Deus (genitivo)' },
          { kind: 'example', greek: 'τῷ θεῷ', gloss: 'a/para Deus (dativo)' },
          { kind: 'example', greek: 'τὸν θεόν', gloss: 'Deus (acusativo — objeto direto)' },
          {
            kind: 'note',
            text: 'Repare como a terminação muda (-ος, -οῦ, -ῷ, -όν) e como o artigo acompanha. É essa mudança que o modo Parsing treina você a reconhecer.',
          },
        ],
      },
    ],
  },
  {
    id: 'substantivos-declinacao',
    order: 5,
    title: 'Substantivos: 1ª e 2ª declinação',
    summary: 'Os dois padrões mais comuns de terminações nominais no Novo Testamento.',
    durationMin: 12,
    sections: [
      {
        heading: '2ª declinação: λόγος (masculino)',
        blocks: [
          {
            kind: 'p',
            text: 'A 2ª declinação reúne a maioria dos substantivos masculinos terminados em -ος e neutros em -ον. Veja o paradigma de λόγος ("palavra").',
          },
          {
            kind: 'table',
            head: ['Caso', 'Singular', 'Plural'],
            rows: [
              ['Nominativo', 'λόγος', 'λόγοι'],
              ['Genitivo', 'λόγου', 'λόγων'],
              ['Dativo', 'λόγῳ', 'λόγοις'],
              ['Acusativo', 'λόγον', 'λόγους'],
              ['Vocativo', 'λόγε', 'λόγοι'],
            ],
          },
          { kind: 'example', greek: 'λόγος → λόγοι', gloss: '"a palavra" → "as palavras" (singular vs. plural)' },
          { kind: 'example', greek: 'τὸν λόγον', gloss: 'a palavra (acusativo — quando é objeto direto da frase)' },
        ],
      },
      {
        heading: '1ª declinação: ἀγάπη (feminino)',
        blocks: [
          {
            kind: 'p',
            text: 'A 1ª declinação reúne sobretudo substantivos femininos terminados em -η ou -α. Veja ἀγάπη ("amor").',
          },
          {
            kind: 'table',
            head: ['Caso', 'Singular', 'Plural'],
            rows: [
              ['Nominativo', 'ἀγάπη', 'ἀγάπαι'],
              ['Genitivo', 'ἀγάπης', 'ἀγαπῶν'],
              ['Dativo', 'ἀγάπῃ', 'ἀγάπαις'],
              ['Acusativo', 'ἀγάπην', 'ἀγάπας'],
            ],
          },
          { kind: 'example', greek: 'ἡ ἀγάπη', gloss: 'o amor (nominativo)' },
          { kind: 'example', greek: 'τῆς ἀγάπης', gloss: 'do amor (genitivo) — como em "o fruto do amor"' },
          {
            kind: 'note',
            text: 'O gênero de um substantivo não é sempre óbvio pela terminação — por isso o léxico (e o artigo na frase) confirmam se é masculino, feminino ou neutro.',
          },
        ],
      },
    ],
  },
  {
    id: 'verbo-presente',
    order: 6,
    title: 'O presente ativo indicativo',
    summary: 'Como o verbo grego marca pessoa e número na própria terminação.',
    durationMin: 11,
    sections: [
      {
        heading: 'O verbo carrega o sujeito',
        blocks: [
          {
            kind: 'p',
            text: 'No grego, a terminação do verbo já indica a pessoa e o número do sujeito. Por isso o pronome ("eu", "tu"...) costuma ser omitido. Veja λύω ("eu solto/desato").',
          },
          {
            kind: 'table',
            head: ['Pessoa', 'Forma', 'Tradução'],
            rows: [
              ['1ª sing.', 'λύω', 'eu solto'],
              ['2ª sing.', 'λύεις', 'tu soltas'],
              ['3ª sing.', 'λύει', 'ele/ela solta'],
              ['1ª pl.', 'λύομεν', 'nós soltamos'],
              ['2ª pl.', 'λύετε', 'vós soltais'],
              ['3ª pl.', 'λύουσι(ν)', 'eles/elas soltam'],
            ],
          },
          {
            kind: 'note',
            text: 'As terminações -ω, -εις, -ει, -ομεν, -ετε, -ουσι(ν) são o padrão do presente ativo indicativo. O -ν final ("ν móvel") aparece antes de vogal ou no fim da frase.',
          },
        ],
      },
      {
        heading: 'O verbo "ser/estar": εἰμί',
        blocks: [
          {
            kind: 'p',
            text: 'εἰμί é irregular e extremamente comum. Vale a pena reconhecê-lo de imediato.',
          },
          {
            kind: 'table',
            head: ['Pessoa', 'Forma', 'Tradução'],
            rows: [
              ['1ª sing.', 'εἰμί', 'eu sou/estou'],
              ['2ª sing.', 'εἶ', 'tu és/estás'],
              ['3ª sing.', 'ἐστί(ν)', 'ele/ela é/está'],
              ['1ª pl.', 'ἐσμέν', 'nós somos/estamos'],
              ['2ª pl.', 'ἐστέ', 'vós sois/estais'],
              ['3ª pl.', 'εἰσί(ν)', 'eles/elas são/estão'],
            ],
          },
        ],
      },
    ],
  },
];

export function getLessons(): Lesson[] {
  return [...LESSONS].sort((a, b) => a.order - b.order);
}

export function getLesson(id: string): Lesson | null {
  return LESSONS.find((l) => l.id === id) ?? null;
}
