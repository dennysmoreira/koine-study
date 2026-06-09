-- ════════════════════════════════════════════════════════════════════════
--  koine-study — progresso dos planos de leitura
--
--  O catálogo de planos é estático (lib/reading-plans.ts); aqui guardamos só o
--  PROGRESSO do usuário: quais dias de qual plano ele concluiu. Uma linha por
--  dia concluído (esparso); ausência = não concluído. RLS por auth.uid().
-- ════════════════════════════════════════════════════════════════════════

create table public.reading_progress (
  id           bigint generated always as identity primary key,
  user_id      uuid     not null references auth.users(id) on delete cascade,
  plan_id      text     not null,
  day          smallint not null,
  completed_at timestamptz not null default now(),
  unique (user_id, plan_id, day)
);
create index reading_progress_user_plan_idx on public.reading_progress (user_id, plan_id);

alter table public.reading_progress enable row level security;
create policy "own_reading_progress" on public.reading_progress
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
