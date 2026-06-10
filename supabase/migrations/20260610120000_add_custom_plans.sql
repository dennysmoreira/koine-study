-- Planos de leitura PERSONALIZADOS: o usuário escolhe os livros e o ritmo
-- (capítulos/dia). Os DIAS não são armazenados — são derivados de forma
-- determinística (books + per_day) pela mesma lógica dos planos fixos
-- (lib/reading-plans.buildPlanDays), então a tabela guarda só a "receita".
-- O progresso reusa reading_progress com plan_id = 'custom-{id}'.
create table public.custom_plans (
  id         bigint generated always as identity primary key,
  user_id    uuid     not null references auth.users(id) on delete cascade,
  title      text     not null,
  -- códigos OSIS em ordem canônica (validados na server action)
  books      text[]   not null,
  per_day    smallint not null default 1,
  created_at timestamptz not null default now(),
  constraint custom_plans_title_len check (char_length(title) between 1 and 80),
  constraint custom_plans_per_day_range check (per_day between 1 and 10),
  constraint custom_plans_books_nonempty check (array_length(books, 1) >= 1)
);

create index custom_plans_user_idx on public.custom_plans (user_id);

alter table public.custom_plans enable row level security;
create policy "own_custom_plans" on public.custom_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
