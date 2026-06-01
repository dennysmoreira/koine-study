'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Book, Token } from '@/lib/corpus';
import type { ChapterView, ChapterViewRow } from '@/lib/chapter-view';
import type { Translation } from '@/lib/translations';
import { GreekVerse } from './greek/GreekVerse';
import { TokenSheet } from './greek/TokenSheet';
import { StudyModal } from './StudyModal';

const TESTAMENT_LABELS: Record<string, string> = {
  NT: 'Novo Testamento',
  OT: 'Antigo Testamento',
};

// Fecha um sheet/modal ao pressionar Escape. `aria-modal` promete que o fundo é
// inerte; o Escape entrega a saída por teclado esperada de um diálogo.
function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
}

// Monta a URL do comparador preservando as versões selecionadas.
function compareHref(osis: string, chapter: number, codes: string[]): string {
  const q = codes.length > 0 ? `?v=${codes.join(',')}` : '';
  return `/compare/${osis}/${chapter}${q}`;
}

// Sheet de navegação: livro + capítulo + versículo. Trocar de livro/capítulo
// navega para outra rota (novo fetch no servidor), mantendo as versões
// selecionadas; o versículo apenas rola a página atual, já renderizada.
function NavSheet({
  books,
  current,
  chapter,
  chapters,
  rows,
  codes,
  onClose,
  onVerse,
}: {
  books: Book[];
  current: Book;
  chapter: number;
  chapters: number[];
  rows: ChapterViewRow[];
  codes: string[];
  onClose: () => void;
  onVerse: (verse: number) => void;
}) {
  const router = useRouter();
  useEscapeToClose(onClose);
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

        {rows.length > 0 && (
          <>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-400">Versículo</p>
            <div className="mt-2 grid grid-cols-6 gap-2 sm:grid-cols-10">
              {rows.map((r) => (
                <button
                  key={r.verse}
                  type="button"
                  onClick={() => onVerse(r.verse)}
                  className="flex h-9 items-center justify-center rounded-md bg-neutral-100 text-sm transition hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
                >
                  {r.verse}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Linha de versão no seletor: rótulo, sublinha e estado de marcação.
function VersionRow({
  on,
  title,
  subtitle,
  onClick,
}: {
  on: boolean;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${
        on
          ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20'
          : 'border-neutral-200 hover:border-neutral-300 dark:border-neutral-800 dark:hover:border-neutral-700'
      }`}
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{title}</span>
        <span className="truncate text-xs text-neutral-400">{subtitle}</span>
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
  useEscapeToClose(onClose);
  const selectedSet = new Set(selected);

  // As duas linhas is_original (grego e hebraico) são UMA opção lógica no
  // seletor — "Texto Original". O servidor já troca grego↔hebraico conforme o
  // testamento do livro, então aqui basta um código representante (o de menor
  // sort_order) ao ligar; ao desligar, removemos qualquer original.
  const originals = all.filter((t) => t.is_original);
  const others = all.filter((t) => !t.is_original);
  const originalCodeSet = new Set(originals.map((t) => t.code));
  const repOriginalCode = originals[0]?.code ?? null;
  const anyOriginalOn = selected.some((c) => originalCodeSet.has(c));

  // preserva a ordem do catálogo (sort_order) ao reconstruir os códigos
  const orderByCatalog = (codes: string[]) => {
    const set = new Set(codes);
    return all.filter((t) => set.has(t.code)).map((t) => t.code);
  };

  const push = (codes: string[]) => router.push(compareHref(osis, chapter, orderByCatalog(codes)));

  const toggleOriginal = () => {
    if (anyOriginalOn) {
      const remaining = selected.filter((c) => !originalCodeSet.has(c));
      if (remaining.length === 0) return; // mantém ao menos uma versão
      push(remaining);
    } else if (repOriginalCode) {
      push([...selected, repOriginalCode]);
    }
  };

  const toggleOther = (code: string) => {
    const next = new Set(selectedSet);
    if (next.has(code)) {
      if (next.size === 1) return; // mantém ao menos uma versão
      next.delete(code);
    } else {
      next.add(code);
    }
    push([...next]);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative max-h-[70dvh] overflow-y-auto rounded-t-2xl bg-white p-5 pb-8 shadow-xl dark:bg-neutral-900">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Versões</h2>
        <div className="mt-3 flex flex-col gap-2">
          {originals.length > 0 && (
            <VersionRow
              on={anyOriginalOn}
              title="Texto Original"
              subtitle="Grego (NT) · Hebraico (AT)"
              onClick={toggleOriginal}
            />
          )}
          {others.map((t) => (
            <VersionRow
              key={t.code}
              on={selectedSet.has(t.code)}
              title={t.name}
              subtitle={`${t.language.toUpperCase()} · ${t.license}`}
              onClick={() => toggleOther(t.code)}
            />
          ))}
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
  chapter: ChapterView;
  books: Book[];
  allTranslations: Translation[];
}) {
  const { book, number, chapters, translations, rows } = chapter;
  const [navOpen, setNavOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [studyOpen, setStudyOpen] = useState(false);
  // Token grego selecionado (abre o TokenSheet com os dados linguísticos).
  const [selected, setSelected] = useState<{ verse: number; token: Token } | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  const highlightTimer = useRef<number | null>(null);

  // Limpa o timer do realce ao desmontar, evitando setState após unmount.
  useEffect(() => () => {
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
  }, []);

  const codes = translations.map((t) => t.code);
  const original = translations.find((t) => t.is_original) ?? null;
  const originalCode = original?.code ?? null;
  // Língua da coluna original define o tratamento tipográfico: grego (LTR,
  // font-greek) ou hebraico (RTL, font-hebrew). É uma só coluna lógica que muda
  // conforme o testamento do livro.
  const originalIsHebrew = original?.language === 'hbo';
  const idx = chapters.indexOf(number);
  const prev = idx > 0 ? chapters[idx - 1] : null;
  const next = idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1] : null;

  // colunas dinâmicas: estilo inline (o JIT do Tailwind não gera grid-cols-N
  // arbitrário). Só vale no breakpoint `sm` (sm:grid); no mobile empilha.
  const gridStyle = { gridTemplateColumns: `repeat(${translations.length}, minmax(0, 1fr))` };

  const goToVerse = (verse: number) => {
    setNavOpen(false);
    setHighlight(verse);
    requestAnimationFrame(() => {
      document.getElementById(`v${verse}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(
      () => setHighlight((cur) => (cur === verse ? null : cur)),
      2000,
    );
  };

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
          aria-label="Selecionar livro, capítulo e versículo"
        >
          {book.name_pt} {number}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-neutral-400" aria-hidden="true">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z" clipRule="evenodd" />
          </svg>
        </button>
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => setStudyOpen(true)}
            className="rounded-md px-2 py-1 font-medium text-amber-600 transition hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/30"
            aria-label="Estudo com IA"
          >
            ✨ Estudo
          </button>
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
          {rows.map((row) => {
            const activePosition = selected?.verse === row.verse ? selected.token.position : null;
            return (
              <div
                key={row.verse}
                id={`v${row.verse}`}
                className={`scroll-mt-20 rounded-md border-b border-neutral-100 py-3 transition-colors duration-500 last:border-0 dark:border-neutral-800/60 sm:grid sm:gap-4 ${
                  highlight === row.verse ? 'bg-amber-50 dark:bg-amber-900/20' : ''
                }`}
                style={gridStyle}
              >
                {translations.map((t) => {
                  const isOriginal = t.code === originalCode;
                  const text = row.texts[t.code] ?? null;
                  // Coluna original: tokens gregos clicáveis (interlinear). Cai
                  // para o texto plano se faltarem tokens naquele versículo.
                  const originalTokens = isOriginal ? row.tokens : null;
                  const showTokens = originalTokens != null && originalTokens.length > 0;
                  return (
                    <div key={t.code} className="mb-2 last:mb-0 sm:mb-0">
                      {/* Rótulo da versão por bloco (só mobile, pois empilha). */}
                      <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-400 sm:hidden">
                        {t.name}
                      </span>
                      <p className="flex items-start gap-1.5 text-[15px] leading-relaxed">
                        <span className="mt-0.5 select-none text-xs font-semibold text-neutral-400">
                          {row.verse}
                        </span>
                        {showTokens ? (
                          <GreekVerse
                            tokens={originalTokens}
                            activePosition={activePosition}
                            onSelect={(token) => setSelected({ verse: row.verse, token })}
                          />
                        ) : text ? (
                          <span
                            dir={isOriginal && originalIsHebrew ? 'rtl' : undefined}
                            className={
                              isOriginal
                                ? originalIsHebrew
                                  ? 'font-hebrew text-[17px] leading-loose'
                                  : 'font-greek'
                                : ''
                            }
                          >
                            {text}
                          </span>
                        ) : (
                          <span className="text-neutral-300 dark:text-neutral-600">—</span>
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <Attributions translations={translations} />
      </main>

      {navOpen && (
        <NavSheet
          books={books}
          current={book}
          chapter={number}
          chapters={chapters}
          rows={rows}
          codes={codes}
          onClose={() => setNavOpen(false)}
          onVerse={goToVerse}
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

      {studyOpen && (
        <StudyModal
          osis={book.osis_code}
          chapter={number}
          codes={codes}
          bookName={book.name_pt}
          onClose={() => setStudyOpen(false)}
        />
      )}

      {selected && <TokenSheet token={selected.token} onClose={() => setSelected(null)} />}
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
