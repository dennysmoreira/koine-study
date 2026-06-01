import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '@/app/auth/actions';

// Mostra o usuário logado + botão Sair, ou um link Entrar. Server component:
// lê a sessão por cookie e dispara signOut via Server Action.
export async function AccountBadge() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium transition active:scale-[0.98] hover:border-neutral-400 dark:border-neutral-700 dark:hover:border-neutral-600"
      >
        Entrar
      </Link>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className="hidden min-w-0 truncate text-sm text-neutral-500 sm:block sm:max-w-[12rem]"
        title={user.email ?? ''}
      >
        {user.email}
      </span>
      <Link
        href="/settings"
        className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium transition active:scale-[0.98] hover:border-neutral-400 dark:border-neutral-700 dark:hover:border-neutral-600"
      >
        Config
      </Link>
      <form action={signOut}>
        <button
          type="submit"
          className="shrink-0 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium transition active:scale-[0.98] hover:border-neutral-400 dark:border-neutral-700 dark:hover:border-neutral-600"
        >
          Sair
        </button>
      </form>
    </div>
  );
}
