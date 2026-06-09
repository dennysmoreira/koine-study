'use client';

/**
 * Botão de compartilhamento (estudo ou anotação). Gera/atualiza um snapshot
 * público congelado via server action e mostra o link + copiar + baixar PDF +
 * revogar. A URL absoluta é montada no cliente (window.location.origin), então
 * não dependemos de uma env de host.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { shareStudy, shareAnnotation, revokeShare } from '@/app/share/actions';

interface ShareButtonProps {
  kind: 'study' | 'annotation';
  id: number;
  initialToken?: string | null;
  // Estilo compacto (link de texto) para listas; padrão é botão com borda.
  compact?: boolean;
}

export function ShareButton({ kind, id, initialToken, compact }: ShareButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [token, setToken] = useState<string | null>(initialToken ?? null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = token ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${token}` : '';

  function share() {
    setError(null);
    startTransition(async () => {
      const res = kind === 'study' ? await shareStudy(id) : await shareAnnotation(id);
      if (res.ok && res.token) {
        setToken(res.token);
        setOpen(true);
      } else {
        setError(res.error ?? 'Falha ao compartilhar.');
      }
    });
  }

  function copy() {
    if (!url) return;
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => setError('Não foi possível copiar.'),
    );
  }

  function revoke() {
    if (!token) return;
    setError(null);
    startTransition(async () => {
      const res = await revokeShare(token);
      if (res.ok) {
        setToken(null);
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error ?? 'Falha ao revogar.');
      }
    });
  }

  const triggerClass = compact
    ? 'font-medium text-amber-600 transition hover:underline dark:text-amber-400'
    : 'rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800';

  // Estado fechado: um único gatilho. Se já há link, abre o painel; senão gera.
  if (!open) {
    return (
      <>
        <button
          type="button"
          onClick={() => (token ? setOpen(true) : share())}
          disabled={pending}
          className={`${triggerClass} disabled:opacity-60`}
        >
          {pending ? (
            'Compartilhando…'
          ) : (
            <>
              <span aria-hidden>🔗</span> {token ? 'Link' : 'Compartilhar'}
            </>
          )}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </>
    );
  }

  return (
    <div className="mt-2 w-full rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/60">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-medium text-neutral-500">Link público (somente leitura)</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Fechar"
          className="flex size-7 items-center justify-center rounded text-neutral-500 transition hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          ✕
        </button>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
        />
        <button
          type="button"
          onClick={copy}
          className="min-h-[44px] shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-amber-950 transition hover:bg-amber-400"
        >
          {copied ? 'Copiado!' : 'Copiar'}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        <a
          href={token ? `/share/${token}/pdf` : '#'}
          className="font-medium text-neutral-600 transition hover:underline dark:text-neutral-300"
        >
          <span aria-hidden>⬇️</span> Baixar PDF
        </a>
        <button
          type="button"
          onClick={share}
          disabled={pending}
          className="text-neutral-500 transition hover:text-neutral-700 disabled:opacity-50 dark:hover:text-neutral-300"
        >
          {pending ? 'Atualizando…' : 'Atualizar snapshot'}
        </button>
        <button
          type="button"
          onClick={revoke}
          disabled={pending}
          className="text-neutral-400 transition hover:text-red-600 disabled:opacity-50"
        >
          Revogar
        </button>
      </div>

      <p className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
        Quem tiver o link vê uma cópia congelada deste {kind === 'study' ? 'estudo' : 'anotação'}. Edições futuras só
        aparecem se você atualizar o snapshot.
      </p>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
