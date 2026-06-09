# ADR-0008 — Referências cruzadas (Treasury of Scripture Knowledge)

- **Status:** Aceito
- **Data:** 2026-06-09
- **Contexto do app:** koine-study

## Contexto

Apps de estudo (ex.: MyBible) mostram, por versículo, **referências cruzadas** — outras
passagens tematicamente ligadas. O koine-study só tinha cross-refs **manuais** (nas anotações do
usuário). Faltava a camada clássica, automática, por versículo.

## Decisão

1. **Fonte: Treasury of Scripture Knowledge agregado por votos da comunidade**, do
   [openbible.info](https://www.openbible.info/labs/cross-references/) — **licença CC-BY**
   (atribuição obrigatória, creditada na UI e aqui). ~344k referências, chaveadas em OSIS.

2. **Versificação = eixo de display.** As referências do TSK usam a numeração protestante, que é
   exatamente o **eixo de display** do app (ver ADR-0007/versificação). Logo gravamos `from`/`to`
   direto, **sem remapeamento** org↔eng — o link `?goto` cai na linha certa do comparador.

3. **Tabela `cross_references`** (corpus, leitura pública): `from_(osis,chapter,verse)` →
   `to_(osis,chapter,verse_start,verse_end)` + `votes` (relevância). Índice
   `(from_osis, from_chapter, from_verse, votes desc)` — busca por versículo já ordenada por
   relevância. `from` é sempre um versículo único; `to` pode ser uma faixa.

4. **Ingestão** (`scripts/ingest/cross-references.ts`, idempotente): baixa o TSV do openbible,
   valida os livros contra o nosso corpus (66 livros), parseia faixas e carrega via service role.
   O TXT cru fica em `data/sources/` (gitignored); reprodutível pelo comando no cabeçalho do script.

5. **UI: toque no número do versículo** no comparador abre a folha `CrossRefsSheet`, que carrega as
   refs sob demanda (server action `getVerseCrossReferences`) e linka cada destino ao comparador
   (`/compare/{osis}/{chapter}?goto={verse}`). Teto de 50 por versículo, por relevância.

## Consequências / armadilhas

- **Atribuição CC-BY é obrigatória** — exibida na folha ("openbible.info, CC-BY") e creditada aqui.
- **Sem FK `to_osis` → `books`** (osis é texto): o nome PT do livro de destino vem de `getBooks`
  (cacheado), mapeado em JS. Refs a livros fora do corpus são descartadas na ingestão.
- **Faixas cruzando capítulo/livro** (raras no TSK) são reduzidas ao verso inicial.
- **Leitura sob demanda**, não no payload do capítulo: um capítulo tem dezenas de versículos, cada
  um com até 50 refs — carregar tudo no load inflaria o comparador. A folha busca só ao abrir.
- **Verificado ao vivo (2026-06-09):** João 3:16 → 23 refs por relevância (Romanos 5:8, 1 João
  4:9-10, Romanos 8:32, João 3:15…), com nomes PT, faixas e links `?goto` corretos.
