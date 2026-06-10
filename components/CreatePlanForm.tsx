'use client';

/**
 * Formulário de PLANO PERSONALIZADO (página de planos): nome + livros (agrupados
 * por testamento, com atalhos de seleção) + ritmo (capítulos/dia), com prévia ao
 * vivo de "X capítulos → Y dias". Submete via server action e navega ao plano
 * criado. Fica recolhido num botão para não pesar a página.
 */
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCustomPlan } from '@/app/reading/actions';

export interface PlanBookOption {
  osis: string;
  name: string;
  testament: string;
  chapters: number;
}

const TESTAMENT_LABELS: Record<string, string> = {
  OT: 'Antigo Testamento',
  NT: 'Novo Testamento',
};

export function CreatePlanForm({ books }: { books: PlanBookOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [perDay, setPerDay] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const byTestament = useMemo(() => {
    const map = new Map<string, PlanBookOption[]>();
    for (const b of books) {
      const list = map.get(b.testament) ?? [];
      list.push(b);
      map.set(b.testament, list);
    }
    return map;
  }, [books]);

  const totalChapters = useMemo(
    () => books.filter((b) => selected.has(b.osis)).reduce((sum, b) => sum + b.chapters, 0),
    [books, selected],
  );
  const totalDays = totalChapters > 0 ? Math.ceil(totalChapters / perDay) : 0;

  function toggleBook(osis: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(osis)) next.delete(osis);
      else next.add(osis);
      return next;
    });
  }

  // Atalho por testamento: seleciona todos; se todos já estão, desmarca todos.
  function toggleTestament(testament: string) {
    const group = byTestament.get(testament) ?? [];
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = group.every((b) => next.has(b.osis));
      for (const b of group) {
        if (allOn) next.delete(b.osis);
        else next.add(b.osis);
      }
      return next;
    });
  }

  function reset() {
    setOpen(false);
    setTitle('');
    setPerDay(1);
    setSelected(new Set());
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await createCustomPlan({ title, books: [...selected], perDay });
      if (res.ok && res.planId) {
        reset();
        router.push(`/reading/${res.planId}`);
      } else {
        setError(res.error ?? 'Falha ao criar o plano.');
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-dashed border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-600 transition hover:border-amber-400 hover:text-amber-700 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-amber-700 dark:hover:text-amber-400"
      >
        + Criar plano personalizado
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Novo plano</h2>
        <button
          type="button"
          onClick={reset}
          aria-label="Fechar"
          className="flex size-8 items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
        >
          ✕
        </button>
      </div>

      <label className="mt-3 flex flex-col gap-1 text-sm">
        <span className="text-neutral-600 dark:text-neutral-400">Nome do plano</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="Ex.: Cartas de Paulo em 30 dias"
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base outline-none focus:border-amber-500 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>

      <div className="mt-4">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">Livros</p>
        {[...byTestament.entries()].map(([testament, group]) => {
          const allOn = group.every((b) => selected.has(b.osis));
          return (
            <div key={testament} className="mt-2">
              <div className="flex items-center justify-between">
                <p id={`plan-group-${testament}`} className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  {TESTAMENT_LABELS[testament] ?? testament}
                </p>
                <button
                  type="button"
                  onClick={() => toggleTestament(testament)}
                  className="text-xs text-amber-700 transition hover:underline dark:text-amber-400"
                >
                  {allOn ? 'Desmarcar todos' : 'Selecionar todos'}
                </button>
              </div>
              <div role="group" aria-labelledby={`plan-group-${testament}`} className="mt-1.5 flex flex-wrap gap-1.5">
                {group.map((b) => {
                  const on = selected.has(b.osis);
                  return (
                    <button
                      key={b.osis}
                      type="button"
                      onClick={() => toggleBook(b.osis)}
                      aria-pressed={on}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
                        on
                          ? 'border-amber-400 bg-amber-50 font-medium text-amber-900 dark:border-amber-600 dark:bg-amber-900/30 dark:text-amber-100'
                          : 'border-neutral-200 text-neutral-600 hover:border-neutral-300 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-neutral-600'
                      }`}
                    >
                      {b.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm">
        <span className="text-neutral-600 dark:text-neutral-400">Capítulos por dia</span>
        <select
          value={perDay}
          onChange={(e) => setPerDay(Number(e.target.value))}
          className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      {/* Prévia ao vivo: mesma conta do servidor (ceil(capítulos / ritmo)). */}
      <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400" aria-live="polite">
        {totalChapters > 0
          ? `${totalChapters} capítulo${totalChapters === 1 ? '' : 's'} → ${totalDays} dia${totalDays === 1 ? '' : 's'} de leitura.`
          : 'Escolha os livros para ver a duração.'}
      </p>

      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending || selected.size === 0 || !title.trim()}
          className="min-h-[44px] rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-400 disabled:opacity-50"
        >
          {pending ? 'Criando…' : 'Criar plano'}
        </button>
        <button
          type="button"
          onClick={reset}
          className="min-h-[44px] rounded-lg px-3 py-2 text-sm text-neutral-500 transition hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
