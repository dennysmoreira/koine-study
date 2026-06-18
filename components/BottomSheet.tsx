'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Bottom sheet modal compartilhado: scrim + painel ancorado embaixo + handle.
 * Antes este markup (overlay `bg-black/40`, painel `rounded-t-2xl`, handle,
 * padding seguro com `env(safe-area-inset-bottom)`) era reimplementado em cada
 * folha; aqui vira primitivo único. Acrescenta o que faltava por toda parte:
 * **focus trap** (Tab circula dentro do painel) e **retorno de foco** ao
 * elemento que abriu — acessibilidade de diálogo modal (WCAG 2.4.3).
 *
 * Renderiza em fluxo (não em portal), preservando o comportamento das folhas
 * existentes. Esc fecha. O conteúdo entra como children.
 */
export function BottomSheet({
  onClose,
  children,
  ariaLabel,
  maxHeightClass = 'max-h-[70dvh]',
}: {
  onClose: () => void;
  children: ReactNode;
  /** Rótulo acessível do diálogo (lido por leitores de tela). */
  ariaLabel?: string;
  /** Altura máxima do painel (default 70dvh; algumas folhas usam 75dvh). */
  maxHeightClass?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // Foca o painel ao abrir (anuncia o diálogo) — mas respeita um autoFocus
    // interno já aplicado (ex.: textarea), não roubando o foco dele.
    if (panel && !panel.contains(document.activeElement)) panel.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) {
        e.preventDefault();
        panel.focus();
        return;
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // Devolve o foco a quem abriu a folha (ex.: o token/versículo tocado).
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`relative ${maxHeightClass} overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] shadow-xl outline-none dark:bg-neutral-900`}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        {children}
      </div>
    </div>
  );
}
