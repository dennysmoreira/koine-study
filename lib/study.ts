/**
 * Camada de "Estudo com IA": monta o CONTEXTO (texto grego + versões + glossário
 * lexical) de um capítulo e o PROMPT enviado ao modelo, por modo.
 *
 * server-only: importa a camada de corpus (que usa a anon key) e nunca deve ir
 * para o bundle do cliente.
 */
import 'server-only';
import { getChapter } from './corpus';
import { getParallelChapter } from './translations';
import { getStudyMode, type StudyMode } from './study-modes';

// Instrução de sistema comum a todos os modos: define o papel e as travas de
// fidelidade ao texto (anti-alucinação).
export const STUDY_SYSTEM = [
  'Você é um assistente de exegese bíblica e homilética, especialista em grego koiné do Novo Testamento.',
  'Você recebe, de um capítulo: o texto grego original (SBLGNT), uma ou mais traduções e um glossário lexical (lema → sentido).',
  'Baseie-se ESTRITAMENTE no material fornecido. Não invente dados linguísticos, históricos ou referências que não estejam no contexto.',
  'Responda SEMPRE em português do Brasil (PT-BR) e em Markdown bem estruturado (títulos, listas).',
  'Quando citar o grego, traga a transliteração e o sentido conforme o glossário.',
].join('\n');

// Limite defensivo de lemas no glossário para não estourar o prompt em capítulos
// muito longos (mantém os primeiros encontrados — cobre o vocabulário principal).
const MAX_GLOSSARY = 120;

/**
 * Monta o bloco de contexto do capítulo. Sempre inclui o grego e o glossário
 * (fundamentação no original), além das traduções selecionadas no comparador.
 * Retorna null se o capítulo não existir.
 */
export async function buildStudyContext(
  osis: string,
  chapter: number,
  codes: string[],
): Promise<{ text: string; bookName: string } | null> {
  const [greek, parallel] = await Promise.all([
    getChapter(osis, chapter),
    codes.length > 0 ? getParallelChapter(osis, chapter, codes) : Promise.resolve(null),
  ]);
  if (!greek) return null;

  const lines: string[] = [];
  lines.push(`CAPÍTULO: ${greek.book.name_pt} ${chapter}`);

  // 1) Texto grego por versículo (surfaces na ordem de posição).
  lines.push('', 'TEXTO GREGO (SBLGNT):');
  for (const v of greek.verses) {
    const surface = v.tokens.map((t) => t.surface).join(' ').trim();
    if (surface) lines.push(`v${v.verse} ${surface}`);
  }

  // 2) Traduções selecionadas no comparador (se houver).
  if (parallel && parallel.translations.length > 0) {
    const names = new Map(parallel.translations.map((t) => [t.code, t.name]));
    lines.push('', 'TRADUÇÕES:');
    for (const row of parallel.rows) {
      for (const t of parallel.translations) {
        if (t.is_original) continue; // o grego já foi listado acima
        const text = row.texts[t.code];
        if (text) lines.push(`v${row.verse} [${names.get(t.code)}] ${text}`);
      }
    }
  }

  // 3) Glossário: lemas únicos do capítulo → sentido (PT, com fallback EN).
  const seen = new Set<string>();
  const glossary: string[] = [];
  for (const v of greek.verses) {
    for (const tok of v.tokens) {
      const lem = tok.lemma;
      if (!lem?.lemma || seen.has(lem.lemma)) continue;
      const sense = lem.gloss_pt ?? lem.gloss_en;
      if (!sense) continue;
      seen.add(lem.lemma);
      const strongs = lem.strongs ? ` (${lem.strongs})` : '';
      glossary.push(`${lem.lemma}${strongs}: ${sense}`);
      if (glossary.length >= MAX_GLOSSARY) break;
    }
    if (glossary.length >= MAX_GLOSSARY) break;
  }
  if (glossary.length > 0) {
    lines.push('', 'GLOSSÁRIO (lemas-chave do capítulo):', ...glossary);
  }

  return { text: lines.join('\n'), bookName: greek.book.name_pt };
}

/**
 * Monta o prompt do usuário: instrução do modo + foco do usuário (prioritário) +
 * material do capítulo como contexto.
 *
 * Quando o usuário informa um foco (ex.: "versículo 33, para mentoria de casais"),
 * ele vem ANTES do material e com instrução explícita de prioridade — senão o
 * modelo trata o pedido como secundário e devolve um estudo genérico do capítulo.
 */
export function buildStudyPrompt(mode: StudyMode, context: string, userPrompt: string): string {
  const meta = getStudyMode(mode);
  const extra = userPrompt.trim();
  const parts: string[] = [meta.instruction];

  if (extra) {
    if (meta.needsPrompt) {
      // Modo "pergunta livre": o texto do usuário é a própria pergunta.
      parts.push('', '---', 'PERGUNTA DO USUÁRIO (responda especificamente a isto):', extra);
    } else {
      // Demais modos: o texto é um FOCO que deve reger todo o estudo.
      parts.push(
        '',
        '---',
        'FOCO SOLICITADO PELO USUÁRIO (PRIORIDADE MÁXIMA):',
        extra,
        '',
        'Direcione TODO o estudo a este foco — respeite o versículo, o público-alvo e/ou o ângulo indicados.',
        'Use o restante do capítulo apenas como contexto de apoio; não o transforme no assunto principal.',
      );
    }
  }

  parts.push('', '---', 'MATERIAL DO CAPÍTULO (contexto):', context);
  return parts.join('\n');
}
