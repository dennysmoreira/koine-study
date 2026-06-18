# Design Review — Hermeneus (Koiné Study)

> Revisão multidisciplinar conduzida por uma equipe de **UX/Interaction Design**, **Visual/UI & Design System** e **Estratégia de Produto**, sobre o código real do repositório (read-only).
> Data: 2026-06-18 · Escopo: análise e recomendações; implementação rastreada na seção [Plano de correções](#plano-de-correções).

---

## Sumário executivo

O Hermeneus está **tecnicamente mais maduro do que o roadmap admite**: o README marca a "Fase 0" como em curso, mas o código já entrega leitor interlinear bilíngue (grego + hebraico), dicionário/concordância, estudo com IA conversacional, anotações, referências cruzadas (TSK), planos de leitura, highlights, compartilhamento público + PDF e PWA instalável. A UX de leitura e a acessibilidade estão acima da média para o estágio.

Há, porém, **dois defeitos de fundação** que sabotam justamente o core value e a conversão:

1. **🔴 P0 — As fontes do grego/hebraico não são carregadas.** O `tailwind.config.ts` aponta para `var(--font-greek)`/`var(--font-hebrew)`, mas essas variáveis nunca são definidas. Todo o texto original cai em fallback de sistema, que renderiza mal os diacríticos politônicos gregos e o niqqud/cantilação hebraicos. Invisível na máquina do dev; quebrado no usuário final.
2. **🔴 P0 — O gate anônimo→conta é silencioso.** Ações que exigem login (anotar, destacar, salvar estudo, IA) só falham *depois* que o usuário escreveu o conteúdo, com erro genérico.

A síntese por triangulação (achados convergentes entre especialistas independentes) reforça três temas: **a página `/share` não converte**, **o onboarding é fraco**, e **a densidade do texto original intimida iniciantes**.

---

## Triangulação — onde os três especialistas convergem

| Tema | UX | Visual | Produto |
|---|---|---|---|
| Página `/share` não converte | Sem CTA — porta de entrada viral desperdiçada | — | Loop viral é a maior alavanca de topo de funil |
| Onboarding fraco | Home é seção placeholder; iniciante sem rampa | — | Maior alavanca de ativação a baixo custo |
| Densidade do original | `TokenSheet` despeja tudo sem progressive disclosure | Falta type-scale; contraste AA falho | Público "exegese" inclui não-helenistas |
| Maturidade vs. roadmap | UX de leitura acima da média | Dark mode/a11y maduros | Roadmap subdimensiona — falta só SaaS, SRS e hardening |

---

## 1. UX & Interaction Design

### Pontos fortes
- **Retomada de leitura exata** (`ResumeReading` + redirector `/compare` + `currentVerse` via `IntersectionObserver` — `Comparator.tsx:484-522,655-664`).
- **Acessibilidade levada a sério**: zoom não travado com nota WCAG 1.4.4 (`layout.tsx:29`), `role="dialog"`/`aria-modal` + Escape nos sheets, `aria-live="polite"` no log de estudo (`StudyWorkspace.tsx:237-240`), `aria-current` na nav, alvos de 44px reaplicados em ações.
- **Gestos mobile bem calibrados**: swipe de capítulo com guardas (ignora se há seleção/sheet/modo seleção — `Comparator.tsx:723-762`).
- **Auto-hide do header** com histerese (`Comparator.tsx:631-650`).
- **Onboarding contextual do leitor** (`ReaderHelp` abre uma vez por dispositivo).
- **Estados de IA robustos**: streaming com Parar/Refazer/Continuar e restauração de backup (`StudyWorkspace.tsx:87-174`).
- **Compartilhamento honesto** (explica "cópia congelada"; separa Atualizar/Revogar).

### Problemas priorizados
| ID | Sev | Problema | Local | Recomendação |
|----|-----|----------|-------|--------------|
| UX-1 | P0 | Gate anônimo→conta silencioso: ações falham *após* o usuário escrever, com erro genérico | `VerseSelectionBar.tsx`, `StudyModal.tsx`, `AnnotationSheet.tsx`, `app/*/actions.ts` | Detectar estado anônimo no cliente; marcar ações gated; abrir sheet de conversão **preservando o rascunho** |
| UX-2 | P0 | Densidade/ausência de rótulos no header do leitor (Estudo, Selecionar, Versões, 🔊, Aa, ? numa linha) | `Comparator.tsx:902-991` | Reduzir a 1 ação primária + overflow "⋯"; rótulo/tooltip para todo ícone |
| UX-3 | P1 | Duas UIs de IA divergentes (`StudyModal` one-shot cru vs. `StudyWorkspace` tipografado) | `StudyModal.tsx` vs `StudyWorkspace.tsx` | Unificar renderização (reusar `StudyDocument`); idealmente unificar fluxo |
| UX-4 | P1 | Iniciantes em grego/hebraico sem rampa; `TokenSheet` sem progressive disclosure | `TokenSheet.tsx`, `HebrewWordSheet.tsx`, `app/page.tsx` | Glosa+pronúncia no topo; morfologia/léxicos colapsáveis ("Análise avançada ▸") |
| UX-5 | P1 | Home tem uma seção placeholder; Destaques/Anotações só via "Mais" | `app/page.tsx`, `BottomNav.tsx:29-35` | Seções reais ("Ler", "Meu estudo"); atividade recente na home |
| UX-6 | P1 | `/share/[token]` não tem CTA de conversão (loop viral desperdiçado) | `app/share/[token]/page.tsx` | Banner "Crie seu próprio estudo — conta grátis" |
| UX-7 | P2 | Cor de texto inconsistente em CTAs âmbar (`text-amber-950` vs `text-white`) | múltiplos | Token único para "texto sobre CTA âmbar" |
| UX-8 | P2 | "Buscar" (ação frequente) a dois toques atrás de "Mais" | `BottomNav.tsx` | Promover Buscar a aba fixa |
| UX-9 | P2 | Loadings sem padrão único | `TokenSheet.tsx:122-126` et al. | Componente de loading/skeleton reutilizável |

### Jornadas críticas (gaps)
- **Descobrir → ler → tocar palavra → anotar**: gate anônimo (UX-1) quebra no fim; modo "Selecionar" vs. seleção nativa confunde.
- **Ler → estudar IA → salvar → compartilhar**: troca de paradigma modal→workspace (UX-3); salvar anônimo falha (UX-1).
- **Receber link → converter**: sem CTA (UX-6) — porta de entrada viral não converte.

---

## 2. Visual / UI & Design System

### Estado atual
- **Bom**: âmbar como marca consistente; base `neutral` coerente; **dark mode real e completo**; `color-scheme: light dark`; escala de fonte do leitor semântica com tratamento +2px p/ hebraico (`globals.css:51-68`); paleta de destaques modularizada (`lib/highlight-colors.ts`).
- **Falta**: camada de **design tokens** (cores/raio/sombra/tipografia espalhados como utilitários repetidos); **escala tipográfica** (pixels arbitrários: `text-[15px]`, `[17px]`, `[0.65rem]`...); primitivo `<BottomSheet>` compartilhado (reimplementado 4×).

### Tipografia multilíngue (o ponto mais crítico)
- **🔴 P0 — fontes não carregadas**: `tailwind.config.ts:9-20` referencia `var(--font-greek)`/`var(--font-hebrew)`, mas as variáveis nunca são definidas (sem `next/font`, sem `@font-face`, sem assets em `public/`). Confirmado: `public/` não tem `.woff/.ttf/.otf` e não há pacote de fonte instalado. Grego politônico (espíritos, acentos, iota subscrito) e hebraico apontado (niqqud + cantilação) exigem tabelas GPOS/GSUB que fontes de sistema genéricas não cobrem bem → acentos cortados, sobreposição ou *tofu*.
- **Recomendação**: carregar as fontes e ligar as variáveis que o Tailwind já espera (zero mudança no resto do código). Grego: **Gentium Plus** (cobertura politônica impecável). Hebraico: **SBL Hebrew** (ideal p/ niqqud+cantilação) ou alternativas livres (**Taamey Frank CLM**, **Frank Ruhl Libre**). Garantir normalização Unicode **NFC** das superfícies.
- **RTL hebraico está correto** (`dir="rtl"` consistente); `leading-loose` e +2px são decisões acertadas.
- O "interlinear" é prosa clicável (`GreekVerse`/`HebrewVerse`), não alinhamento colunar palavra-a-glosa — decisão de produto legítima, registrada.

### Problemas priorizados
| ID | Sev | Problema | Local | Recomendação |
|----|-----|----------|-------|--------------|
| VIS-1 | P0 | Fontes grega/hebraica não carregadas (`--font-greek`/`--font-hebrew` indefinidas) | `tailwind.config.ts:9-20`; ausente em `layout.tsx`/`globals.css`/`public` | Carregar via `next/font` e definir as variáveis no `<html>` |
| VIS-2 | P1 | Contraste insuficiente: `text-neutral-400` usado como texto legível (~2.6:1 < AA 4.5:1) | `TokenSheet.tsx:87,91,103,110,113`; `HebrewWordSheet.tsx:50,71` | Promover conteúdo p/ `neutral-600` (claro); `neutral-400` só decoração/dark |
| VIS-3 | P1 | Alvos de toque < 44px (setas `size-9`/36px; checkbox `h-6 w-6`/24px) | `Comparator.tsx:862,888,1045` | ≥44px (`size-11`) ou hit-area com padding |
| VIS-4 | P1 | Tipografia sem escala (pixels arbitrários) | `Comparator.tsx:1071,1104,82`; `BottomNav.tsx:82` | Tokens `fontSize` no Tailwind |
| VIS-5 | P1 | Bottom sheet duplicado 4× | `Comparator.tsx:169-172,351-354`; `TokenSheet.tsx:76-84`; `HebrewWordSheet.tsx:36-44` | Extrair primitivo `<BottomSheet>` (+ focus trap) |
| VIS-6 | P2 | Ícones todos emoji (render inconsistente entre plataformas) | `BottomNav.tsx:21-35`; `app/page.tsx` | Set vetorial coeso (Lucide/Phosphor) |
| VIS-7 | P2 | Opacidades de scrim divergentes (`bg-black/40` vs `bg-black/30`) | `Comparator.tsx:170`; `BottomNav.tsx:93` | Token de scrim único |
| VIS-8 | P2 | Raios inconsistentes; `transition` sem propriedade; loadings sem skeleton | vários | Escala de raio nomeada; `transition-colors`; skeleton |

### Recomendações de design system
- Camada de tokens no `theme.extend` (cores semânticas `brand`/`surface`/`muted`, `fontSize` nomeado, `borderRadius` nomeado), idealmente via CSS custom properties trocadas em `:root`/`.dark`.
- Corrigir neutros de texto (VIS-2). Manter âmbar como marca.
- Adicionar fonte de UI/PT explícita p/ consistência entre dispositivos.
- Considerar **tema "sépia"** (alto valor percebido p/ leitura longa, baixo custo).
- Primitivo `<BottomSheet>` com focus trap + retorno de foco ao gatilho.

---

## 3. Estratégia de Produto

### Proposta de valor & posicionamento
"Leia e estude a Bíblia no grego e hebraico originais, com a língua explicada ao toque e uma IA que faz exegese séria — em português, no celular, de graça para começar." Wedge defensável: **grego + hebraico clicável + IA exegética metodológica + PT-BR nativo + BYOK/custo-zero**.

| Concorrente | Força | Fraqueza vs. Hermeneus |
|---|---|---|
| Logos / Verbum | Biblioteca gigante | Caro, desktop-first, EN, curva alta |
| Accordance | Original + morfologia | Pago, EN, sem IA conversacional |
| STEP Bible | Grátis, open data | EN, sem IA, UX datada, sem PT |
| Bible Hub | Interlinear web grátis | Web/ads, EN, sem IA/mobile coeso |
| YouVersion | Maior base, planos, social | Sem original/morfologia/exegese |
| Olive Tree / Tecarta | Mobile bom | Original limitado, EN, sem IA exegética |

### Público-alvo & JTBD
- **Seminaristas/estudantes** (núcleo): exegese no original sem ter o Logos — alta intenção, baixa renda.
- **Pastores/pregadores** (maior LTV): sermão expositivo fiel, rápido (modo "esboço de pregação").
- **Autodidatas de grego/hebraico**: ler o original + vocabulário (SRS futuro).
- **Líderes de grupo/EBD**: compartilhar estudo (share + PDF já entrega).

### Estado real vs. roadmap
Roadmap subdimensiona. **Implementado** além do declarado: leitor interlinear, **hebraico AT** (fora do roadmap numerado), dicionário/concordância, IA conversacional madura, anotações + cross-refs, planos de leitura, share + PDF, highlights, PWA offline. **Pendente real**: SRS/FSRS (Fase 2), Parsing (3), Gramática/Lições (4) e **camada SaaS/Stripe (5)** — hoje single-tenant/BYOK, custo de host ~US$0. Débitos anotados nos ADRs: prompt-injection "ok só single-tenant" (ADR-0004), cache de HTML autenticado no SW (ADR-0011).

### Priorização recomendada (valor × esforço)
1. **[Alto/médio] Contas + billing (Fase 5)** — gargalo entre projeto pessoal e negócio.
2. **[Alto/baixo] Hardening multi-tenant** — prompt-injection, cache do SW, rate-limit. Pré-requisito de segurança.
3. **[Alto/médio] SRS/FSRS (Fase 2)** — maior motor de retenção/hábito.
4. **[Médio/baixo] Onboarding + ativação** — "primeiro estudo guiado".
5. **[Médio/médio] Parsing & Gramática (Fases 3-4)** — conteúdo-pesado, após PMF.
6. **[Baixo agora] Empacotamento em lojas (Capacitor)** — após PMF.

### Monetização
BYOK (ADR-0005) zera custo de IA no free → freemium genuíno. Premium cobra **conveniência/profundidade/tiragem**, não "acesso à IA".

| Tier | Preço (BRL) | Conteúdo |
|---|---|---|
| Free | R$0 | Leitor/dicionário/planos/anotações/cross-refs; IA só BYOK ou cota compartilhada limitada |
| Plus | ~R$19-29/mês | IA gerenciada, SRS, estudos ilimitados, PDF sem marca, sync multi-device |
| Pro/Pastor | ~R$49-69/mês | + esboços ilimitados, uploads maiores, branding, prioridade de modelo |
| Institucional | sob consulta | Licenças por assento, turmas (canal B2B, maior LTV) |

Custo de IA: free = BYOK/fila com teto; pago = cota gerenciada com teto (Groq/Gemini flash-lite). Guardrail: **custo de IA por usuário pago/mês**.

### Riscos & mitigações
1. **Mercado/disposição a pagar (crítico)** → mirar pastores/B2B; preço acessível; freemium amplo.
2. **Concorrentes consolidados (alto)** → cravar o wedge, não competir em biblioteca.
3. **Custo de IA na escala paga (alto)** → tetos por tier, modelos baratos, telemetria.
4. **Licenciamento (médio, bem gerido)** → manter atribuições CC-BY visíveis; validar licença de cada versão PT ingerida.
5. **Segurança multi-tenant (médio)** → resolver antes de abrir ao público.
6. **Alucinação da IA (médio)** → ancoragem em material, honestidade epistêmica.

### Métricas / North Star
**North Star**: versículos estudados no original por usuário ativo/semana. Ativação: % que na 1ª semana abrem ≥1 token interlinear **e** salvam ≥1 estudo/anotação. Retenção: D7/D30 + dias-de-revisão SRS. Conversão freemium + custo de IA/usuário pago.

---

## Plano de correções

Ordem de consenso: **fundação de experiência antes de SaaS**. Status atualizado conforme execução.

| # | Item | Origem | Sev | Status |
|---|------|--------|-----|--------|
| 1 | Carregar fontes grega/hebraica e ligar `--font-greek`/`--font-hebrew` | VIS-1 | P0 | ✅ Feito — `next/font/google` (Gentium Plus + Frank Ruhl Libre) em `layout.tsx`; verificado no preview (grego politônico + hebraico niqqud/cantilação). Follow-up: self-host SBL Hebrew p/ cantilação premium |
| 2 | Gate visível + preservar rascunho ao acionar ação que exige conta | UX-1 | P0 | ✅ Feito — `isAuthenticated` threaded (page→Comparator→VerseSelectionBar); aviso proativo 🔒; ações gated salvam rascunho (`lib/selection-draft.ts`) e vão a `/login?next=` (anti-open-redirect em `lib/safe-next.ts`); re-hidratação reabre seleção+compositor ao voltar logado. Verificado: gate, draft, redirect e guard anônimo. Login autenticado→redirect: code-verified (sem credenciais para rodar) |
| 3 | CTA de conversão na `/share/[token]` | UX-6 | P0→quick win | ⬜ Pendente |
| 4 | Contraste AA: `text-neutral-400` → `neutral-600` em conteúdo | VIS-2 | P1 | ⬜ Pendente |
| 5 | Alvos de toque ≥44px (setas/checkbox) | VIS-3 | P1 | ⬜ Pendente |
| 6 | Token único de cor em CTA âmbar | UX-7/VIS | P2 | ⬜ Pendente |
| 7 | Progressive disclosure no `TokenSheet`/`HebrewWordSheet` | UX-4 | P1 | ⬜ Pendente |
| 8 | Primitivo `<BottomSheet>` compartilhado + focus trap | VIS-5 | P1 | ⬜ Pendente |
| 9 | Camada de design tokens (cores/tipografia/raio) | VIS-4/DS | P1 | ⬜ Pendente |
| — | Hardening multi-tenant, SRS, billing | Produto | — | 📋 Backlog (pré-SaaS) |
