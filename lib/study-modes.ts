/**
 * Modos do "Estudo com IA" do comparador. Módulo de DADOS PUROS (sem imports
 * server-only) para ser compartilhado entre o cliente (rótulos/ícones) e o
 * servidor (instruções enviadas ao modelo).
 *
 * Adicionar um modo é só acrescentar um item aqui — Open/Closed: nem a UI nem a
 * rota precisam de novos `if`s.
 */

export type StudyMode = 'sermon' | 'exegesis' | 'devotional' | 'free';

export interface StudyModeMeta {
  key: StudyMode;
  label: string;
  icon: string;
  /** se true, o campo de texto livre é obrigatório (ex.: pergunta livre). */
  needsPrompt: boolean;
  /** dica exibida no campo de texto livre (quando aplicável). */
  placeholder: string;
  /** instrução específica do modo, anexada ao prompt enviado ao modelo. */
  instruction: string;
}

export const STUDY_MODES: StudyModeMeta[] = [
  {
    key: 'sermon',
    label: 'Esboço de pregação',
    icon: '📖',
    needsPrompt: false,
    placeholder: 'Opcional: foco, público ou ângulo do sermão…',
    instruction: [
      'Gere um ESBOÇO DE PREGAÇÃO EXPOSITIVA: a mensagem deve NASCER do texto (exegese antes da homilética), nunca impor um tema externo ao texto. Use TEXTO PURO, sem Markdown.',
      'Estruture: título e tema central (uma frase — a proposição do próprio trecho); introdução breve que situe o texto no seu contexto e gênero; de 2 a 4 pontos, CADA UM ancorado em versículos específicos (cite "v. 3") e fiel ao argumento do texto; ao esclarecer, traga o termo-chave no original (transliterado) e o sentido pelo glossário; uma aplicação enraizada no sentido pretendido pelo autor; um apelo final.',
      'Seja fiel ao texto; não invente fatos ausentes do material fornecido.',
    ].join('\n'),
  },
  {
    key: 'exegesis',
    label: 'Estudo exegético',
    icon: '🔍',
    needsPrompt: false,
    placeholder: 'Opcional: versículo ou termo específico para aprofundar…',
    instruction: [
      'Faça um ESTUDO EXEGÉTICO do trecho pelo método histórico-gramatical. Use TEXTO PURO (sem Markdown); separe cada seção por uma linha em branco e titule-a em CAIXA ALTA. Trabalhe SÓ com o material fornecido (texto original, glossário, traduções, referências cruzadas) e cite o versículo a cada afirmação.',
      '1. DELIMITAÇÃO E CONTEXTO — limites da perícope e seu lugar no argumento do livro; pano de fundo histórico-cultural quando conhecido.',
      '2. GÊNERO — o gênero literário do trecho e como ele orienta a leitura.',
      '3. ESTRUTURA — o fluxo do argumento: orações principais e subordinadas e os conectivos-chave do original (ex.: γάρ, οὖν, ἵνα).',
      '4. GRAMÁTICA — observações de morfologia/sintaxe que mudam o sentido (tempo/aspecto verbal, caso, voz, particípios), com base na morfologia fornecida.',
      '5. PALAVRAS-CHAVE — termos no original (forma, transliteração e sentido pelo glossário), evitando falácias semânticas (etimologismo, sobrecarga de sentido, anacronismo).',
      '6. TRADUÇÕES — onde as versões fornecidas divergem e por quê.',
      '7. PARALELOS — referências cruzadas e o lugar do texto na teologia bíblica.',
      '8. SÍNTESE — a proposição central: o que o autor comunicou à audiência ORIGINAL.',
      '9. APLICAÇÃO — princípio transcultural e aplicação hoje, distinguindo o normativo do circunstancial.',
      'Se faltar material para algum passo, diga isso brevemente em vez de inventar. Não crie variantes textuais, datas ou dados lexicais ausentes do contexto.',
    ].join('\n'),
  },
  {
    key: 'devotional',
    label: 'Devocional',
    icon: '🕊️',
    needsPrompt: false,
    placeholder: 'Opcional: situação de vida ou tema para a reflexão…',
    instruction: [
      'Escreva um DEVOCIONAL curto e pastoral a partir do trecho, em TEXTO PURO (sem Markdown):',
      'uma reflexão central acolhedora e fiel ao que o texto de fato diz no seu contexto; uma aplicação pessoal concreta; uma breve oração ao final.',
      'Tom caloroso e encorajador, sem extrapolar o que o texto diz.',
    ].join('\n'),
  },
  {
    key: 'free',
    label: 'Pergunta livre',
    icon: '💬',
    needsPrompt: true,
    placeholder: 'Escreva sua pergunta sobre o trecho…',
    instruction: [
      'Responda à PERGUNTA do usuário com base no trecho fornecido, pelo método histórico-gramatical (contexto, gênero e idioma original).',
      'Se a pergunta fugir do que o material permite responder, diga isso com honestidade.',
      'Responda em TEXTO PURO, citando referências de versículo quando ajudar.',
    ].join('\n'),
  },
];

const MODE_KEYS = new Set<string>(STUDY_MODES.map((m) => m.key));

export function isStudyMode(value: unknown): value is StudyMode {
  return typeof value === 'string' && MODE_KEYS.has(value);
}

export function getStudyMode(key: StudyMode): StudyModeMeta {
  // existência garantida pelo tipo StudyMode (validado por isStudyMode na borda).
  return STUDY_MODES.find((m) => m.key === key) as StudyModeMeta;
}
