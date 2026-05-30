'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Book, Chapter, LexiconEntry, Token, Verse } from '@/lib/corpus';
import { glossLabel, parsingLabel, posLabel } from '@/lib/morph-labels';
import { phoneticPtBR, transliterate } from '@/lib/transliterate';
import { fetchLexicon } from '@/app/read/actions';

const TESTAMENT_LABELS: Record<string, string> = {
  NT: 'Novo Testamento',
  OT: 'Antigo Testamento',
};

// Rótulos legíveis por fonte de léxico (coluna `lexicon_entries.source`).
const LEXICON_LABELS: Record<string, string> = {
  lsj: 'LSJ (Liddell-Scott-Jones)',
  thayers: "Thayer's",
  moulton_milligan: 'Moulton-Milligan',
};

// Áudio via Web Speech API (nativa, sem dependência).
// - Se houver voz grega (`el-*`) instalada, fala o grego — fonética moderna
//   (iotacismo), diverge da transliteração erasmiana, mas é a leitura nativa.
// - Sem voz grega, falar grego com `lang='el-GR'` deixa o Chrome MUDO; então
//   caímos para a transliteração (latim) lida pela voz padrão, garantindo som.
function speak(surface: string, romanized: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;

  const run = () => {
    const voices = synth.getVoices();
    const greek = voices.find((v) => v.lang?.toLowerCase().startsWith('el'));
    const fallback = voices.find((v) => v.default) ?? voices[0];
    const voice = greek ?? fallback;
    // Com voz grega, fala o grego nativo. Sem ela, fala a romanização — e, se a
    // voz padrão for portuguesa, usa a respelagem fonética para corrigir g/c/s.
    let text = surface;
    if (!greek) {
      text = voice?.lang?.toLowerCase().startsWith('pt') ? phoneticPtBR(romanized) : romanized;
    }
    const utter = new SpeechSynthesisUtterance(text);
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    }
    utter.rate = 0.85;
    synth.cancel();
    synth.speak(utter);
  };

  // Vozes carregam de forma assíncrona; na 1ª chamada getVoices() pode vir vazio.
  if (synth.getVoices().length === 0) {
    synth.addEventListener('voiceschanged', run, { once: true });
  } else {
    run();
  }
}

function TokenChip({
  token,
  onSelect,
  active,
}: {
  token: Token;
  onSelect: (t: Token) => void;
  active: boolean;
}) {
  const gloss = glossLabel(token);
  return (
    <button
      type="button"
      onClick={() => onSelect(token)}
      className={`flex flex-col items-center rounded-md px-1.5 py-1 text-center transition ${
        active ? 'bg-amber-100 dark:bg-amber-900/40' : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
      }`}
    >
      <span className="font-greek text-xl leading-tight">{token.surface}</span>
      {gloss && (
        <span className="mt-0.5 max-w-[10ch] truncate text-[11px] leading-tight text-neutral-500">
          {gloss}
        </span>
      )}
    </button>
  );
}

function VerseBlock({
  verse,
  onSelect,
  activeKey,
  highlighted,
}: {
  verse: Verse;
  onSelect: (t: Token) => void;
  activeKey: string | null;
  highlighted: boolean;
}) {
  return (
    <div
      id={`v${verse.verse}`}
      className={`mb-4 scroll-mt-20 rounded-md transition-colors duration-500 ${
        highlighted ? 'bg-amber-50 dark:bg-amber-900/20' : ''
      }`}
    >
      <div className="flex flex-wrap items-start gap-x-1 gap-y-2">
        <span className="mt-1.5 select-none text-xs font-semibold text-neutral-400">
          {verse.verse}
        </span>
        {verse.tokens.map((token) => (
          <TokenChip
            key={token.position}
            token={token}
            onSelect={onSelect}
            active={activeKey === `${verse.verse}:${token.position}`}
          />
        ))}
      </div>
    </div>
  );
}

