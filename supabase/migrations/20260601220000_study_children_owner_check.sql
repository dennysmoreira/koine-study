-- ════════════════════════════════════════════════════════════════════════
--  koine-study — defesa em profundidade nas tabelas-filha do workspace
--
--  As policies originais (own_study_*) validavam apenas que a LINHA inserida
--  tem user_id = auth.uid(). Como user_id é desnormalizado, nada impedia, no
--  nível do banco, anexar uma linha a um study_id de OUTRO usuário (o vínculo
--  só era garantido em app, por assertOwnsStudy). Aqui reforçamos o with_check
--  exigindo que o study_id pertença ao usuário — fechando o furo sem depender
--  do código de aplicação. O exists() ainda passa pela RLS de saved_studies.
-- ════════════════════════════════════════════════════════════════════════

drop policy "own_study_messages" on public.study_messages;
create policy "own_study_messages" on public.study_messages
  for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.saved_studies s
      where s.id = study_id and s.user_id = auth.uid()
    )
  );

drop policy "own_study_sources" on public.study_sources;
create policy "own_study_sources" on public.study_sources
  for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.saved_studies s
      where s.id = study_id and s.user_id = auth.uid()
    )
  );

drop policy "own_study_references" on public.study_references;
create policy "own_study_references" on public.study_references
  for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.saved_studies s
      where s.id = study_id and s.user_id = auth.uid()
    )
  );
