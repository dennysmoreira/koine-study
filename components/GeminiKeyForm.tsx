'use client';

/**
 * Formulário BYOK: cadastra/remove a chave da API do Gemini do usuário. A chave
 * só trafega no submit (server action) e é gravada cifrada; o cliente nunca a lê
 * de volta — só sabe se EXISTE uma (prop `hasKey`).
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveGeminiKey, removeGeminiKey } from '@/app/settings/actions';

export function GeminiKeyForm({ hasKey }: { hasKey: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(!hasKey);

  function save() {
    if (!key.trim()) {
      setError('Cole sua chave do Gemini.');
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await saveGeminiKey(key);
      if (res.ok) {
        setKey('');
        setEditing(false);
        router.refresh();
      } else setError(res.error ?? 'Falha ao salvar.');
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await removeGeminiKey();
      if (res.ok) {
        setEditing(true);
        router.refresh();
      } else setError(res.error ?? 'Falha ao remover.');
    });
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-medium">Sua chave do Gemini</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            hasKey
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
          }`}
        >
          {hasKey ? 'configurada' : 'não configurada'}
        </span>
      </div>

      <p className="mb-3 text-sm text-neutral-500">
        Com sua própria chave, o estudo com IA usa a sua cota gratuita do Google — sem limite
        compartilhado. A chave é guardada criptografada e nunca é exibida de volta.
      </p>

      {editing ? (
        <div className="space-y-2">
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="AIza…"
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
            >
              {pending ? 'Salvando…' : 'Salvar chave'}
            </button>
            {hasKey && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setKey('');
                  setError(null);
                }}
                className="rounded-md px-4 py-2 text-sm text-neutral-500"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Trocar chave
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-neutral-700 dark:hover:bg-red-950/30"
          >
            {pending ? 'Removendo…' : 'Remover'}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <ol className="mt-4 space-y-1 border-t border-neutral-200 pt-3 text-xs text-neutral-500 dark:border-neutral-800">
        <li>
          1. Abra{' '}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-amber-600 hover:underline dark:text-amber-400"
          >
            aistudio.google.com/apikey
          </a>{' '}
          e entre com sua conta Google.
        </li>
        <li>2. Clique em &ldquo;Create API key&rdquo; (não precisa cartão de crédito).</li>
        <li>3. Copie a chave (começa com &ldquo;AIza&rdquo;) e cole acima.</li>
      </ol>
    </div>
  );
}
