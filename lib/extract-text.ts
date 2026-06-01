/**
 * Extração de texto de fontes anexadas pelo usuário (PDF e arquivos de texto).
 *
 * O conteúdo extraído é o que alimenta o contexto da IA — sem isto, um PDF
 * anexado fica invisível ao modelo (só o binário vai pro Storage). Suporta PDF
 * (via unpdf, serverless-friendly) e texto puro; outros formatos retornam null.
 *
 * server-only: usa unpdf (Node) e nunca deve ir para o bundle do cliente.
 */
import 'server-only';

// Limite defensivo do texto persistido por fonte: evita gravar uma linha gigante
// em study_sources. A injeção no prompt tem seu próprio corte menor (ver study.ts).
const MAX_EXTRACTED_CHARS = 200_000;

/** True se o arquivo é um PDF (por mime-type ou extensão). */
function isPdf(mimeType: string | null, fileName: string): boolean {
  if (mimeType === 'application/pdf') return true;
  return fileName.toLowerCase().endsWith('.pdf');
}

/** True se o arquivo é texto puro tratável como UTF-8 (txt/md/csv/json…). */
function isPlainText(mimeType: string | null, fileName: string): boolean {
  if (mimeType?.startsWith('text/')) return true;
  if (mimeType === 'application/json') return true;
  return /\.(txt|md|markdown|csv|json|text)$/i.test(fileName);
}

/**
 * Extrai o texto de um arquivo. Retorna null quando o formato não é suportado
 * (ex.: docx, imagem) ou quando nada legível foi extraído (ex.: PDF escaneado
 * sem camada de texto — exigiria OCR, fora de escopo).
 */
export async function extractFileText(
  bytes: Uint8Array,
  mimeType: string | null,
  fileName: string,
): Promise<string | null> {
  let text: string | null = null;

  if (isPdf(mimeType, fileName)) {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(bytes);
    const result = await extractText(pdf, { mergePages: true });
    text = Array.isArray(result.text) ? result.text.join('\n') : result.text;
  } else if (isPlainText(mimeType, fileName)) {
    text = new TextDecoder('utf-8').decode(bytes);
  }

  // PDFs costumam emitir espaços especiais (não-quebrável U+00A0, estreito
  // U+202F/U+2007); normaliza para espaço comum para o texto fluir no prompt.
  const clean = text?.replace(/[\u00A0\u202F\u2007]/g, ' ').trim();
  if (!clean) return null;
  return clean.slice(0, MAX_EXTRACTED_CHARS);
}
