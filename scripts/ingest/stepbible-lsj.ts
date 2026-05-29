/**
 * Parser do léxico LSJ via STEPBible TFLSJ (CC BY 4.0).
 *
 * Fonte: STEPBible/STEPBible-Data, arquivos
 *   "TFLSJ 0-5624 ..." (G0001-G5624, Strong's clássico) e
 *   "TFLSJ extra ..."  (G6000+, variantes/LXX — em geral fora do NT).
 * O LSJ completo (Liddell-Scott-Jones) editado por Tyndale House, JÁ chaveado por
 * Strong's (ADR-001 Fase C revisada): elimina o miss da ponte por lema que a LSJ
 * crua do Perseus teria, e vem sob CC BY 4.0 (mais permissiva que CC BY-SA).
 *
 * Formato: TSV de 8 colunas (sem header nas linhas de dados):
 *   0 eStrong (ex.: "G0030")  1 dStrong  2 uStrong  3 lema grego  4 transliteração
 *   5 morph   6 glosa curta   7 entrada completa (markup tipo HTML)
 *
 * A entrada (col 7) traz `<b>/<i>/<br/>`, marcadores de sentido `<LevelN>__II</LevelN>`
 * e links de citação `[<a title="...">Refs 5th c.BC+</a>]`. Para um painel de
 * AMPLITUDE voltado ao aprendiz, limpamos para texto legível preservando os
 * sentidos (negrito) e a estrutura (__1/__II), e DESCARTAMOS as citações clássicas
 * (ruído para quem estuda koiné). O grego já vem em Unicode.
 */

import { existsSync, readFileSync } from 'node:fs';
import { normalizeStrongs } from './books.ts';

export interface LsjEntry {
  strongs: string; // canônico "G<n>" (sem zeros à esquerda)
  lemma: string;   // forma lexical grega (col 3)
  gloss: string;   // glosa de uma palavra (col 6)
  text: string;    // entrada LSJ limpa (col 7)
}

/** Decodifica um code point de entidade numérica, preservando o original se inválido. */
function codePoint(value: number, original: string): string {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) return original;
  try {
    return String.fromCodePoint(value);
  } catch {
    return original;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => codePoint(parseInt(h, 16), m))
    .replace(/&#(\d+);/g, (m, d) => codePoint(parseInt(d, 10), m));
}

/**
 * Limpa a entrada LSJ (col 7) em texto legível:
 *   1. `<br/>` -> quebra de linha;
 *   2. remove links de citação `[<a ...>...</a>]` (com colchetes opcionais ao redor);
 *   3. desembrulha `<LevelN>` mantendo o marcador de sentido interno (__1/__II);
 *   4. remove as demais tags preservando o texto;
 *   5. decodifica entidades; 6. normaliza pontuação/espaços órfãos da remoção.
 */
export function cleanLsj(html: string): string {
  let t = html
    .replace(/<br\s*\/?>/gi, '\n')
    // citação: âncora com colchetes opcionais ao redor (o conteúdo útil — sentidos —
    // está fora dela; o title traz autor/obra clássica, ruído para o aprendiz)
    .replace(/\[?\s*<a\b[^>]*>[\s\S]*?<\/a>\s*\]?/gi, '')
    .replace(/<\/?Level\d+>/gi, '') // desembrulha marcadores de sentido
    .replace(/<[^>]+>/g, ''); // demais tags (b, i, ...) -> mantém texto
  t = decodeEntities(t);
  return t
    .split('\n')
    .map((line) =>
      line
        .replace(/\s+/g, ' ')
        .replace(/\s+([,;:.])/g, '$1') // espaço antes de pontuação
        .replace(/([,;:])(?:\s*[,;:])+/g, '$1') // pontuação duplicada (resíduo de citação removida)
        .replace(/\(\s*\)/g, '') // parênteses vazios
        .trim(),
    )
    .filter((line) => line.length > 0)
    .join('\n')
    .trim();
}

/**
 * Lê os arquivos TFLSJ e devolve um mapa Strong's canônico ("G<n>") -> entrada LSJ.
 * Aceita 1+ caminhos (main + extra); o primeiro a definir um Strong's vence (main
 * antes de extra). Arquivos ausentes são ignorados (rode `ingest:download-stepbible`).
 */
export function parseTflsj(...paths: string[]): Map<string, LsjEntry> {
  const map = new Map<string, LsjEntry>();
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    for (const raw of text.split('\n')) {
      // só linhas de dados: começam com "G<dígitos>" + TAB (pula cabeçalho/seções)
      if (!/^G\d/.test(raw)) continue;
      const cols = raw.split('\t');
      if (cols.length < 8) continue;
      const strongs = normalizeStrongs((cols[0] ?? '').replace(/^[Gg]/, ''));
      if (!strongs || map.has(strongs)) continue;
      const lemma = (cols[3] ?? '').trim();
      const gloss = (cols[6] ?? '').trim();
      const body = cleanLsj(cols[7] ?? '');
      if (!body) continue;
      map.set(strongs, { strongs, lemma, gloss, text: body });
    }
  }
  return map;
}
