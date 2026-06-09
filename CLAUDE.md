# CLAUDE.md — koine-study

Guia para o Claude Code trabalhar neste repositório. **Leia os ponteiros antes de explorar**:
este arquivo é o mapa; o "porquê" detalhado e as armadilhas estão nos ADRs (`docs/adrs/`),
lidos só quando você for mexer naquela área. Não re-explore o que já está aqui.

## O que é

Plataforma pessoal de estudo de **grego koiné + hebraico bíblico** para exegese. Next.js
(App Router) PWA + Supabase (Postgres + Auth + RLS). Mobile-first. Arquitetura **data-first**:
um corpus etiquetado alimenta o leitor/comparador, o dicionário e os estudos com IA
(workspace conversacional, anotações e compartilhamento). Repo separado do workspace principal.

## Comandos

```bash
npm run dev            # next dev (porta 3000; preview "koine-dev" usa 3100 — .claude/launch.json)
npm run build          # next build
npm run lint           # next lint
npm run typecheck      # tsc --noEmit  (SEMPRE rodar após editar .ts/.tsx)
npm run morph:test     # smoke test do decodificador morfológico grego
```

ETL (cada passo é `tsx scripts/ingest/index.ts --step=<x>`, idempotente):

```bash
npm run ingest:load               # corpus grego: books->lemmas->verses->tokens
npm run ingest:backfill-greek     # popula verse_texts com o grego (comparador)
npm run ingest:version            # versões livres PT/EN via getbible
npm run ingest:thiagobodruk       # versões PT (aa/nvi/acf) baixadas+convertidas
npm run ingest:download-hebrew    # baixa WLC (openscriptures/morphhb)
npm run ingest:hebrew             # texto hebraico AT -> verse_texts (hbo-wlc)
npm run ingest:hebrew-lexicon     # Strong's hebraico -> lemmas
npm run ingest:hebrew-bdb         # definicao BDB -> lemmas.bdb_def (por Strong's)
npm run ingest:hebrew-interlinear # interlinear AT -> hebrew_words
npm run ingest:translate-hebrew   # gloss + BDB hebraico -> PT (le do banco; LLM)
npm run ingest:translate          # gloss_en -> gloss_pt (LLM; ver provider no .env)
```

## Mapa de arquitetura

**Camada de dados** — tudo em `lib/`, `server-only`, lê do Supabase via PostgREST. As funções
de leitura de corpus/traduções são embrulhadas em `unstable_cache` (ver ADR-0003).

| Área | Arquivo | Responsabilidade |
|------|---------|------------------|
| Comparador (agregador) | `lib/chapter-view.ts` | Funde traduções + interlinear (grego OU hebraico) por versículo |
| Traduções | `lib/translations.ts` | `translations` + `verse_texts` por `ref` OSIS; coluna Original resolve por testamento |
| Corpus grego | `lib/corpus.ts` | `verses`/`tokens`/`lemmas`; `getChapter`, `getBookByOsis` |
| Interlinear hebraico | `lib/hebrew.ts` | `hebrew_words` (multi-morfema) + join léxico por Strong's (transliteração/pronúncia + glosa + BDB, PT quando traduzido) |
| Decoder OSHM | `lib/hebrew-morph.ts` | **client-safe** (importado por componente client — ver ADR-0003) |
| Decoder Robinson | `scripts/ingest/morph-decoder.ts` | códigos gregos V-PAI-3S -> features |
| Léxico/dicionário | `lib/dictionary.ts`, `morph-labels.ts`, `transliterate.ts` | busca e rótulos PT |
| Estudos (IA) | `lib/saved-studies.ts`, `study.ts`, `study-modes.ts`, `shared-studies.ts`, `refs.ts` | workspace conversacional, citações, snapshots de compartilhamento (RLS) |
| Anotações | `lib/annotations.ts`, `annotations-server.ts` | observações por versículo + referências cruzadas (RLS) |
| Tradução LLM | `lib/gemini.ts` | provider de glosas EN->PT |
| Clients Supabase | `lib/supabase.ts`, `lib/supabase/` | anon (leitura), service_role (ETL), ssr (auth) |

