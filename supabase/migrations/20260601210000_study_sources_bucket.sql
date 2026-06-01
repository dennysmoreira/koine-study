-- ════════════════════════════════════════════════════════════════════════
--  koine-study — bucket de Storage para fontes de estudo (uploads de arquivo)
--
--  Bucket PRIVADO 'study-sources'. O isolamento por usuário é por PREFIXO de
--  caminho: todo objeto vive sob "<user_id>/...". As policies em storage.objects
--  só liberam linhas cujo primeiro segmento do path == auth.uid(). Assim cada
--  usuário só lê/grava/apaga os próprios arquivos (padrão Supabase per-user folder).
--
--  Acesso de leitura no app é via URL assinada (signed URL) gerada no servidor —
--  o bucket nunca é público.
-- ════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('study-sources', 'study-sources', false)
on conflict (id) do nothing;

-- storage.objects já tem RLS habilitado pelo Supabase; só adicionamos as policies.
create policy "study_sources_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'study-sources' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "study_sources_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'study-sources' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "study_sources_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'study-sources' and (storage.foldername(name))[1] = auth.uid()::text);
