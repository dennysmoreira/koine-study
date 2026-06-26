'use client';

/**
 * Botão de instalação do PWA, dentro do próprio app (em vez do ícone escondido na
 * barra do navegador). Escuta `beforeinstallprompt` (Chromium: Edge/Chrome no
 * Windows/Android), guarda o evento e mostra um banner "Instalar" assim que o app
 * é instalável. O clique dispara o diálogo nativo — navegadores NÃO permitem
 * instalar sem um gesto do usuário, então um botão é o mais automático possível.
 *
 * Não renderiza nada quando: já está instalado (display-mode: standalone), o
 * evento ainda não veio, ou o navegador não suporta (Safari/Firefox não disparam
 * o evento — lá o install é manual via "Adicionar à Tela de Início").
 */
import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Já rodando instalado? Não oferece de novo.
    if (window.matchMedia?.('(display-mode: standalone)').matches) {
      setInstalled(true);
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault(); // suprime o mini-infobar padrão; usamos o nosso botão
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt as EventListener);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt as EventListener);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed || !deferred) return null;

  const install = async () => {
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
    setDeferred(null); // o evento só pode ser usado uma vez
  };

  return (
    <button
      type="button"
      onClick={install}
      className="mb-6 flex w-full items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left transition hover:bg-amber-100 dark:border-amber-800/60 dark:bg-amber-900/15 dark:hover:bg-amber-900/25"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span aria-hidden className="text-lg">⬇️</span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">Instalar o Hermeneus</span>
          <span className="block text-xs text-muted">Abre como app, com ícone próprio e funciona offline.</span>
        </span>
      </span>
      <span className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-amber-950">
        Instalar
      </span>
    </button>
  );
}
