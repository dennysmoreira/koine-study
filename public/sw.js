/*
 * Service worker do Hermeneus — instalabilidade + cache offline.
 *
 * Estratégias:
 *  - Navegações (páginas): network-first. Online sempre traz o conteúdo fresco;
 *    offline cai na última versão cacheada da mesma rota e, se nunca visitada,
 *    na página /offline.html. Assim capítulos já lidos abrem sem rede.
 *  - Estáticos imutáveis (/_next/static, /icons, fontes): cache-first com
 *    revalidação em segundo plano (stale-while-revalidate) — carregamento rápido.
 *  - /api/*, autenticação e métodos não-GET: nunca cacheados (dados/sessão).
 *
 * Bump CACHE_VERSION ao mudar estas regras para descartar caches antigos.
 */
const CACHE_VERSION = 'hermeneus-v1';
const PRECACHE = `${CACHE_VERSION}-precache`;
const RUNTIME = `${CACHE_VERSION}-runtime`;

// Recursos garantidos no install (a casca mínima offline + ícones).
const PRECACHE_URLS = ['/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

// Remove caches de versões anteriores e assume o controle das abas abertas.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // só mesma origem
  if (url.pathname.startsWith('/api/')) return; // dados/IA: sempre rede, sem cache

  // Navegações (HTML): network-first com fallback ao cache e à página offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match('/offline.html'))),
    );
    return;
  }

  // Estáticos imutáveis: cache-first + revalidação em segundo plano.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(RUNTIME).then((cache) => cache.put(request, copy)).catch(() => {});
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});
