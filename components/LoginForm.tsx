'use client';
import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { signIn, signUp, type AuthState } from '@/app/auth/actions';

const initialState: AuthState = {};

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

export function LoginForm() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const action = mode === 'signin' ? signIn : signUp;
  const [state, formAction] = useFormState(action, initialState);

  return (
    <div className="w-full">
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

      <form action={formAction} className="flex flex-col gap-3">
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

        {state.error && (
          <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
        )}
        {state.message && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">{state.message}</p>
        )}

        <SubmitButton label={mode === 'signin' ? 'Entrar' : 'Criar conta'} />
      </form>
    </div>
  );
}
