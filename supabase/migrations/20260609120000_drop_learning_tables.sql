-- ════════════════════════════════════════════════════════════════════════
--  koine-study — remove as tabelas dos modos de aprendizagem descontinuados
--
--  O app deixou de ter os modos "aprender do zero" (Alfabeto, Gramática,
--  Frequência, Vocabulário/SRS, Parsing) e a gamificação, focando em
--  leitura/comparação, dicionário, estudos com IA, anotações e compartilhamento.
--  As tabelas abaixo ficaram órfãs (nenhum código do app as lê/escreve):
--    • srs_cards      → baralho de repetição espaçada do Vocabulário
--    • study_progress → progresso/base da faixa de gamificação
--
--  CASCADE remove junto as policies de RLS e as FKs dependentes.
-- ════════════════════════════════════════════════════════════════════════

drop table if exists public.srs_cards cascade;
drop table if exists public.study_progress cascade;
