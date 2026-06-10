'use client';

/**
 * Campo de busca da página /search: a consulta vive na URL (?q=) — o server
 * component busca e renderiza; voltar/compartilhar preservam a pesquisa.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SearchForm({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  }

  return (
    <form onSubmit={submit} className="mt-4 flex gap-2">
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder='Palavras ("pão da vida") ou referência (Rm 8:28)…'
        autoFocus={!initialQuery}
        enterKeyHint="search"
        aria-label="Buscar na Bíblia"
        className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base outline-none focus:border-amber-500 dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button
        type="submit"
        className="min-h-[44px] shrink-0 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-400"
      >
        Buscar
      </button>
    </form>
  );
}
