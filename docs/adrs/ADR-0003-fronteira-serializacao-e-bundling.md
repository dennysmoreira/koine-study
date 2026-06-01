# ADR-0003 — Fronteiras de serialização, bundling client e migration ledger

- **Status:** Aceito
- **Data:** 2026-06-01
- **Contexto do app:** koine-study

## Contexto

Três classes de bug surgiram em runtime/build (não pegas pelo `tsc`) e custaram caro para
diagnosticar. Este ADR registra as regras para não repeti-las.

## Decisão / Regras

### 1. `unstable_cache` é uma fronteira de serialização JSON

Toda função embrulhada em `unstable_cache` tem o retorno serializado em JSON. `Map`/`Set` viram
`{}` (perdem `.get`/`.has`), `Date` vira string ISO, funções somem. Não dá para devolver tipo rico.

**Regra:** funções cacheadas retornam **DTOs serializáveis** (arrays/objetos planos); o consumidor
reconstrói o tipo rico do seu lado (padrão DTO).

- `lib/corpus.ts` `getChapter` e `lib/hebrew.ts` `getHebrewChapter` devolvem `{verses: [...]}` (array).
- `lib/chapter-view.ts` monta os `Map<number, ...>` localmente a partir desses arrays.
- Sintoma se violar: `TypeError: x.get is not a function` em runtime, página vazia.

> É o mesmo princípio do RSC Flight payload (só dados serializáveis cruzam cliente/servidor) e de
> `structuredClone` vs. referência.

### 2. Módulos importados por componentes client não podem importar `node:*`

Um `import { pathToFileURL } from 'node:url'` (ou qualquer `node:`) num módulo que acaba no bundle
do browser quebra o **webpack inteiro** com `UnhandledSchemeError` — todas as rotas dão 500.

**Regra:** módulos compartilhados com componentes client (ex.: `lib/hebrew-morph.ts`, importado por
`components/hebrew/HebrewWordSheet.tsx`) ficam **puros** — sem `node:*`, sem guards de CLI top-level.
Coloque self-tests/CLI em arquivos separados que só rodam server-side (ex.: `scripts/`).

### 3. Migration ledger pode estar dessincronizado do schema

`supabase db push` falha com `relation "..." already exists` (SQLSTATE 42P07) quando a tabela
`supabase_migrations.schema_migrations` está vazia mas o schema já foi aplicado por fora (SQL
Editor, `pg` direto). É **schema drift** entre o ledger declarado e o banco real.

**Regra:** para aplicar uma migration nova, rode o DDL direto via `pg` carregando `SUPABASE_DB_URL`
do `.env` (ver `CLAUDE.md` → Operações). **Nunca** ecoe `SUPABASE_DB_URL` (contém a senha master).
**Não** use `db push --include-all` (tenta reaplicar tudo do zero). Para reconciliar o ledger de
verdade: `supabase migration repair`. O arquivo de migration ainda é criado para documentação e
para setups limpos (`db reset`).

## Consequências

- `tsc --noEmit` não pega nenhum desses três — exigem verificação em build (#2) ou runtime (#1),
  e o #3 só aparece ao aplicar migration. Por isso a verificação ao vivo via preview é parte do
  fluxo (ver `CLAUDE.md` → Operações).
- ETL que escreve em tabelas cujo schema mudou precisa ser atualizado junto com a migration
  (ex.: ao dropar `translations.license`, todos os upserts em `scripts/ingest/*` pararam de enviá-la).
