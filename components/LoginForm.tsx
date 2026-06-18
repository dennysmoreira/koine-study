'use client';
import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { signIn, signUp, requestPasswordReset, type AuthState } from '@/app/auth/actions';

const initialState: AuthState = {};

type Mode = 'signin' | 'signup' | 'reset';

const ACTIONS = { signin: signIn, signup: signUp, reset: requestPasswordReset } as const;
const SUBMIT_LABELS: Record<Mode, string> = {
  signin: 'Entrar',
  signup: 'Criar conta',
  reset: 'Enviar link de recuperação',
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-60 dark:bg-white dark:text-neutral-900"
    >
      {pending ? 'Aguarde…' : label}
    </button>
  );
}

// Subformulário por modo: cada modo tem o PRÓPRIO useFormState, então erros e
// mensagens de um modo não vazam para o outro ao alternar.
function AuthForm({
  mode,
  onModeChange,
  next,
}: {
  mode: Mode;
  onModeChange: (m: Mode) => void;
  next?: string | null;
}) {
  const [state, formAction] = useFormState(ACTIONS[mode], initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {/* Redireciona de volta ao ponto de origem apos entrar/criar conta (signin
          e signup). O modo 'reset' nao redireciona — segue o fluxo de e-mail. */}
      {next && mode !== 'reset' && <input type="hidden" name="next" value={next} />}
      {mode === 'reset' && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Informe o e-mail da sua conta e enviaremos um link para definir uma nova senha.
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-600 dark:text-neutral-400">E-mail</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className="rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900"
        />
      </label>

      {mode !== 'reset' && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-600 dark:text-neutral-400">Senha</span>
          <input
            type="password"
            name="password"
            required
            minLength={mode === 'signup' ? 8 : undefined}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-base outline-none focus:border-neutral-500 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
      )}

      {mode === 'signin' && (
        <button
          type="button"
          onClick={() => onModeChange('reset')}
          className="self-start text-sm text-neutral-500 underline-offset-2 transition hover:text-neutral-700 hover:underline dark:hover:text-neutral-300"
        >
          Esqueci minha senha
        </button>
      )}

      {state.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {state.message && <p className="text-sm text-emerald-600 dark:text-emerald-400">{state.message}</p>}

      <SubmitButton label={SUBMIT_LABELS[mode]} />

      {mode === 'reset' && (
        <button
          type="button"
          onClick={() => onModeChange('signin')}
          className="text-sm text-neutral-500 transition hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          ← Voltar ao login
        </button>
      )}
    </form>
  );
}

export function LoginForm({ next }: { next?: string | null }) {
  const [mode, setMode] = useState<Mode>('signin');

  return (
    <div className="w-full">
      {mode !== 'reset' && (
        <div className="mb-6 grid grid-cols-2 rounded-lg border border-neutral-200 p-1 text-sm dark:border-neutral-800">
          <button
            type="button"
            onClick={() => setMode('signin')}
            className={`rounded-md py-2 font-medium transition ${mode === 'signin' ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900' : 'text-neutral-500'}`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`rounded-md py-2 font-medium transition ${mode === 'signup' ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900' : 'text-neutral-500'}`}
          >
            Criar conta
          </button>
        </div>
      )}

      {mode === 'reset' && <h2 className="mb-4 text-base font-semibold">Recuperar senha</h2>}

      {/* key={mode} remonta o subformulário ao trocar de modo: estado de erro/
          mensagem e campos digitados não vazam de um modo para o outro. */}
      <AuthForm key={mode} mode={mode} onModeChange={setMode} next={next} />
    </div>
  );
}
