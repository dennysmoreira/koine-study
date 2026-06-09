# ADR-0011 — PWA instalável com cache offline

- **Status:** Aceito
- **Data:** 2026-06-09
- **Contexto do app:** Hermeneus (koine-study)

## Contexto

O app já era um PWA parcial (Next.js + manifest `display: standalone`), mas faltavam
ícones, service worker e metas do iOS — então não era instalável de fato (o Chrome
não oferecia "Instalar") nem funcionava offline. O usuário pediu o "PWA completo"
como caminho de menor esforço para ter o app no celular, antes de avaliar lojas.

## Decisão

1. **Ícones gerados como artefato de build.** `scripts/gen-icons.mjs` rasteriza um SVG
   (Ω âmbar `#f59e0b` sobre fundo `#0a0a0a`) via `sharp` — instalado com `--no-save` só
   para gerar e depois removido (`npm prune`). Os PNGs ficam versionados em
   `public/icons/` (192, 512, maskable-512, apple-touch-180). O `sharp` NÃO é dependência
   de runtime; reexecutar o gerador exige reinstalá-lo pontualmente.

2. **Manifest completo** (`app/manifest.ts`): `id`/`scope`/`start_url` = `/`,
   `display: standalone`, `orientation: portrait`, `categories`, e os ícones com
   `purpose` "any" (exibido como está) + "maskable" (full-bleed, o SO aplica a máscara).

3. **Metas iOS** (`app/layout.tsx` `metadata`): `appleWebApp` (capable + title +
   `black-translucent`) e `icons.apple` → apple-touch-icon. iOS instala via "Adicionar à
   Tela de Início" (Safari), sem prompt automático.

4. **Service worker hand-written** (`public/sw.js`), registrado por
   `components/ServiceWorkerRegister.tsx` **só em produção** (em dev um SW atrapalha o HMR
   e serve chunks obsoletos). Estratégias:
   - **Navegações:** network-first → cache da rota → `public/offline.html`. Online sempre
     fresco; offline reabre capítulos já visitados.
   - **Estáticos** (`/_next/static`, `/icons`, fontes): cache-first + revalidação
     (stale-while-revalidate).
   - **`/api/*`, não-GET, outras origens:** nunca cacheados (dados/sessão/IA).
   - `CACHE_VERSION` versiona; `activate` limpa caches antigos.

## Consequências / armadilhas

- **Offline é parcial por design.** O app é server-rendered (Next dinâmico + Supabase +
  IA), então só páginas já visitadas abrem offline; leitura/ estudo/login novos exigem
  rede. Offline total exigiria cachear o corpus no IndexedDB (trabalho à parte).
- **SW só em produção e sob HTTPS.** Service workers exigem contexto seguro; em dev não
  registra (gate por `NODE_ENV`), e em produção depende de deploy HTTPS.
- **Cache de HTML autenticado.** Em dispositivo compartilhado, páginas cacheadas podem
  vazar entre usuários e mostrar conteúdo obsoleto após logout. Aceitável para um app de
  leitura pessoal; rever se virar multiusuário no mesmo aparelho.
- **`CACHE_VERSION` deve subir** ao mudar as regras do SW, senão clientes seguem com o SW
  antigo até a revalidação.
- **Caminho para lojas (futuro):** estas capacidades PWA são pré-requisito para empacotar
  com Capacitor e satisfazer a guideline 4.2 da Apple (mais que um WebView).
