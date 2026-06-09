'use client';

/**
 * Ajuda do leitor: ensina as interações que, de outro modo, ficam invisíveis
 * (tocar palavra → léxico; tocar número do versículo → referências cruzadas;
 * selecionar para anotar/estudar). Abre automaticamente UMA vez por dispositivo
 * (localStorage) e fica acessível pelo botão "?" no cabeçalho do comparador.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const HINT_KEY = 'koine:reader:hinted';

const ITEMS: { icon: string; title: string; body: string }[] = [
  { icon: '🔤', title: 'Toque numa palavra', body: 'Grega ou hebraica — abre o léxico, a transliteração e a morfologia.' },
  { icon: '#', title: 'Toque no número do versículo', body: 'Mostra as referências cruzadas (passagens relacionadas).' },
  { icon: '✍️', title: '“Selecionar”', body: 'Marque um ou mais versículos para anotar ou montar um estudo.' },
  { icon: '✨', title: '“Estudo com IA”', body: 'Gera uma análise do capítulo fundamentada no texto original.' },
];

export function ReaderHelp() {
  const [open, setOpen] = useState(false);

  // Auto-abre na primeira visita ao leitor; nas próximas, só pelo botão "?".
  useEffect(() => {
    try {
      if (!localStorage.getItem(HINT_KEY)) {
        setOpen(true);
        localStorage.setItem(HINT_KEY, '1');
      }
    } catch {
      /* localStorage indisponível — apenas não auto-abre */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Como usar o leitor"
        className="flex size-8 items-center justify-center rounded-full border border-neutral-300 text-sm font-semibold text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
      >
        ?
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        // Portal para o body: o cabeçalho do leitor usa backdrop-blur, que cria um
        // containing block para position:fixed — sem o portal, esta folha ficaria
        // confinada à caixa do header (estreita, no topo) em vez de cobrir a tela.
        <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
          <button type="button" aria-label="Fechar" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/40" />
          <div className="relative max-h-[75dvh] overflow-y-auto rounded-t-2xl bg-white p-5 pb-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] shadow-xl dark:bg-neutral-900">
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
                    <p className="text-sm text-neutral-500 dark:text-neutral-400">{it.body}</p>
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-5 min-h-[44px] w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-400"
            >
              Entendi
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
