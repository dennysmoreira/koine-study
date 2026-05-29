/**
 * Parser do léxico Dodson (domínio público) — glosas EN chaveadas por Strong's.
 *
 * Módulo compartilhado entre o build legado (byztxt) e o build crítico
 * (MACULA/SBLGNT): ambos só precisam das glosas/gk_number por Strong's, e o build
 * byztxt também usa o lema Unicode de dicionário.
 *
 * O CSV (TSV, na verdade) traz id/gk_number/glosas; o XML expõe a forma de
 * dicionário já em Unicode no atributo `entry n="<lema> | <strongs>"`
 * (ex.: n="βίβλος | 0976"). Mantém-se livre de dependências de XML (regex),
 * pois o objetivo é só extrair atributos, não navegar a árvore.
 */

import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import { normalizeStrongs } from './books.ts';

export interface DodsonEntry {
  strongs: string;
  lemma: string; // forma de dicionário (Unicode; fallback p/ beta-code do CSV)
  gk_number: string | null;
  gloss_en: string | null;
  gloss_long_en: string | null;
}

/**
 * Lê dodson.xml e devolve mapa strongs canônico ("G<n>") -> lema Unicode.
 * Retorna mapa vazio se o arquivo não existir (apenas degrada para beta-code).
 */
export function parseUnicodeLemmas(xmlPath: string): Map<string, string> {
  const byStrongs = new Map<string, string>();
  if (!existsSync(xmlPath)) return byStrongs;
  const xml = readFileSync(xmlPath, 'utf8');
  const re = /<entry n="([^"]*?) \| ([^"]*?)">/g;
  for (let m = re.exec(xml); m !== null; m = re.exec(xml)) {
    const strongs = normalizeStrongs(m[2]);
    const lemma = (m[1] ?? '').trim();
    if (!strongs || !lemma || byStrongs.has(strongs)) continue;
    byStrongs.set(strongs, lemma);
  }
  return byStrongs;
}

/**
 * Lê dodson.csv (+ xml p/ lema Unicode) e devolve mapa strongs canônico -> entrada.
 * Deduplica para 1 entrada por Strong's (primeira ocorrência vence).
 */
export function parseDodson(csvPath: string, xmlPath: string): Map<string, DodsonEntry> {
  const raw = readFileSync(csvPath, 'utf8');
  const rows = parse(raw, { delimiter: '\t', quote: '"', columns: true, skip_empty_lines: true });
  const unicodeByStrongs = parseUnicodeLemmas(xmlPath);
  const byStrongs = new Map<string, DodsonEntry>();
  for (const r of rows as Record<string, string>[]) {
    const strongs = normalizeStrongs(r["Strong's"]);
    if (!strongs || byStrongs.has(strongs)) continue;
    const betaCode = (r['Greek Word'] ?? '').trim();
    byStrongs.set(strongs, {
      strongs,
      lemma: unicodeByStrongs.get(strongs) ?? betaCode,
      gk_number: (r['Goodrick-Kohlenberger'] ?? '').trim() || null,
      gloss_en: (r['English Definition (brief)'] ?? '').trim() || null,
      gloss_long_en: (r['English Definition (longer)'] ?? '').trim() || null,
    });
  }
  return byStrongs;
}
