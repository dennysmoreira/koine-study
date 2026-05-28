'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Chapter, Token, Verse } from '@/lib/corpus';
import { glossLabel, parsingLabel, posLabel } from '@/lib/morph-labels';

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
}: {
  verse: Verse;
  onSelect: (t: Token) => void;
  activeKey: string | null;
}) {
  return (
    <div className="mb-4">
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

        {token.lemma && (
          <p className="mt-2 text-sm text-neutral-500">
            Lema: <span className="font-greek text-base text-neutral-700 dark:text-neutral-200">{token.lemma.lemma}</span>
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
      </div>
    </div>
  );
}

export function Reader({ chapter }: { chapter: Chapter }) {
  const { book, number, verses, chapters } = chapter;
  const [selected, setSelected] = useState<{ verse: number; token: Token } | null>(null);

  const idx = chapters.indexOf(number);
  const prev = idx > 0 ? chapters[idx - 1] : null;
  const next = idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1] : null;
  const activeKey = selected ? `${selected.verse}:${selected.token.position}` : null;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50/90 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          ← Início
        </Link>
        <h1 className="text-sm font-semibold">
          {book.name_pt} {number}
        </h1>
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
            onSelect={(token) => setSelected({ verse: verse.verse, token })}
          />
        ))}
      </main>

      {selected && <TokenSheet token={selected.token} onClose={() => setSelected(null)} />}
    </div>
  );
}