function TokenSheet({ token, onClose }: { token: Token; onClose: () => void }) {
  const gloss = glossLabel(token);
  const strongs = token.lemma?.strongs ?? null;
  const [lexicon, setLexicon] = useState<LexiconEntry[] | null>(null);
  const [lexLoading, setLexLoading] = useState(false);

  // Busca as entradas de léxico (LSJ etc.) sob demanda ao abrir o painel. Não
  // viajam no payload do capítulo (entradas grandes). `ignore` evita aplicar o
  // resultado de um token anterior caso o usuário troque de token rapidamente.
  useEffect(() => {
    if (!strongs) {
      setLexicon([]);
      return;
    }
    let ignore = false;
    setLexLoading(true);
    setLexicon(null);
    fetchLexicon(strongs)
      .then((entries) => {
        if (!ignore) setLexicon(entries);
      })
      .catch(() => {
        if (!ignore) setLexicon([]);
      })
      .finally(() => {
        if (!ignore) setLexLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [strongs]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative max-h-[70dvh] overflow-y-auto rounded-t-2xl bg-white p-5 pb-8 shadow-xl dark:bg-neutral-900">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-greek text-3xl">{token.surface}</span>
          {token.lemma?.strongs && (
            <span className="text-xs text-neutral-400">Strong {token.lemma.strongs}</span>
          )}
        </div>

        <div className="mt-1 flex items-center gap-2">
          <p className="text-base italic text-neutral-400" aria-label="Pronúncia">
            {transliterate(token.surface)}
          </p>
          <button
            type="button"
            onClick={() => speak(token.surface, transliterate(token.surface))}
            aria-label="Ouvir pronúncia"
            className="rounded-full p-1 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M13 4.06a1 1 0 0 0-1.6-.8L6.67 7H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.67l4.73 3.74A1 1 0 0 0 13 19.94zM16.5 8.5a1 1 0 0 1 1.41 0A4.98 4.98 0 0 1 19.5 12a4.98 4.98 0 0 1-1.59 3.5 1 1 0 1 1-1.32-1.5A2.98 2.98 0 0 0 17.5 12a2.98 2.98 0 0 0-.99-2 1 1 0 0 1-.01-1.5zM19.07 5.93a1 1 0 0 1 1.41 0A8.96 8.96 0 0 1 23 12a8.96 8.96 0 0 1-2.52 6.07 1 1 0 0 1-1.46-1.36A6.96 6.96 0 0 0 21 12a6.96 6.96 0 0 0-1.93-4.71 1 1 0 0 1 0-1.36z" />
            </svg>
          </button>
        </div>

        {token.lemma && (
          <p className="mt-2 text-sm text-neutral-500">
            Lema:{' '}
            <span className="font-greek text-base text-neutral-700 dark:text-neutral-200">
              {token.lemma.lemma}
            </span>
            <span className="ml-2 italic text-neutral-400">{transliterate(token.lemma.lemma)}</span>
          </p>
        )}

        {gloss && <p className="mt-3 text-lg font-medium">{gloss}</p>}

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-neutral-400">Classe</dt>
          <dd>{posLabel(token)}</dd>
          <dt className="text-neutral-400">Análise</dt>
          <dd>{parsingLabel(token)}</dd>
          {token.lemma?.gloss_en && token.lemma.gloss_en !== gloss && (
            <>
              <dt className="text-neutral-400">Glosa (EN)</dt>
              <dd className="text-neutral-500">{token.lemma.gloss_en}</dd>
            </>
          )}
        </dl>

        {token.lemma?.abbott_smith && (
          <section className="mt-5 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Abbott-Smith
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
              {token.lemma.abbott_smith}
            </p>
          </section>
        )}

        {lexLoading && (
          <p className="mt-5 border-t border-neutral-200 pt-4 text-sm text-neutral-400 dark:border-neutral-800">
            Carregando léxico…
          </p>
        )}

        {lexicon?.map((entry) => (
          <section
            key={entry.source}
            className="mt-5 border-t border-neutral-200 pt-4 dark:border-neutral-800"
          >
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
              {LEXICON_LABELS[entry.source] ?? entry.source.toUpperCase()}
            </h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
              {entry.text_pt ?? entry.text_en}
            </p>
            {entry.source === 'lsj' && (
              <p className="mt-2 text-[11px] text-neutral-400">
                LSJ via{' '}
                <a
                  href="https://github.com/STEPBible/STEPBible-Data"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  STEPBible
                </a>{' '}
                (CC BY 4.0)
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

// Navegador livro → capítulo → versículo. Trocar de livro/capítulo navega para
// outra rota (busca novo corpus no servidor); o versículo apenas rola a página
// atual, já que todos os versículos do capítulo já estão renderizados.
function NavSheet({
  books,
  current,
  chapter,
  chapters,
  verses,
  onClose,
  onVerse,
}: {
  books: Book[];
  current: Book;
  chapter: number;
  chapters: number[];
  verses: Verse[];
  onClose: () => void;
  onVerse: (verse: number) => void;
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
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative max-h-[80dvh] overflow-y-auto rounded-t-2xl bg-white p-5 pb-8 shadow-xl dark:bg-neutral-900">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />

        <label htmlFor="nav-book" className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Livro
        </label>
        <select
          id="nav-book"
          value={current.osis_code}
          onChange={(e) => router.push(`/read/${e.target.value}/1`)}
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
              href={`/read/${current.osis_code}/${n}`}
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

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-400">Versículo</p>
        <div className="mt-2 grid grid-cols-6 gap-2 sm:grid-cols-10">
          {verses.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onVerse(v.verse)}
              className="flex h-9 items-center justify-center rounded-md bg-neutral-100 text-sm transition hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700"
            >
              {v.verse}
            </button>
          ))}
        </div>

        <Link
          href={`/compare/${current.osis_code}/${chapter}`}
          onClick={onClose}
          className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-medium transition hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
        >
          <span aria-hidden>⚖️</span>
          Comparar versões deste capítulo
        </Link>
      </div>
    </div>
  );
}

export function Reader({ chapter, books }: { chapter: Chapter; books: Book[] }) {
  const { book, number, verses, chapters } = chapter;
  const [selected, setSelected] = useState<{ verse: number; token: Token } | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(null);

  const idx = chapters.indexOf(number);
  const prev = idx > 0 ? chapters[idx - 1] : null;
  const next = idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1] : null;
  const activeKey = selected ? `${selected.verse}:${selected.token.position}` : null;

  const goToVerse = (verse: number) => {
    setNavOpen(false);
    setHighlight(verse);
    requestAnimationFrame(() => {
      document.getElementById(`v${verse}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    window.setTimeout(() => setHighlight((cur) => (cur === verse ? null : cur)), 2000);
  };

  return (
    <div className="mx-auto w-full max-w-3xl">
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
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4 text-neutral-400"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <div className="flex gap-3 text-sm">
          {prev != null ? (
            <Link href={`/read/${book.osis_code}/${prev}`} className="text-neutral-500 hover:underline">
              ‹ {prev}
            </Link>
          ) : (
            <span className="text-neutral-300 dark:text-neutral-700">‹</span>
          )}
          {next != null ? (
            <Link href={`/read/${book.osis_code}/${next}`} className="text-neutral-500 hover:underline">
              {next} ›
            </Link>
          ) : (
            <span className="text-neutral-300 dark:text-neutral-700">›</span>
          )}
        </div>
      </header>

      <main className="px-4 py-5">
        {verses.map((verse) => (
          <VerseBlock
            key={verse.id}
            verse={verse}
            activeKey={activeKey}
            highlighted={highlight === verse.verse}
            onSelect={(token) => setSelected({ verse: verse.verse, token })}
          />
        ))}
        <Attributions />
      </main>

      {navOpen && (
        <NavSheet
          books={books}
          current={book}
          chapter={number}
          chapters={chapters}
          verses={verses}
          onClose={() => setNavOpen(false)}
          onVerse={goToVerse}
        />
      )}

      {selected && <TokenSheet token={selected.token} onClose={() => setSelected(null)} />}
    </div>
  );
}

// Atribuições de fonte: SBLGNT (texto) e MACULA Greek (dados linguísticos, CC BY 4.0)
// exigem crédito legal; léxicos Abbott-Smith/Dodson são de domínio público.
function Attributions() {
  return (
    <footer className="mt-10 border-t border-neutral-200 pt-4 text-xs leading-relaxed text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
      <p>
        Texto grego:{' '}
        <a
          href="https://sblgnt.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          SBLGNT
        </a>{' '}
        · Dados linguísticos:{' '}
        <a
          href="https://github.com/Clear-Bible/macula-greek"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          MACULA Greek
        </a>{' '}
        (
        <a
          href="https://creativecommons.org/licenses/by/4.0/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-neutral-600 dark:hover:text-neutral-300"
        >
          CC BY 4.0
        </a>
        ) · Léxico: Abbott-Smith e Dodson (domínio público)
      </p>
    </footer>
  );
}
