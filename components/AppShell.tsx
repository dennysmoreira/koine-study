'use client';

/**
 * Casca do app: reserva o espaço da BottomNav fixa SÓ quando ela aparece, e
 * renderiza a própria nav. A decisão de ocultar (login, /share/*) vive em
 * `isAppChromeHidden`, então padding e visibilidade nunca divergem — nas páginas
 * públicas de compartilhamento não sobra o vão morto da nav.
 *
 * `children` é passado como prop, então as páginas/Server Components continuam
 * renderizando no servidor (este wrapper client não os torna client).
 */
import { usePathname } from 'next/navigation';
import { BottomNav, isAppChromeHidden } from './BottomNav';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideChrome = isAppChromeHidden(pathname);

  return (
    <>
      <div className={hideChrome ? undefined : 'pb-[calc(3.5rem+env(safe-area-inset-bottom))]'}>{children}</div>
      <BottomNav />
    </>
  );
}
