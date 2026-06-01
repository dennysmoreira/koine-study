# ADR-0001 — Corpus data-first e comparador version-agnostic

- **Status:** Aceito
- **Data:** 2026-06-01
- **Contexto do app:** koine-study (estudo de grego koiné + hebraico bíblico)

## Contexto

O ativo central do produto é o **corpus etiquetado** (texto + morfologia + léxico + frequência),
não as telas. Os quatro modos de estudo (leitor/comparador, vocabulário/SRS, parsing, gramática)
são "views" sobre o mesmo dado. Além do corpus original, o comparador precisa exibir N traduções
lado a lado, e novas versões (algumas licenciadas) podem entrar no futuro sem reescrever schema.

## Decisão

1. **Data-first:** a construção começa pela ingestão. O corpus vive em tabelas estáveis
   (`books`, `lemmas`, `verses`, `tokens`, `hebrew_words`) com leitura **pública**; os dados de
   usuário (SRS, progresso, estudos salvos) vivem em tabelas com **RLS por `auth.uid()`**.

2. **Comparador version-agnostic (estilo theWord):** cada versão — inclusive o original — é uma
   linha em `translations`, e os versículos vivem em `verse_texts` chaveados por `ref` OSIS
   (ex.: `"John 1:1"`). O comparador junta versões pelo `ref`. Adicionar uma versão nova é só
   inserir linhas — **zero mudança de schema ou código** (Open/Closed).
   - Arquivos: `lib/translations.ts` (`getTranslations`, `getParallelChapter`).

3. **Coluna "Original" resolve por testamento:** existem duas linhas `is_original` no catálogo
   (`grc-sblgnt`, `hbo-wlc`). O comparador troca QUALQUER original pedido pelo da língua certa do
   livro atual — grego (`grc`) no NT, hebraico (`hbo`) no AT. Assim navegar João → Gênesis mantém
   a coluna original presente e correta sem o usuário reescolher a versão.
   - `lib/translations.ts` (`fetchParallelChapter`), agregado em `lib/chapter-view.ts`.

4. **Agregador `getChapterView`** (`lib/chapter-view.ts`) compõe duas leituras já cacheadas:
   texto plano por versão (`verse_texts`) + interlinear da coluna original (tokens gregos de
   `tokens` OU palavras hebraicas de `hebrew_words`). Não tem cache próprio — é um Aggregate.

## Consequências

- Carga incremental: ETL por passo idempotente (`scripts/ingest/index.ts --step=...`).
- **Versificação:** alinhamento por `ref` OSIS cobre ~99% da Bíblia. Joel diverge um capítulo
  inteiro (WLC=4 caps, traduções cristãs=3) e há shifts de versículo (títulos de Salmos etc.).
  **Remapeamento ficou FORA do MVP** — cada fonte é carregada na própria versificação.
- O `ref` canônico de uma linha é escolhido de forma determinística (versão de maior precedência
  presente no versículo, `sort_order`), nunca "o primeiro que o PostgREST retornou".
- `book_chapters` é uma RPC (DISTINCT no banco) porque `verse_texts` tem uma linha por
  (versículo × versão) e o `select` cru estourava o teto de 1.000 linhas do PostgREST.

## Notas

- Licença das versões: a coluna `translations.license` foi **removida** (ADR implícito posterior,
  migration `20260601170000`); o comparador credita nome + link de fonte, sem texto de licença.
  Atenção: fontes CC BY (Bíblia Livre, WLC) tecnicamente pedem atribuição com licença.
- Fontes do corpus em domínio público (Byzantine/Robinson-Pierpont, Dodson); SBLGNT evitado por
  EULA comercial. Texto base etiquetado é **sem acentos** (acentuação virá por alinhamento futuro).
