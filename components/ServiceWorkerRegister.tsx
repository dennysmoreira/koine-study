'use client';

/**
 * Registra o service worker (/sw.js) que torna o app instalável e dá cache offline
 * das páginas já visitadas. Só em produção: em desenvolvimento um SW atrapalha o
 * HMR do Next e serve chunks obsoletos. O registro espera o evento 'load' para não
 * competir com o carregamento inicial.
 */
import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Falha de registro (ex.: contexto não-seguro) — degrada para web normal.
      });
    };

    if (document.readyState === 'complete') register();
    else {
      window.addEventListener('load', register);
      return () => window.removeEventListener('load', register);
    }
  }, []);

  return null;
}