**UI** — `components/Comparator.tsx` (comparador), `components/greek/{GreekVerse,TokenSheet}.tsx`,
`components/hebrew/{HebrewVerse,HebrewWordSheet}.tsx`. Rotas em `app/` (compare, dictionary,
studies, annotations, share, settings). Server Components + `app/*/actions.ts`.

**Schema** — `supabase/migrations/`. Tabelas: `books`, `lemmas`, `verses`, `tokens`,
`hebrew_words`, `translations`, `verse_texts`, léxicos (`lexicon_entries`...), `saved_studies`
+ tabelas de usuário/SRS. Corpus = leitura pública; dados de usuário = RLS por `auth.uid()`.

## Armadilhas críticas (NÃO repetir)

1. **`unstable_cache` serializa em JSON.** Nunca retorne `Map`/`Set`/`Date`/funções de uma
   função cacheada — viram `{}`/string. Retorne arrays/DTOs e reconstrua o tipo rico no
   consumidor. (`getHebrewChapter`/`getChapter` devolvem array; `chapter-view` monta o Map.) → **ADR-0003**
2. **Módulos importados por componentes client NÃO podem importar `node:*`** (`node:url` etc.).
   Quebra o webpack inteiro com `UnhandledSchemeError`. `lib/hebrew-morph.ts` é client-importado. → **ADR-0003**
3. **`lemmas.id` é identity "by default".** O build grego insere ids explícitos; o ETL hebraico
   precisa atribuir ids explícitos (reusar par existente, `max+1` para novos). → **ADR-0002**
4. **Versificação:** alinhamento por `ref` OSIS cobre ~99%. Joel diverge (WLC=4 caps, cristãs=3),
   Salmos têm shift de título. Remapeamento ficou FORA do MVP — cada fonte na própria versificação. → **ADR-0001**
5. **Migration ledger dessincronizado:** `supabase db push` falha com `relation already exists`
   porque `supabase_migrations.schema_migrations` está vazio mas o schema já existe. Ver "Aplicar migration" abaixo. → **ADR-0003**

## Operações

**Aplicar migration (DDL):** o `db push` não funciona (ledger drift). Aplique o SQL direto via
`pg` (já instalado), carregando `SUPABASE_DB_URL` do `.env`:

```bash
set -a && . ./.env && set +a && node -e "const{Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.SUPABASE_DB_URL});await c.connect();await c.query(\`<SEU DDL>\`);await c.end();})()"
```

> `SUPABASE_DB_URL` contém a senha master do banco — **NUNCA** ecoe a variável no terminal/log.
> Alternativa manual: colar o SQL no SQL Editor do Supabase. Reconciliar o ledger:
> `supabase migration repair`.

**Verificar UI ao vivo:** servidor de preview `koine-dev` (porta 3100, `.claude/launch.json`).
Use as ferramentas `preview_*` (snapshot/eval/screenshot) — não peça verificação manual ao usuário.

## Convenções

- **Código em inglês**; comentários, docs e ADRs em **português**.
- **Commits:** conventional, minúsculas, **sem acentos**, **sem trailer `Co-Authored-By`**.
  Ex.: `feat(comparador): interlinear hebraico clicavel com morfologia OSHM`.
- **Nunca commitar sem pedido explícito** — no máximo sugerir a mensagem.
- Arquivos novos em **UTF-8 + LF** (forçar LF; o Windows pode salvar CRLF).
- Toda função de leitura nova que for cacheada segue a regra da armadilha #1.

## ADRs

- `docs/adrs/ADR-0001-corpus-data-first-e-comparador.md` — corpus data-first + comparador version-agnostic (Original por testamento).
- `docs/adrs/ADR-0002-interlinear-hebraico-oshm.md` — tabela `hebrew_words` multi-morfema + ETL/léxico hebraico.
- `docs/adrs/ADR-0003-fronteira-serializacao-e-bundling.md` — `unstable_cache` (DTO, não Map) + regra `node:*` em módulos client + ledger drift.
