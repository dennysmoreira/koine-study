'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Book } from '@/lib/corpus';
import type { ParallelChapter, Translation } from '@/lib/translations';

const TESTAMENT_LABELS: Record<string, string> = {
  NT: 'Novo Testamento',
  OT: 'Antigo Testamento',
};

// Monta a URL do comparador preservando as versões selecionadas.
function compareHref(osis: string, chapter: number, codes: string[]): string {
  const q = codes.length > 0 ? `?v=${codes.join(',')}` : '';
  return `/compare/${osis}/${chapter}${q}`;
}

// Sheet de navegação: livro + capítulo. Trocar navega para outra rota (novo fetch
// no servidor), mantendo as versões selecionadas.
function NavSheet({
  books,
  current,
  chapter,
  chapters,
  codes,
  onClose,
}: {
  books: Book[];
  current: Book;
  chapter: number;
  chapters: number[];
  codes: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const groups = new Map<string, Book[]>();
  for (const b of books) {
    const list = groups.get(b.testament) ?? [];
    list.push(b);
    groups.set(b.testament, list);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative max-h-[80dvh] overflow-y-auto rounded-t-2xl bg-white p-5 pb-8 shadow-xl dark:bg-neutral-900">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />

        <label htmlFor="cmp-book" className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Livro
        </label>
        <select
          id="cmp-book"
          value={current.osis_code}
          onChange={(e) => router.push(compareHref(e.target.value, 1, codes))}
          className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
        >
          {[...groups.entries()].map(([testament, list]) => (
            <optgroup key={testament} label={TESTAMENT_LABELS[testament] ?? testament}>
              {list.map((b) => (
                <option key={b.id} value={b.osis_code}>
                  {b.name_pt}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-400">Capítulo</p>
        <div className="mt-2 grid grid-cols-6 gap-2 sm:grid-cols-10">
          {chapters.map((n) => (
            <Link
              key={n}
              href={compareHref(current.osis_code, n, codes)}
              onClick={onClose}
              className={`flex h-9 items-center justify-center rounded-md text-sm transition ${
                n === chapter
                  ? 'bg-amber-100 font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100'
                  : 'bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700'
              }`}
            >
              {n}
            </Link>
          ))}
        </div>

        <Link
          href={`/read/${current.osis_code}/${chapter}`}
          onClick={onClose}
          className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium transition hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
        >
          <span aria-hidden>📜</span>
          Ler interlinear deste capítulo
        </Link>
      </div>
    </div>
  );
}

// Sheet de seleção de versões. Pelo menos uma versão deve permanecer ativa.
function VersionSheet({
  all,
  selected,
  osis,
  chapter,
  onClose,
}: {
  all: Translation[];
  selected: string[];
  osis: string;
  chapter: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const selectedSet = new Set(selected);

  const toggle = (code: string) => {
    const next = new Set(selectedSet);
    if (next.has(code)) {
      if (next.size === 1) return; // mantém ao menos uma versão
      next.delete(code);
    } else {
      next.add(code);
    }
    // preserva a ordem do catálogo (sort_order) ao reconstruir os códigos
    const codes = all.filter((t) => next.has(t.code)).map((t) => t.code);
    router.push(compareHref(osis, chapter, codes));
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative max-h-[70dvh] overflow-y-auto rounded-t-2xl bg-white p-5 pb-8 shadow-xl dark:bg-neutral-900">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Versões</h2>
        <div className="mt-3 flex flex-col gap-2">
          {all.map((t) => {
            const on = selectedSet.has(t.code);
            return (
              <button
                key={t.code}
                type="button"
                onClick={() => toggle(t.code)}
                className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${
                  on
                    ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20'
                    : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700'
                }`}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{t.name}</span>
                  <span className="truncate text-xs text-neutral-400">
                    {t.language.toUpperCase()} · {t.license}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                    on
                      ? 'border-amber-500 bg-amber-500 text-white'
                      : 'border-neutral-300 text-transparent dark:border-neutral-600'
                  }`}
                >
                  ✓
                </span>
              </button>
            );
          })}
        </div>
        {all.length <= 1 && (
          <p className="mt-4 text-xs leading-relaxed text-neutral-400">
            Só o texto grego original está disponível por enquanto. Novas versões aparecerão
            aqui automaticamente quando forem licenciadas.
          </p>
        )}
      </div>
    </div>
  );
}

export function Comparator({
  chapter,
  books,
  allTranslations,
}: {
  chapter: ParallelChapter;
  books: Book[];
  allTranslations: Translation[];
}) {
  const { book, number, chapters, translations, rows } = chapter;
  const [navOpen, setNavOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);

  const codes = translations.map((t) => t.code);
  const idx = chapters.indexOf(number);
  const prev = idx > 0 ? chapters[idx - 1] : null;
  const next = idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1] : null;

  // colunas dinâmicas: estilo inline (o JIT do Tailwind não gera grid-cols-N
  // arbitrário). Só vale no breakpoint `sm` (sm:grid); no mobile empilha.
  const gridStyle = { gridTemplateColumns: `repeat(${translations.length}, minmax(0, 1fr))` };
  const isGreek = (code: string) => translations.find((t) => t.code === code)?.is_original ?? false;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50/90 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← Início
        </Link>
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          className="flex items-center gap-1 text-sm font-semibold transition hover:text-neutral-600 dark:hover:text-neutral-300"
          aria-label="Selecionar livro e capítulo"
        >
          {book.name_pt} {number}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-neutral-400" aria-hidden="true">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z" clipRule="evenodd" />
          </svg>
        </button>
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => setVersionsOpen(true)}
            className="rounded-md px-2 py-1 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            aria-label="Escolher versões"
          >
            Versões ({translations.length})
          </button>
          {prev != null ? (
            <Link href={compareHref(book.osis_code, prev, codes)} className="text-neutral-500 hover:underline">
              ‹ {prev}
            </Link>
          ) : (
            <span className="text-neutral-300 dark:text-neutral-700">‹</span>
          )}
          {next != null ? (
            <Link href={compareHref(book.osis_code, next, codes)} className="text-neutral-500 hover:underline">
              {next} ›
            </Link>
          ) : (
            <span className="text-neutral-300 dark:text-neutral-700">›</span>
          )}
        </div>
      </header>

      <main className="px-4 py-5">
        {/* Cabeçalho de colunas (só desktop): nomes das versões alinhados às colunas. */}
        <div className="mb-2 hidden sm:grid sm:gap-4" style={gridStyle}>
          {translations.map((t) => (
            <div key={t.code} className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              {t.name}
            </div>
          ))}
        </div>

        <div className="flex flex-col">
          {rows.map((row) => (
            <div
              key={row.verse}
              className="border-b border-neutral-100 py-3 last:border-0 dark:border-neutral-800/60 sm:grid sm:gap-4"
              style={gridStyle}
            >
              {translations.map((t) => {
                const text = row.texts[t.code] ?? null;
                return (
                  <div key={t.code} className="mb-2 last:mb-0 sm:mb-0">
                    {/* Rótulo da versão por bloco (só mobile, pois empilha). */}
                    <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400 sm:hidden">
                      {t.name}
                    </span>
                    <p className="flex gap-1.5 text-[15px] leading-relaxed">
                      <span className="mt-0.5 select-none text-xs font-semibold text-neutral-400">
                        {row.verse}
                      </span>
                      {text ? (
                        <span className={isGreek(t.code) ? 'font-greek' : ''}>{text}</span>
                      ) : (
                        <span className="text-neutral-300 dark:text-neutral-600">—</span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <Attributions translations={translations} />
      </main>

      {navOpen && (
        <NavSheet
          books={books}
          current={book}
          chapter={number}
          chapters={chapters}
          codes={codes}
          onClose={() => setNavOpen(false)}
        />
      )}

      {versionsOpen && (
        <VersionSheet
          all={allTranslations}
          selected={codes}
          osis={book.osis_code}
          chapter={number}
          onClose={() => setVersionsOpen(false)}
        />
      )}
    </div>
  );
}

// Atribuições das versões exibidas. Cada tradução credita nome, licença e fonte —
// requisito das licenças abertas (CC BY) e boa prática para as demais.
function Attributions({ translations }: { translations: Translation[] }) {
  return (
    <footer className="mt-10 border-t border-neutral-200 pt-4 text-xs leading-relaxed text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
      {translations.map((t) => (
        <p key={t.code}>
          <span className="font-medium">{t.name}</span> — {t.license}
          {t.source_url && (
            <>
              {' · '}
              <a
                href={t.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                fonte
              </a>
            </>
          )}
        </p>
      ))}
    </footer>
  );
}
