# ADR-0009 — Planos de leitura

- **Status:** Aceito
- **Data:** 2026-06-09
- **Contexto do app:** koine-study

## Contexto

Apps de leitura bíblica (MyBible etc.) oferecem **planos de leitura** com acompanhamento de
progresso. Faltava no koine-study, e é um recurso que encaixa no foco de leitura/estudo (sem ser
"curso", como os modos de aprendizagem que removemos).

## Decisão

1. **Catálogo de planos estático em código** (`lib/reading-plans.ts`), não em banco — é conteúdo
   curado e imutável. Cada plano é uma sequência de **dias**; cada dia tem uma ou mais leituras
   (capítulos). Os dias são **gerados** a partir das contagens canônicas de capítulos por livro
   (numeração protestante = eixo de display), então os links caem direto no comparador.
   Planos iniciais: Evangelhos (89), Novo Testamento (260), Salmos (150), Bíblia inteira (3 cap/dia).

2. **Só o PROGRESSO vai ao banco** (`reading_progress`, RLS `own_reading_progress`): uma linha por
   dia concluído (esparso). Catálogo estático + progresso por-usuário = separação limpa entre
   conteúdo e dado de usuário.

3. **UI:** `/reading` (lista de planos com barra de progresso) e `/reading/[plan]` (dias com
   marcação). A marcação é uma **única ilha client** (`ReadingPlanDays`) com estado otimista +
   reversão em erro (server action `toggleReadingDay`), em vez de um componente por dia — mais
   leve para planos longos (Bíblia ≈ 397 dias).

## Consequências / armadilhas

- **Contagens de capítulos hardcoded** (66 livros): são dados de referência estáveis (não mudam).
  Os nomes PT vêm de `getBooks` (fonte única), só a ordem/contagem é fixa na lib.
- **Eixo de display:** as contagens seguem a numeração protestante (ex.: Joel 3, Malaquias 4),
  consistente com o comparador — o link `/compare/{osis}/{chapter}` abre o capítulo certo.
- **Sem dado externo nem tradução** — diferente do #3 (comentários), este é autocontido.
- **Página de plano longo** (Bíblia, ~397 dias) renderiza todos os dias numa lista; aceitável para
  o MVP (uma ilha client). Paginação/ancoragem no "dia atual" fica como melhoria futura.
