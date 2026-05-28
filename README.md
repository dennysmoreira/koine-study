# koine-study

Plataforma de estudo de **grego koiné para exegese bíblica**. SaaS, mobile-first (PWA).

Quatro modos de estudo, todos alimentados por um único corpus etiquetado:

1. **Leitor interlinear** — texto grego do NT com análise morfológica palavra-a-palavra e léxico ao toque.
2. **Vocabulário (SRS)** — flashcards com repetição espaçada (FSRS), listas por frequência.
3. **Parsing** — quiz de análise morfológica (tempo/voz/modo/caso…).
4. **Gramática/Lições** — trilha estruturada (alfabeto → casos → verbos).

## Arquitetura (data-first)

O ativo central é o **corpus**: texto grego + morfologia + léxico + frequência. Os quatro
modos são "views" sobre esse mesmo dado. Por isso a construção começa pela ingestão.

```
        CORPUS (verses + tokens + lemmas + morfologia)
   ┌──────────┬─────────────┬──────────┬─────────────┐
 Interlinear  Vocabulário   Parsing    Gramática
```

## Stack

- **Frontend (Fase 1+):** Next.js (App Router) como PWA + Tailwind.
- **Backend/DB/Auth:** Supabase (Postgres + Auth + RLS).
- **SRS:** algoritmo FSRS.
- **Pagamentos (Fase 5):** Stripe.

## Fontes de dados (domínio público)

| Dado | Fonte | Licença |
|------|-------|---------|
| Texto + morfologia + Strong's | [byztxt/byzantine-majority-text](https://github.com/byztxt/byzantine-majority-text) (Robinson-Pierpont) | Domínio público |
| Léxico (glosas EN) | [biblicalhumanities/Dodson-Greek-Lexicon](https://github.com/biblicalhumanities/Dodson-Greek-Lexicon) | Domínio público |
| Enriquecimento opcional | [STEPBible-Data (TAGNT)](https://github.com/STEPBible/STEPBible-Data) | CC-BY 4.0 (requer atribuição) |

> **Texto base:** Byzantine (Robinson-Pierpont), domínio público — livre para uso comercial.
> Glosas em PT são geradas traduzindo o Dodson (EN) uma vez via LLM (passo `translate`).

## Roadmap

- [x] **Fase 0 — Fundação de dados** (em curso): schema + decodificador morfológico + pipeline de ingestão.
- [ ] **Fase 1 — Leitor interlinear**
- [ ] **Fase 2 — Vocabulário / SRS (FSRS)**
- [ ] **Fase 3 — Parsing**
- [ ] **Fase 4 — Gramática / Lições**
- [ ] **Fase 5 — Camada SaaS** (contas, planos, Stripe)

## Setup

```bash
npm install
cp .env.example .env           # preencher SUPABASE_* (e ANTHROPIC_API_KEY p/ translate)
npm run ingest                 # download + build -> data/build/*.json
npm run morph:test             # smoke test do decodificador morfológico
npm run typecheck              # tsc --noEmit
```

### Carregar o corpus no Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Aplique o schema — uma das opções:
   - **SQL Editor** (mais simples): cole o conteúdo de
     `supabase/migrations/20260528120000_init_corpus_and_user_schema.sql` e rode.
   - **Supabase CLI**: `supabase link --project-ref <ref>` + `supabase db push`.
3. Em **Project Settings → API**, copie `Project URL` e a chave `service_role`
   para o `.env` (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
   > A `service_role` ignora RLS — uso exclusivo de scripts server-side, nunca no frontend.
4. Carregue o corpus:
   ```bash
   npm run ingest:load          # books -> lemmas -> verses -> tokens (em lote)
   ```
   O passo é idempotente: aborta se a tabela `tokens` já tiver linhas.

### Passos individuais da ingestão

```bash
npm run ingest:download        # garante as fontes em data/sources/
npm run ingest:build           # gera data/build/*.json (verificável sem Supabase)
npm run ingest:translate       # gloss_en -> gloss_pt (requer ANTHROPIC_API_KEY)
npm run ingest:load            # data/build/*.json -> Supabase
```

## Estrutura

```
supabase/migrations/   schema (corpus público + dados de usuário com RLS)
scripts/ingest/        pipeline ETL
  morph-decoder.ts     decodifica códigos Robinson (V-PAI-3S -> features)
  index.ts             orquestrador dos passos (download→lemmas→text→…→load)
data/sources/          fontes baixadas (gitignored)
```
