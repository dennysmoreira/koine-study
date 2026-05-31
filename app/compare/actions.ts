'use server';

import { getLexiconEntries, type LexiconEntry } from '@/lib/corpus';

// Server Action chamada pelo comparador unificado (client component) ao abrir o
// painel de um token grego. As entradas LSJ são grandes (mediana ~200, máx ~16 KB
// de texto), então NÃO viajam no payload do capítulo — são buscadas sob demanda,
// chaveadas pelo Strong's do lema (estável entre rebuilds). `getLexiconEntries` já
// é cacheada no Data Cache do Next (tag 'corpus'), então repetições vêm do cache.
export async function fetchLexicon(strongs: string): Promise<LexiconEntry[]> {
  const key = strongs.trim();
  if (!key) return [];
  return getLexiconEntries(key);
}
