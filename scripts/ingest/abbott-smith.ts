/**
 * Parser do léxico Abbott-Smith (TEI XML, domínio público).
 *
 * Fonte: translatable-exegetical-tools/Abbott-Smith (abbott-smith.tei.xml).
 * Cada entrada tem a forma `<entry n="<lema>|G<strongs>[|G<strongs>...]"> ... </entry>`
 * (separador "|", Strong's com prefixo "G"). ~5.4k das ~6.1k entradas têm Strong's;
 * as sem Strong's (nomes próprios raros) são ignoradas porque o linking do corpus é
 * por Strong's. 15 entradas têm múltiplos Strong's — todos recebem o mesmo texto.
 *
 * Mantém-se livre de dependências de XML (mesma abordagem regex do Dodson XML),
 * já que o objetivo é só extrair texto legível, não navegar a árvore TEI.
 */

import { existsSync, readFileSync } from 'node:fs';
import { normalizeStrongs } from './books.ts';

/**
 * Converte um code point numérico (de uma entidade `&#..;` / `&#x..;`) em texto.
 * Code points fora do intervalo Unicode (> 0x10FFFF) ou inválidos fariam
 * String.fromCodePoint lançar RangeError e abortar o parse inteiro; nesse caso
 * preservamos o texto original da entidade em vez de quebrar.
 */
function codePoint(value: number, original: string): string {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) return original;
  try {
    return String.fromCodePoint(value);
  } catch {
    return original;
  }
}

/**
 * Limpa o corpo TEI de uma entrada em texto legível: descarta a contagem de
 * ocorrências no NT, remove todas as tags (preservando o conteúdo textual — o
 * grego já está em Unicode), decodifica entidades XML e colapsa espaços.
 */
export function cleanEntry(innerXml: string): string {
  return innerXml
    .replace(/<note\b[^>]*type="occurrencesNT"[^>]*>[\s\S]*?<\/note>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => codePoint(parseInt(h, 16), m))
    .replace(/&#(\d+);/g, (m, d) => codePoint(parseInt(d, 10), m))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Lê o TEI e devolve um mapa Strong's canônico ("G<n>") -> entrada limpa.
 * Retorna mapa vazio se o arquivo não existir (rode `npm run ingest:download`).
 */
export function parseAbbottSmith(xmlPath: string): Map<string, string> {
  const map = new Map<string, string>();
  if (!existsSync(xmlPath)) return map;
  const xml = readFileSync(xmlPath, 'utf8');
  // Assume `n` como primeiro atributo de <entry> (formato fixo do TEI desta fonte;
  // confere com ~99,5% de cobertura). Entradas onde `n` não venha primeiro seriam
  // ignoradas — aceitável para esta fonte controlada de domínio público.
  const re = /<entry\s+n="([^"]*)"[^>]*>([\s\S]*?)<\/entry>/g;
  for (let m = re.exec(xml); m !== null; m = re.exec(xml)) {
    const parts = (m[1] ?? '').split('|');
    const text = cleanEntry(m[2] ?? '');
    if (!text) continue;
    for (const raw of parts.slice(1)) {
      // raw ex.: "G2" -> remove o "G" e normaliza p/ a forma canônica "G<n>"
      const strongs = normalizeStrongs(raw.replace(/^[Gg]/, ''));
      if (strongs && !map.has(strongs)) map.set(strongs, text);
    }
  }
  return map;
}
