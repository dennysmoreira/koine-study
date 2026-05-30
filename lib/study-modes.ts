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
      'Gere um ESBOÇO DE PREGAÇÃO expositiva sobre o trecho, em Markdown:',
      '- Um título e o tema central (uma frase).',
      '- Uma introdução breve que situe o texto.',
      '- De 2 a 4 pontos principais, CADA UM ancorado em versículos específicos (cite a referência, ex.: "v. 3").',
      '- Quando enriquecer o ponto, traga o termo grego-chave (transliterado) e seu sentido, com base no glossário.',
      '- Uma aplicação prática e um apelo final.',
      'Seja fiel ao texto; não invente fatos que não estejam no material fornecido.',
    ].join('\n'),
  },
  {
    key: 'exegesis',
    label: 'Estudo exegético',
    icon: '🔍',
    needsPrompt: false,
    placeholder: 'Opcional: versículo ou termo específico para aprofundar…',
    instruction: [
      'Faça um ESTUDO EXEGÉTICO do trecho, em Markdown:',
      '- Contexto e estrutura do texto.',
      '- Análise dos principais TERMOS GREGOS (forma, transliteração e sentido), usando o texto grego e o glossário fornecidos.',
      '- Observações gramaticais relevantes quando o original esclarecer o sentido.',
      '- Implicações teológicas, sempre citando as referências de versículo.',
      'Baseie-se ESTRITAMENTE no material fornecido; não invente dados linguísticos.',
    ].join('\n'),
  },
  {
    key: 'devotional',
    label: 'Devocional',
    icon: '🕊️',
    needsPrompt: false,
    placeholder: 'Opcional: situação de vida ou tema para a reflexão…',
    instruction: [
      'Escreva um DEVOCIONAL curto e pastoral a partir do trecho, em Markdown:',
      '- Uma reflexão central acolhedora, fiel ao texto.',
      '- Uma aplicação pessoal concreta.',
      '- Uma breve oração ao final.',
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
      'Responda à PERGUNTA do usuário usando o trecho fornecido como base.',
      'Se a pergunta fugir do que o material permite responder, diga isso com honestidade.',
      'Responda em Markdown, citando referências de versículo quando ajudar.',
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
