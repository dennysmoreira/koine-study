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
    let path = FALLBACK;
    const params = new URLSearchParams();
    try {
      const raw = window.localStorage.getItem('koine:compare:last');
      if (raw) {
        const last = JSON.parse(raw) as { osis?: unknown; chapter?: unknown; verse?: unknown };
        if (typeof last.osis === 'string' && Number.isInteger(last.chapter)) {
          path = `/compare/${last.osis}/${last.chapter as number}`;
          // Retomada exata: rola até o último versículo visível (mecanismo ?goto).
          if (Number.isInteger(last.verse) && (last.verse as number) > 1) {
            params.set('goto', String(last.verse));
          }
        }
      }
      // Versões preferidas: retoma a última seleção (evita o flash de cair no padrão
      // do servidor e o redirect extra que o Comparator faria sem ?v).
      const v = JSON.parse(window.localStorage.getItem('koine:compare:versions') ?? 'null') as unknown;
      if (Array.isArray(v)) {
        const codes = v.filter((c): c is string => typeof c === 'string');
        if (codes.length > 0) params.set('v', codes.join(','));
      }
    } catch {
      // localStorage indisponível ou JSON corrompido — usa o fallback.
    }
    const query = params.toString();
    router.replace(query ? `${path}?${query}` : path);
  }, [router]);

  return (
    <main className="flex min-h-dvh items-center justify-center text-sm text-neutral-400">
      Abrindo leitura…
    </main>
  );
}
