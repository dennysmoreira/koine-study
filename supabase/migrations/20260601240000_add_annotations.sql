-- ════════════════════════════════════════════════════════════════════════
--  koine-study — anotações pessoais do usuário
--
--  Permite anotar um versículo (ou faixa de versículos) no comparador SEM usar
--  IA: a pessoa seleciona o texto e escreve sua própria nota. As anotações são
--  independentes dos estudos, mas podem ser VINCULADAS a um estudo como fonte
--  (study_sources kind='annotation') — vínculo ao vivo: editar a anotação reflete
--  no estudo e no contexto da IA, pois o conteúdo é resolvido a partir desta
--  tabela na leitura, não copiado.
--
--  RLS por auth.uid() (mesmo padrão de own_studies). Faixa de versículos guardada
--  como verse_start/verse_end (passagem contígua); `ref` é o rótulo legível da
--  faixa ("João 3:16" / "João 3:16-18"), reconstruído no servidor. O deep-link
--  ?goto no comparador usa osis + chapter + verse_start, não o `ref`.
-- ════════════════════════════════════════════════════════════════════════

-- 1) Anotações do usuário.
create table public.annotations (
  id           bigint generated always as identity primary key,
  user_id      uuid     not null references auth.users(id) on delete cascade,
  osis         text     not null,       -- osis_code do livro ("John")
  book_name    text     not null,
  chapter      smallint not null,
  verse_start  smallint not null,
  verse_end    smallint not null,
  ref          text     not null,       -- ref OSIS do 1º versículo ("John.3.16")
  body         text     not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index annotations_user_loc_idx on public.annotations (user_id, osis, chapter, verse_start);
alter table public.annotations enable row level security;
create policy "own_annotations" on public.annotations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2) Estende study_sources para aceitar uma anotação como fonte (vínculo ao vivo).
--    O conteúdo NÃO é copiado: annotation_id referencia a anotação e a leitura
--    (getStudyWorkspace) resolve o corpo atual — assim editar a anotação propaga
--    automaticamente para o estudo e para o contexto da IA.
alter table public.study_sources drop constraint study_sources_kind_check;
alter table public.study_sources
  add constraint study_sources_kind_check check (kind in ('text', 'file', 'annotation'));

alter table public.study_sources
  add column annotation_id bigint references public.annotations(id) on delete cascade;

alter table public.study_sources drop constraint study_sources_payload;
alter table public.study_sources
  add constraint study_sources_payload check (
    (kind = 'text'       and content is not null)      or
    (kind = 'file'       and storage_path is not null) or
    (kind = 'annotation' and annotation_id is not null)
  );

-- Uma anotação só pode ser vinculada uma vez por estudo (índice parcial: ignora
-- linhas text/file, onde annotation_id é nulo).
create unique index study_sources_annotation_uidx
  on public.study_sources (study_id, annotation_id)
  where annotation_id is not null;
