-- Enriquecimento do painel da palavra hebraica (ADR-0002):
--   xlit        -> transliteracao academica do Strong's (ex.: "bara", "yowm")
--   pron        -> pronuncia figurada do Strong's (ex.: "baw-raw'", "yome")
--   bdb_def_pt  -> definicao BDB traduzida para PT-BR (par PT de bdb_def)
-- Colunas reaproveitadas pela mesma tabela `lemmas` (grego + hebraico); para o
-- grego ja existe lib/transliterate.ts (gerador Erasmiano), entao xlit/pron so
-- sao populadas no ETL hebraico (Strong's traz xlit/pron prontos).
alter table public.lemmas
  add column if not exists xlit text,
  add column if not exists pron text,
  add column if not exists bdb_def_pt text;
