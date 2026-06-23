'use client';

/**
 * Ajuda do leitor: ensina as interações que, de outro modo, ficam invisíveis
 * (tocar palavra → léxico; tocar número → referências; SEGURAR versículo →
 * selecionar; tocar nos nomes das versões → trocar tradução). Componente
 * CONTROLADO: o Comparator decide quando abrir (auto na 1ª visita + item do menu
 * "⋯"). Renderiza em portal porque o cabeçalho usa backdrop-blur (containing
 * block para position:fixed).
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

export const READER_HINT_KEY = 'koine:reader:hinted';

const ITEMS: { icon: string; title: string; body: string }[] = [
  { icon: '🔤', title: 'Toque numa palavra', body: 'Grega ou hebraica — abre o léxico, a transliteração e a morfologia.' },
  { icon: '#', title: 'Toque no número do versículo', body: 'Mostra as referências cruzadas (passagens relacionadas).' },
  { icon: '✋', title: 'Segure um versículo', body: 'Mantenha o dedo no número por um instante para selecionar e, então, anotar, destacar ou montar um estudo.' },
  { icon: '🔖', title: 'Toque nos nomes das versões', body: 'A legenda no topo da leitura abre o seletor de traduções.' },
  { icon: '✨', title: '“Estudo com IA”', body: 'Gera uma análise do capítulo fundamentada no texto original.' },
];

export function ReaderHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Como usar o leitor">
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/40" />
      <div className="relative max-h-[75dvh] overflow-y-auto rounded-t-2xl bg-surface p-5 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] shadow-xl">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        <h2 className="mb-4 text-sm font-semibold">Como usar o leitor</h2>
        <ul className="flex flex-col gap-3">
          {ITEMS.map((it) => (
            <li key={it.title} className="flex gap-3">
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-sm font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300"
              >
                {it.icon}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{it.title}</p>
                <p className="text-sm text-muted">{it.body}</p>
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 min-h-[44px] w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-400"
        >
          Entendi
        </button>
      </div>
    </div>,
    document.body,
  );
}
