-- ════════════════════════════════════════════════════════════════════════
--  koine-study — workspace de estudo conversacional
--
--  Evolui o "estudo salvo" (texto one-shot) para um WORKSPACE:
--    • study_messages   → diálogo multi-turno com a IA (histórico)
--    • study_sources    → fontes do usuário (texto inline agora; arquivo via
--                         Storage; campos de RAG/embedding ficam para fase futura)
--    • study_references → versículos da base citados no estudo (OSIS)
--
--  Um estudo deixa de ser preso a UM capítulo: pode ser um workspace puro de
--  conversa ou citar passagens de vários livros. Por isso afrouxamos os NOT NULL
--  de saved_studies (osis/chapter/book_name/content) — o conteúdo gerado passa a
--  ser opcional (a conversa vive em study_messages) e a referência primária some.
--
--  RLS por auth.uid() em todas as tabelas (mesmo padrão de own_studies). O
--  user_id é desnormalizado em cada filha para manter a policy simples e direta.
-- ════════════════════════════════════════════════════════════════════════

-- 1) Afrouxa saved_studies para servir de container do workspace.
alter table public.saved_studies alter column content   drop not null;
alter table public.saved_studies alter column osis       drop not null;
alter table public.saved_studies alter column chapter    drop not null;
alter table public.saved_studies alter column book_name  drop not null;
alter table public.saved_studies alter column mode        set default 'free';

-- 2) Diálogo multi-turno (histórico da conversa com a IA).
create table public.study_messages (
  id          bigint generated always as identity primary key,
  study_id    bigint not null references public.saved_studies(id) on delete cascade,
  user_id     uuid   not null references auth.users(id) on delete cascade,
  role        text   not null check (role in ('user', 'assistant')),
  content     text   not null,
  created_at  timestamptz not null default now()
);
create index study_messages_study_idx on public.study_messages (study_id, created_at);
alter table public.study_messages enable row level security;
create policy "own_study_messages" on public.study_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3) Fontes do usuário. kind='text' guarda o texto inline (injetado no contexto);
--    kind='file' guarda o caminho no bucket Storage 'study-sources'.
--    Embeddings/RAG (chunking + vetor) ficam para uma migration posterior.
create table public.study_sources (
  id            bigint generated always as identity primary key,
  study_id      bigint not null references public.saved_studies(id) on delete cascade,
  user_id       uuid   not null references auth.users(id) on delete cascade,
  kind          text   not null check (kind in ('text', 'file')),
  title         text   not null,
  content       text,                 -- preenchido quando kind='text'
  storage_path  text,                 -- preenchido quando kind='file' (bucket study-sources)
  mime_type     text,
  byte_size     bigint,
  created_at    timestamptz not null default now(),
  constraint study_sources_payload check (
    (kind = 'text' and content is not null) or
    (kind = 'file' and storage_path is not null)
  )
);
create index study_sources_study_idx on public.study_sources (study_id, created_at);
alter table public.study_sources enable row level security;
create policy "own_study_sources" on public.study_sources
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 4) Versículos da base citados no estudo (proveniência + injeção de léxico).
create table public.study_references (
  id          bigint generated always as identity primary key,
  study_id    bigint   not null references public.saved_studies(id) on delete cascade,
  user_id     uuid     not null references auth.users(id) on delete cascade,
  ref         text     not null,       -- ref OSIS do versículo ("John.3.16")
  osis        text     not null,       -- osis_code do livro ("John")
  book_name   text     not null,
  chapter     smallint not null,
  verse       smallint not null,
  created_at  timestamptz not null default now(),
  unique (study_id, ref)
);
create index study_references_study_idx on public.study_references (study_id, chapter, verse);
alter table public.study_references enable row level security;
create policy "own_study_references" on public.study_references
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
