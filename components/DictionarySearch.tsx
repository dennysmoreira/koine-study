'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Input de busca do dicionário. Mantém o termo na URL (?q=) para que os
// resultados sejam renderizados no servidor; debounce evita navegar a cada tecla.
export function DictionarySearch({ initial }: { initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const first = useRef(true);

  useEffect(() => {
    // Não navega no mount (evita sobrescrever a URL inicial).
    if (first.current) {
      first.current = false;
      return;
    }
    const id = setTimeout(() => {
      const q = value.trim();
      router.replace(q ? `/dictionary?q=${encodeURIComponent(q)}` : '/dictionary');
    }, 300);
    return () => clearTimeout(id);
  }, [value, router]);

  return (
    <input
      type="search"
      inputMode="search"
      autoComplete="off"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="Buscar por grego, português ou Strong's…"
      className="w-full rounded-xl border border-neutral-300 bg-white px-4 py-3 text-base outline-none transition focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900"
    />
  );
}
