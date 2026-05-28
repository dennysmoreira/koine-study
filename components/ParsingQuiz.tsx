'use client';

import { useState, useTransition } from 'react';
import type { ParsingQuestion } from '@/lib/parsing';
import { submitAnswer, nextQuestion, type AnswerResult } from '@/app/parsing/actions';

export function ParsingQuiz({ first }: { first: ParsingQuestion }) {
  const [question, setQuestion] = useState<ParsingQuestion>(first);
  const [chosen, setChosen] = useState<string | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [answered, setAnswered] = useState(0);
  const [hits, setHits] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function answer(value: string) {
    if (pending || result) return;
    setError(null);
    setChosen(value);
    const q = question;
    startTransition(async () => {
      const res = await submitAnswer(q.tokenId, q.dimension, value);
      if (!res.ok) {
        setError(res.error ?? 'Erro ao registrar. Tente novamente.');
        setChosen(null);
        return;
      }
      setResult(res);
      setAnswered((n) => n + 1);
      if (res.correct) setHits((n) => n + 1);
    });
  }

  function advance() {
    if (pending) return;
    startTransition(async () => {
      const q = await nextQuestion();
      setQuestion(q);
      setChosen(null);
      setResult(null);
    });
  }

  function optionClass(value: string): string {
    const base = 'rounded-lg border px-3 py-3 text-sm font-medium transition active:scale-[0.98] disabled:opacity-60';
    if (!result) {
      return `${base} border-neutral-300 bg-white hover:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900`;
    }
    if (value === result.correctValue) {
      return `${base} border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300`;
    }
    if (value === chosen) {
      return `${base} border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300`;
    }
    return `${base} border-neutral-200 bg-white text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900`;
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-4 text-center text-xs text-neutral-400">
        Sessão: {hits}/{answered}
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center dark:border-neutral-800 dark:bg-neutral-900">
        <span className="font-greek text-4xl">{question.surface}</span>
        {question.gloss && <p className="mt-2 text-sm text-neutral-500">{question.gloss}</p>}

        <p className="mt-5 mb-2 text-xs uppercase tracking-wide text-neutral-400">{question.verseRef}</p>
        <p className="font-greek text-base leading-relaxed text-neutral-600 dark:text-neutral-300">
          {question.context.map((w, i) => (
            <span
              key={i}
              className={w.isTarget ? 'rounded bg-amber-200 px-1 font-semibold text-neutral-900 dark:bg-amber-500/30 dark:text-amber-100' : ''}
            >
              {w.surface}
              {i < question.context.length - 1 ? ' ' : ''}
            </span>
          ))}
        </p>
      </div>

      <p className="mt-6 mb-3 text-center text-base font-medium">{question.title}</p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {question.options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={pending || result !== null}
            onClick={() => answer(opt.value)}
            className={optionClass(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-3 text-center text-sm text-red-600 dark:text-red-400">{error}</p>}

      {result && (
        <div className="mt-5 flex flex-col items-center gap-3">
          <p className={`text-sm font-medium ${result.correct ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
            {result.correct ? 'Correto!' : `Resposta: ${result.correctLabel}`}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={advance}
            className="rounded-lg bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-neutral-900"
          >
            {pending ? 'Carregando…' : 'Próxima'}
          </button>
        </div>
      )}
    </div>
  );
}
