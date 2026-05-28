-- Corrige a leitura pública do corpus pelo papel `anon` (usado pelo PostgREST/frontend).
--
-- Contexto: as tabelas do corpus têm RLS habilitado, mas as policies `corpus_read`
-- do migration inicial não ficaram efetivas no banco remoto — o papel `anon`
-- enxergava 0 linhas. Os dados existem porque a ingestão usa a service_role
-- (que ignora RLS). Esta migration é idempotente: pode rodar mais de uma vez.

-- privilégios de tabela (RLS filtra linhas, mas o papel ainda precisa de SELECT)
grant usage on schema public to anon, authenticated;
grant select on public.books, public.lemmas, public.verses, public.tokens
  to anon, authenticated;

-- (re)cria as policies de leitura pública explicitamente para anon e authenticated
drop policy if exists "corpus_read" on public.books;
drop policy if exists "corpus_read" on public.lemmas;
drop policy if exists "corpus_read" on public.verses;
drop policy if exists "corpus_read" on public.tokens;

create policy "corpus_read" on public.books
  for select to anon, authenticated using (true);
create policy "corpus_read" on public.lemmas
  for select to anon, authenticated using (true);
create policy "corpus_read" on public.verses
  for select to anon, authenticated using (true);
create policy "corpus_read" on public.tokens
  for select to anon, authenticated using (true);
