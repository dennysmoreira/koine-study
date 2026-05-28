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
    <div className="flex items-center gap-3">
      <span className="max-w-[12rem] truncate text-sm text-neutral-500" title={user.email ?? ''}>
        {user.email}
      </span>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium transition active:scale-[0.98] hover:border-neutral-400 dark:border-neutral-700 dark:hover:border-neutral-600"
        >
          Sair
        </button>
      </form>
    </div>
  );
}
