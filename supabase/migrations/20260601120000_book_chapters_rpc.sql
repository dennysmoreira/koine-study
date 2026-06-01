-- ════════════════════════════════════════════════════════════════════════
--  koine-study — RPC de capítulos distintos por livro
--
--  Problema: derivar a lista de capítulos de um livro com `select chapter`
--  cru transferia uma linha por (versículo × versão). Em verse_texts isso são
--  milhares de linhas por livro, mas o PostgREST corta a resposta em 1.000
--  linhas (silenciosamente). Ordenado por capítulo, o corte só trazia os
--  primeiros capítulos — Mateus aparecia com 6 (não 28). Quanto mais versões
--  licenciadas, MENOS capítulos apareciam.
--
--  Correção (pushdown): agregar no banco com DISTINCT e devolver só os ~28
--  valores de capítulo. O(capítulos) em vez de O(versículos × versões), e bem
--  abaixo do teto de 1.000 linhas.
-- ════════════════════════════════════════════════════════════════════════

-- Capítulos existentes de um livro no comparador (tabela verse_texts).
create or replace function public.book_chapters(p_book_id smallint)
returns setof smallint
language sql
stable
security invoker
set search_path = public
as $$
  select distinct chapter
  from public.verse_texts
  where book_id = p_book_id
  order by chapter
$$;

-- Capítulos existentes de um livro no corpus grego tokenizado (tabela verses).
create or replace function public.corpus_chapters(p_book_id smallint)
returns setof smallint
language sql
stable
security invoker
set search_path = public
as $$
  select distinct chapter
  from public.verses
  where book_id = p_book_id
  order by chapter
$$;

grant execute on function public.book_chapters(smallint)   to anon, authenticated;
grant execute on function public.corpus_chapters(smallint) to anon, authenticated;
