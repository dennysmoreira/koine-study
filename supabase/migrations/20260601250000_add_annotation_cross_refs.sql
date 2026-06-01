-- Referencias cruzadas de uma anotacao: passagens biblicas relacionadas que o
-- usuario quer associar a anotacao alem da passagem ancora (ex.: anotou Efesios
-- 5:33 e quer remeter a 1 Pedro 3:1-7). Sao dados de propriedade exclusiva da
-- anotacao (editadas/removidas junto com ela), entao ficam embutidas como um
-- array JSONB em vez de uma tabela com RLS propria.
--
-- Formato de cada item:
--   { "osis": "1Pet", "bookName": "1 Pedro", "chapter": 3,
--     "verseStart": 1, "verseEnd": 7, "ref": "1 Pedro 3:1-7" }
alter table public.annotations
  add column if not exists cross_refs jsonb not null default '[]'::jsonb;
