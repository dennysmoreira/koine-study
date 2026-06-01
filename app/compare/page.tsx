'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// O comparador é sempre escopado a um capítulo. A entrada `/compare` retoma o
// último livro/capítulo lido (gravado em localStorage pelo Comparator) — assim
// abrir "Ler" volta para onde o usuário parou. Sem memória válida, cai em João 1
// (texto clássico para iniciantes). Client-side porque localStorage só existe no
// navegador; o redirecionamento é imperceptível (replace, sem entrada no histórico).
const FALLBACK = '/compare/John/1';

export default function CompareIndexPage() {
  const router = useRouter();

  useEffect(() => {
    let target = FALLBACK;
    try {
      const raw = window.localStorage.getItem('koine:compare:last');
      if (raw) {
        const last = JSON.parse(raw) as { osis?: unknown; chapter?: unknown };
        if (typeof last.osis === 'string' && Number.isInteger(last.chapter)) {
          target = `/compare/${last.osis}/${last.chapter as number}`;
        }
      }
    } catch {
      // localStorage indisponível ou JSON corrompido — usa o fallback.
    }
    router.replace(target);
  }, [router]);

  return (
    <main className="flex min-h-dvh items-center justify-center text-sm text-neutral-400">
      Abrindo leitura…
    </main>
  );
}
