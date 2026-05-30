-- ════════════════════════════════════════════════════════════════════════
--  koine-study — estudos salvos (Estudo com IA)
--  Persiste o texto gerado pela IA no comparador, por usuário.
--  RLS por auth.uid() (mesmo padrão de srs_cards / study_progress).
-- ════════════════════════════════════════════════════════════════════════

create table public.saved_studies (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  osis        text not null,                  -- osis_code do livro ("John", "1John")
  chapter     smallint not null,
  book_name   text not null,                  -- nome PT desnormalizado (listagem sem join)
  mode        text not null,                  -- chave do StudyMode (sermon | exegesis | ...)
  title       text not null,                  -- título curto derivado do conteúdo
  prompt      text,                           -- orientação/pergunta do usuário (opcional)
  codes       text[] not null default '{}',   -- versões usadas como contexto (proveniência)
  content     text not null,                  -- markdown gerado
  created_at  timestamptz not null default now()
);
create index saved_studies_user_idx on public.saved_studies (user_id, created_at desc);

alter table public.saved_studies enable row level security;

create policy "own_studies" on public.saved_studies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
