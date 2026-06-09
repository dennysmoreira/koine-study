-- ════════════════════════════════════════════════════════════════════════
--  koine-study — índice GIN para concordância hebraica
--
--  A concordância busca todas as ocorrências de um Strong's no AT via containment
--  jsonb: hebrew_words.morphemes @> '[{"g":"H430"}]'. Sem índice, isso varre as
--  ~420k linhas a cada consulta (lento, podia estourar o timeout). jsonb_path_ops
--  é o opclass GIN ideal para o operador @> (menor e mais rápido que o padrão).
-- ════════════════════════════════════════════════════════════════════════

create index if not exists hebrew_words_morphemes_gin
  on public.hebrew_words using gin (morphemes jsonb_path_ops);
