'use client';

/**
 * Card "Continuar lendo" na home: lê o último capítulo aberto no comparador
 * (localStorage 'koine:compare:last', gravado pelo Comparator) e oferece um
 * atalho para retomar. Não renderiza nada se não houver leitura anterior.
 *
 * O nome PT do livro vem do servidor (bookNames) — o localStorage guarda só
 * osis + capítulo.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Last {
  osis: string;
  chapter: number;
  /** último versículo visível (opcional — gravações antigas não têm). */
  verse?: number;
}

export function ResumeReading({ bookNames }: { bookNames: Record<string, string> }) {
  const [last, setLast] = useState<Last | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('koine:compare:last');
      if (!raw) return;
      const p = JSON.parse(raw) as Partial<Last>;
      if (p && typeof p.osis === 'string' && Number.isInteger(p.chapter)) {
        setLast({
          osis: p.osis,
          chapter: p.chapter as number,
          verse: Number.isInteger(p.verse) && (p.verse as number) > 1 ? (p.verse as number) : undefined,
        });
      }
    } catch {
      /* localStorage indisponível / JSON inválido — sem retomada */
    }
  }, []);

  if (!last || !bookNames[last.osis]) return null;

  // ?goto rola até o versículo salvo e o realça (mecanismo já existente do leitor).
  const href = `/compare/${last.osis}/${last.chapter}${last.verse ? `?goto=${last.verse}` : ''}`;

  return (
    <Link
      href={href}
      className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 transition hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-900/15 dark:hover:bg-amber-900/25"
    >
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-lg dark:bg-amber-950"
      >
        📖
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
          Continuar lendo
        </p>
        <p className="truncate font-semibold">
          {bookNames[last.osis]} {last.chapter}
          {last.verse ? <span className="font-normal text-neutral-500 dark:text-neutral-400">:{last.verse}</span> : null}
        </p>
      </div>
      <span aria-hidden className="shrink-0 text-amber-700 dark:text-amber-400">
        →
      </span>
    </Link>
  );
}
