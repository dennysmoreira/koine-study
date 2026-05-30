'use client';

import { useEffect, useState } from 'react';
import { makeQuestion, type AlphabetQuestion } from '@/lib/alphabet';

const ROUNDS = 10;
const BEST_KEY = 'koine.alphabet.best';

type Phase = 'intro' | 'playing' | 'done';

function buildRound(): AlphabetQuestion {
  return makeQuestion(undefined, 4);
}

function stars(score: number): number {
  const pct = score / ROUNDS;
  if (pct >= 0.9) return 3;
  if (pct >= 0.7) return 2;
  if (pct >= 0.5) return 1;
  return 0;
}

export function AlphabetGame() {
  const [phase, setPhase] = useState<Phase>('intro');
  const [question, setQuestion] = useState<AlphabetQuestion>(() => buildRound());
  const [round, setRound] = useState(1);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [best, setBest] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(BEST_KEY);
      if (raw !== null) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) setBest(parsed);
      }
    } catch {
      // localStorage indisponível (modo privado/quota) — segue sem recorde
    }
  }, []);

  const answered = chosen !== null;
  const isCorrect = answered && chosen === question.answer;

  function start() {
    setQuestion(buildRound());
    setRound(1);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setChosen(null);
    setPhase('playing');
  }

  function answer(value: string) {
    if (answered) return;
    setChosen(value);
    if (value === question.answer) {
      // `streak` é o valor anterior à resposta: cada rodada é respondida uma vez.
      const nextStreak = streak + 1;
      setScore((n) => n + 1);
      setStreak(nextStreak);
      setBestStreak((b) => Math.max(b, nextStreak));
    } else {
      setStreak(0);
    }
  }

  function advance() {
    if (round >= ROUNDS) {
      const nextBest = best === null ? score : Math.max(best, score);
      try {
        window.localStorage.setItem(BEST_KEY, String(nextBest));
      } catch {
        // localStorage indisponível — mantém o recorde apenas em memória
      }
      setBest(nextBest);
      setPhase('done');
      return;
    }
    setRound((r) => r + 1);
    setQuestion(buildRound());
    setChosen(null);
  }

  function optionClass(value: string): string {
    const base =
      'rounded-lg border px-3 py-3 text-sm font-medium transition active:scale-[0.98] disabled:cursor-default';
    if (!answered) {
      return `${base} border-neutral-300 bg-white hover:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900`;
    }
    if (value === question.answer) {
      return `${base} border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300`;
    }
    if (value === chosen) {
      return `${base} border-red-500 bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300`;
    }
    return `${base} border-neutral-200 bg-white text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900`;
  }

  if (phase === 'intro') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <span className="font-greek text-6xl">Α α</span>
        <h2 className="mt-6 text-xl font-semibold">Alfabeto grego</h2>
        <p className="mt-2 max-w-sm text-sm text-neutral-500">
          {ROUNDS} rodadas. Veja a letra e escolha o nome ou o som certo. Acerte em sequência para
          aumentar a ofensiva.
        </p>
        {best !== null && (
          <p className="mt-4 text-xs text-neutral-400">
            Melhor recorde: {best}/{ROUNDS}
          </p>
        )}
        <button
          type="button"
          onClick={start}
          className="mt-6 rounded-lg bg-neutral-900 px-8 py-2.5 text-sm font-medium text-white transition active:scale-[0.98] dark:bg-white dark:text-neutral-900"
        >
          Começar
        </button>
      </div>
    );
  }

  if (phase === 'done') {
    const earned = stars(score);
    const pct = Math.round((score / ROUNDS) * 100);
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="text-3xl" aria-label={`${earned} de 3 estrelas`}>
          {'★'.repeat(earned)}
          <span className="text-neutral-300 dark:text-neutral-700">{'★'.repeat(3 - earned)}</span>
        </div>
        <h2 className="mt-6 text-xl font-semibold">
          {score}/{ROUNDS} acertos
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          {pct}% de acerto · maior ofensiva: {bestStreak}
        </p>
        {best !== null && (
          <p className="mt-3 text-xs text-neutral-400">
            Melhor recorde: {best}/{ROUNDS}
          </p>
        )}
        <button
          type="button"
          onClick={start}
          className="mt-6 rounded-lg bg-neutral-900 px-8 py-2.5 text-sm font-medium text-white transition active:scale-[0.98] dark:bg-white dark:text-neutral-900"
        >
          Jogar de novo
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-4 flex items-center justify-between text-xs text-neutral-400">
        <span>
          Rodada {round}/{ROUNDS}
        </span>
        <span>
          Acertos: {score} · Ofensiva: {streak}
          {streak >= 3 ? ' 🔥' : ''}
        </span>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center dark:border-neutral-800 dark:bg-neutral-900">
        <div className="font-greek text-7xl leading-none">{question.letter.lower}</div>
        <div className="mt-2 font-greek text-2xl text-neutral-400">{question.letter.upper}</div>
      </div>

      <p className="mt-6 mb-3 text-center text-base font-medium">{question.prompt}</p>

      <div className="grid grid-cols-2 gap-2">
        {question.options.map((opt) => (
          <button
            key={opt}
            type="button"
            disabled={answered}
            onClick={() => answer(opt)}
            className={optionClass(opt)}
          >
            {opt}
          </button>
        ))}
      </div>

      {answered && (
        <div className="mt-5 flex flex-col items-center gap-3">
          <p
            className={`text-sm font-medium ${
              isCorrect ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            }`}
          >
            {isCorrect ? 'Correto!' : `Resposta: ${question.answer}`}
          </p>
          <button
            type="button"
            onClick={advance}
            className="rounded-lg bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white transition active:scale-[0.98] dark:bg-white dark:text-neutral-900"
          >
            {round >= ROUNDS ? 'Ver resultado' : 'Próxima'}
          </button>
        </div>
      )}
    </div>
  );
}
