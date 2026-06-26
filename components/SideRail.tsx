'use client';

/**
 * Navegação lateral do desktop (lg+): trilho fixo à esquerda com TODAS as seções
 * (TABS + MORE juntos — há espaço, sem overflow "Mais") + Sair. Substitui a
 * BottomNav (que fica só-mobile) para o app não parecer um mobile esticado numa
 * janela larga. Oculto nas mesmas rotas que a BottomNav (login, /share, /auth).
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from '@/app/auth/actions';
import { TABS, MORE, matches, isAppChromeHidden } from './BottomNav';

const ITEMS = [...TABS, ...MORE];

export function SideRail() {
  const pathname = usePathname();
  if (isAppChromeHidden(pathname)) return null;

  return (
    <aside
      aria-label="Navegação principal"
      className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-surface px-3 py-5 lg:flex"
    >
      <Link href="/" className="mb-6 flex items-center gap-2 px-2">
        <span aria-hidden className="text-lg">📖</span>
        <span className="text-lg font-semibold tracking-tight">Hermeneus</span>
      </Link>

      <nav className="flex flex-1 flex-col gap-0.5">
        {ITEMS.map((item) => {
          const active = matches(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'
              }`}
            >
              <span aria-hidden className="text-lg leading-none">
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <form action={signOut} className="mt-2 border-t border-line pt-2">
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
        >
          <span aria-hidden className="text-lg leading-none">↩</span>
          Sair
        </button>
      </form>
    </aside>
  );
}
