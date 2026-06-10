'use client';

/**
 * Barra de navegação inferior global (padrão app mobile/PWA). Sem ela, pular de
 * uma página interna para outra exigia voltar até a home. As abas principais
 * ficam sempre visíveis; o botão "Mais" abre uma folha com o restante das seções
 * e as ações de conta. Oculta na tela de login (usuário ainda não autenticado).
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from '@/app/auth/actions';

interface NavItem {
  href: string;
  icon: string;
  label: string;
}

// Abas fixas na barra (as seções mais usadas). "Mais" entra como 5º slot.
const TABS: NavItem[] = [
  { href: '/', icon: '🏛️', label: 'Início' },
  { href: '/compare', icon: '📜', label: 'Ler' },
  { href: '/dictionary', icon: '📚', label: 'Dicionário' },
  { href: '/studies', icon: '✨', label: 'Estudos' },
];

// Demais seções, acessíveis pela folha "Mais".
const MORE: NavItem[] = [
  { href: '/annotations', icon: '📝', label: 'Anotações' },
  { href: '/reading', icon: '📅', label: 'Planos' },
  { href: '/settings', icon: '⚙️', label: 'Configurações' },
];

// Casa a rota atual com um href de seção, considerando sub-rotas
// (ex.: /compare/John/1 ativa "Ler"; /studies/5 ativa "Estudos").
function matches(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * A navegação fixa some no login (gated) e nas páginas públicas de
 * compartilhamento (/share/*) — read-only para quem não tem conta. Exportada
 * para o AppShell decidir, no mesmo lugar, se reserva o espaço da nav.
 */
export function isAppChromeHidden(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/share' ||
    pathname.startsWith('/share/') ||
    pathname.startsWith('/auth/') // telas focadas de autenticação (ex.: nova senha)
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // Fecha a folha ao navegar.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Esc fecha a folha.
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  if (isAppChromeHidden(pathname)) return null;

  const moreActive = MORE.some((item) => matches(pathname, item.href));

  const tabClass = (active: boolean) =>
    `flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[0.65rem] font-medium transition ${
      active
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
    }`;

  return (
    <>
      {/* Folha "Mais": overlay + painel ancorado acima da barra. */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
          onClick={() => setMoreOpen(false)}
          aria-hidden
        />
      )}
      {moreOpen && (
        <div
          role="menu"
          aria-label="Mais seções"
          className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-2xl px-3 pb-2"
        >
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
            <div className="grid grid-cols-3 gap-1 p-2">
              {MORE.map((item) => {
                const active = matches(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    className={`flex flex-col items-center gap-1 rounded-xl p-3 text-center transition active:scale-[0.97] ${
                      active
                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                        : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800'
                    }`}
                  >
                    <span aria-hidden className="text-xl">
                      {item.icon}
                    </span>
                    <span className="text-xs font-medium leading-tight">{item.label}</span>
                  </Link>
                );
              })}
            </div>
            <form action={signOut} className="border-t border-neutral-200 dark:border-neutral-800">
              <button
                role="menuitem"
                type="submit"
                className="w-full px-4 py-3 text-left text-sm font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/30"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      )}

      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90"
      >
        <div className="mx-auto flex max-w-2xl items-stretch">
          {TABS.map((item) => {
            const active = matches(pathname, item.href);
            return (
              <Link key={item.href} href={item.href} className={tabClass(active)} aria-current={active ? 'page' : undefined}>
                <span aria-hidden className="text-xl leading-none">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            aria-label="Mais seções"
            className={tabClass(moreActive || moreOpen)}
          >
            <span aria-hidden className="text-xl leading-none">
              ☰
            </span>
            <span>Mais</span>
          </button>
        </div>
      </nav>
    </>
  );
}
