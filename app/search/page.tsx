import Link from 'next/link';
import type { ReactNode } from 'react';
import { searchVerses, parseReference } from '@/lib/search';
import { SearchForm } from '@/components/SearchForm';

export const dynamic = 'force-dynamic';

// Realça os termos da consulta no texto do resultado, comparando SEM acentos e
// sem caixa (a posição vem do texto normalizado; o recorte é no original, que
// tem o mesmo comprimento porque a normalização só remove marcas combinantes).
function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function markMatches(text: string, query: string): ReactNode {
  const words = [...new Set(normalize(query).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3))];
  if (words.length === 0) return text;

  // Itera o NFD por CODE POINTS, mantendo só caracteres-base (não-marcas). Para
  // cada base mantido i, `starts[i]` é seu offset (code units) no nfd; o FIM
  // exclusivo de i é `starts[i+1]` (sentinela no final) — assim as marcas
  // combinantes que SEGUEM um base ficam na fatia dele (acentos não vazam para
  // a fatia vizinha) e pares substitutos nunca são partidos. Em `stripped`,
  // cada base ocupa EXATAMENTE 1 code unit: bases cujo lowercase não é 1 unit
  // (astrais, casos especiais) viram um placeholder que não casa com a busca.
  const nfd = text.normalize('NFD');
  const starts: number[] = [];
  let stripped = '';
  let off = 0;
  for (const cp of nfd) {
    if (!/\p{M}/u.test(cp)) {
      starts.push(off);
      const lower = cp.toLowerCase();
      stripped += lower.length === 1 ? lower : '￿';
    }
    off += cp.length;
  }
  starts.push(nfd.length); // fim exclusivo do último base

  const ranges: Array<[number, number]> = [];
  for (const w of words) {
    let from = 0;
    for (;;) {
      const idx = stripped.indexOf(w, from);
      if (idx === -1) break;
      ranges.push([idx, idx + w.length]);
      from = idx + w.length;
    }
  }
  if (ranges.length === 0) return text;
  ranges.sort((a, b) => a[0] - b[0]);

  const out: ReactNode[] = [];
  let cursor = 0; // em ordinais de `stripped` (1 base = 1 posição)
  const sliceNfd = (a: number, b: number) =>
    nfd.slice(starts[a] ?? nfd.length, starts[b] ?? nfd.length).normalize('NFC');
  for (const [a, b] of ranges) {
    if (a < cursor) continue; // sobreposição: já coberto
    if (a > cursor) out.push(sliceNfd(cursor, a));
    out.push(
      <mark key={`${a}-${b}`} className="rounded bg-amber-200/70 px-0.5 dark:bg-amber-500/30 dark:text-amber-100">
        {sliceNfd(a, b)}
      </mark>,
    );
    cursor = b;
  }
  if (cursor < stripped.length) out.push(sliceNfd(cursor, stripped.length));
  return out;
}

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const query = (searchParams.q ?? '').trim();

  const [reference, outcome] = query
    ? await Promise.all([parseReference(query), searchVerses(query, null)])
    : [null, null];

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm text-neutral-500 hover:underline">
        ← Início
      </Link>

      <h1 className="mt-4 flex items-center gap-2 text-2xl font-bold">
        <span aria-hidden>🔍</span> Buscar na Bíblia
      </h1>

      <SearchForm initialQuery={query} />

      {/* Referência reconhecida: atalho direto para a passagem. */}
      {reference && (
        <Link
          href={`/compare/${reference.osis}/${reference.chapter}${reference.verse ? `?goto=${reference.verse}` : ''}`}
          className="mt-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 transition hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-900/15 dark:hover:bg-amber-900/25"
        >
          <span aria-hidden className="text-lg">📖</span>
          <span className="font-semibold">
            Ir para {reference.bookName} {reference.chapter}
            {reference.verse ? `:${reference.verse}` : ''}
          </span>
          <span aria-hidden className="ml-auto text-amber-700 dark:text-amber-400">→</span>
        </Link>
      )}

      {query && outcome && (
        <>
          <p className="mt-5 text-sm text-neutral-500 dark:text-neutral-400" aria-live="polite">
            {outcome.hits.length === 0
              ? 'Nenhum versículo encontrado.'
              : `${outcome.hits.length}${outcome.capped ? '+' : ''} resultado${outcome.hits.length === 1 ? '' : 's'} · ${outcome.translationName}`}
          </p>

          <ul className="mt-3 flex flex-col gap-2">
            {outcome.hits.map((h) => (
              <li key={`${h.osis}-${h.chapter}-${h.verse}`}>
                <Link
                  href={`/compare/${h.osis}/${h.chapter}?goto=${h.verse}`}
                  className="block rounded-xl border border-neutral-200 p-3 transition hover:border-amber-300 hover:bg-amber-50/40 dark:border-neutral-800 dark:hover:border-amber-800 dark:hover:bg-amber-900/10"
                >
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                    {h.bookName} {h.chapter}:{h.verse}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {markMatches(h.text, query)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          {outcome.capped && (
            <p className="mt-3 text-xs text-neutral-400">
              Mostrando os primeiros {outcome.hits.length}. Refine a busca para resultados mais precisos
              (aspas buscam a frase exata).
            </p>
          )}
        </>
      )}

      {!query && (
        <p className="mt-6 text-sm text-neutral-500 dark:text-neutral-400">
          Busque por palavras nas traduções (ex.: <em>justificados pela fé</em>) ou digite uma
          referência (ex.: <em>Rm 8:28</em>, <em>João 3</em>) para ir direto à passagem.
        </p>
      )}
    </main>
  );
}
