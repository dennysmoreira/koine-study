'use client';

/**
 * Item da lista de estudos: link para o workspace + menu de ações (Renomear /
 * Excluir). O renomear acontece inline (input no lugar do título); as mutações
 * são server actions e, ao concluir, router.refresh() recarrega o server
 * component para refletir o estado novo.
 */
import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { updateStudyTitle, deleteStudy } from '@/app/study/actions';

export interface StudyListItemData {
  id: number;
  title: string;
  icon: string;
  // Referência bíblica (livro + capítulo) quando houver — NÃO a categoria do modo.
  subtitle: string | null;
  dateLabel: string;
}

export function StudyListItem({ study }: { study: StudyListItemData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(study.title);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  // Fecha o menu ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const startRename = () => {
    setMenuOpen(false);
    setTitle(study.title);
    setError(null);
    setEditing(true);
  };

  const saveRename = () => {
    const clean = title.trim();
    if (!clean) {
      setError('Informe um título.');
      return;
    }
    if (clean === study.title) {
      setEditing(false);
      return;
    }
    startTransition(async () => {
      const res = await updateStudyTitle(study.id, clean);
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else setError(res.error ?? 'Falha ao renomear.');
    });
  };

  const remove = () => {
    setMenuOpen(false);
    if (!window.confirm(`Excluir "${study.title}"? Esta ação não pode ser desfeita.`)) return;
    startTransition(async () => {
      const res = await deleteStudy(study.id);
      if (res.ok) router.refresh();
      else setError(res.error ?? 'Falha ao excluir.');
    });
  };

  if (editing) {
    return (
      <li>
        <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-white p-4 dark:border-amber-700 dark:bg-neutral-900">
          <span aria-hidden className="text-2xl">
            {study.icon}
          </span>
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              saveRename();
            }}
          >
            <input
              ref={inputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(false);
              }}
              maxLength={120}
              aria-label="Novo título do estudo"
              className="min-w-0 flex-1 rounded-md border border-neutral-300 bg-white px-2 py-1 text-base text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
            <button
              type="submit"
              disabled={pending}
              className="shrink-0 rounded-md bg-amber-500 px-3 py-1 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
            >
              {pending ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="shrink-0 rounded-md px-3 py-1 text-sm text-neutral-500"
            >
              Cancelar
            </button>
          </form>
        </div>
        {error && <p className="mt-1 px-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
      </li>
    );
  }

  return (
    <li>
      <div className="relative flex items-center gap-2 rounded-xl border border-neutral-200 bg-white transition hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700">
        <Link
          href={`/studies/${study.id}`}
          className="flex min-w-0 flex-1 items-center gap-4 p-4 active:scale-[0.99]"
        >
          <span aria-hidden className="text-2xl">
            {study.icon}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-base font-medium">{study.title}</span>
            {study.subtitle && <span className="truncate text-sm text-neutral-500">{study.subtitle}</span>}
          </span>
          <span className="ml-auto shrink-0 text-xs text-neutral-400">{study.dateLabel}</span>
        </Link>

        <div ref={menuRef} className="relative shrink-0 pr-2">
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            disabled={pending}
            aria-label="Ações do estudo"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
              <path d="M10 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM10 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM11.5 15.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z" />
            </svg>
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-9 z-10 w-40 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
            >
              <button
                role="menuitem"
                type="button"
                onClick={startRename}
                className="block w-full px-3 py-2 text-left text-sm text-neutral-700 transition hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-700"
              >
                Renomear
              </button>
              <button
                role="menuitem"
                type="button"
                onClick={remove}
                className="block w-full px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
              >
                Excluir
              </button>
            </div>
          )}
        </div>
      </div>
      {error && <p className="mt-1 px-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </li>
  );
}
