-- ════════════════════════════════════════════════════════════════════════
--  koine-study — referências cruzadas (Treasury of Scripture Knowledge)
--
--  Dataset openbible.info (TSK agregado por votos da comunidade), CC-BY. Cada
--  linha liga um versículo de ORIGEM a um versículo/faixa de DESTINO, com um
--  peso de relevância (votes). As referências usam a versificação protestante
--  (= nosso eixo de DISPLAY), então não precisam de remapeamento.
--
--  ~344k linhas; leitura pública (corpus); escrita só via service_role no ETL.
-- ════════════════════════════════════════════════════════════════════════

create table public.cross_references (
  id             bigint generated always as identity primary key,
  from_osis      text     not null,
  from_chapter   smallint not null,
  from_verse     smallint not null,
  to_osis        text     not null,
  to_chapter     smallint not null,
  to_verse_start smallint not null,
  to_verse_end   smallint not null,
  votes          integer  not null default 0
);

-- Busca pelo versículo de origem, já ordenando os destinos por relevância.
create index cross_references_from_idx
  on public.cross_references (from_osis, from_chapter, from_verse, votes desc);

alter table public.cross_references enable row level security;
create policy "corpus_read" on public.cross_references for select using (true);
