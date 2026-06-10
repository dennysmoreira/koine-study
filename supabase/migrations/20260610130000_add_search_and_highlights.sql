-- ── Busca no texto bíblico (full-text search) ───────────────────────────────
-- Índice GIN de expressão com a config 'portuguese' (stemming/stopwords PT).
-- O PostgREST monta to_tsvector('portuguese', text) @@ websearch_to_tsquery(...)
-- quando o cliente usa textSearch(config: 'portuguese'), casando com este índice.
-- O texto grego/hebraico também é indexado, mas a busca filtra por
-- translation_code de uma tradução PT — o índice extra é inofensivo.
create index verse_texts_text_fts_idx
  on public.verse_texts
  using gin (to_tsvector('portuguese', text));

-- ── Destaques (marca-texto) ──────────────────────────────────────────────────
-- Um destaque por (usuário, versículo) — trocar a cor é um upsert, não acumula.
-- Eixo de display (mesmo dos annotations): osis + chapter + verse protestantes.
create table public.highlights (
  id         bigint generated always as identity primary key,
  user_id    uuid     not null references auth.users(id) on delete cascade,
  osis       text     not null,
  chapter    smallint not null,
  verse      smallint not null,
  color      text     not null,
  created_at timestamptz not null default now(),
  constraint highlights_color_valid check (color in ('yellow','green','blue','pink','purple')),
  constraint highlights_unique_verse unique (user_id, osis, chapter, verse)
);

create index highlights_user_loc_idx on public.highlights (user_id, osis, chapter);

alter table public.highlights enable row level security;
create policy "own_highlights" on public.highlights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
