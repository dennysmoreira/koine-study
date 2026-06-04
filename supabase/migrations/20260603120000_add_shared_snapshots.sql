-- ════════════════════════════════════════════════════════════════════════
--  koine-study — compartilhamento por link público (snapshot congelado)
--
--  Permite compartilhar um ESTUDO (workspace + chat IA) ou uma ANOTAÇÃO via
--  link público read-only. Tudo no app é privado por RLS (auth.uid() = user_id);
--  para abrir uma saída controlada sem afrouxar nenhuma policy, gravamos um
--  SNAPSHOT CONGELADO do conteúdo em `shared_snapshots.payload` (jsonb) e expomos
--  a leitura pública por UMA função SECURITY DEFINER que devolve só a linha do
--  token. Assim:
--    • edições futuras NÃO vazam (o snapshot é uma cópia do momento do compartilhamento);
--    • o caminho de leitura pública é explícito e single-row (a RPC), não uma
--      policy ampla de SELECT (que permitiria enumerar snapshots alheios);
--    • o dono gerencia/revoga os próprios links via RLS normal.
--
--  Um link estável por (usuário, tipo, item): re-compartilhar faz upsert e
--  atualiza o snapshot mantendo o mesmo token.
-- ════════════════════════════════════════════════════════════════════════

create table public.shared_snapshots (
  id           bigint generated always as identity primary key,
  token        text   not null unique,
  user_id      uuid   not null references auth.users(id) on delete cascade,
  kind         text   not null check (kind in ('study', 'annotation')),
  -- id de origem (saved_studies.id ou annotations.id). Polimórfico, sem FK: o
  -- snapshot é independente da fonte por design (congelado). As actions de
  -- exclusão removem o snapshot correspondente para não vazar link após delete.
  source_id    bigint not null,
  title        text   not null,
  -- Conteúdo congelado renderizável (forma definida em lib/shared-studies.ts).
  payload      jsonb  not null,
  snapshot_at  timestamptz not null default now(),
  unique (user_id, kind, source_id)
);
create index shared_snapshots_owner_idx on public.shared_snapshots (user_id, snapshot_at desc);

alter table public.shared_snapshots enable row level security;
-- Dono gerencia os próprios links (listar/criar/atualizar/revogar). A leitura
-- pública NÃO passa por policy: é só pela RPC SECURITY DEFINER abaixo.
create policy "own_shared_snapshots" on public.shared_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Leitura pública por token. SECURITY DEFINER roda como o dono da função (admin),
-- que ignora RLS, então devolve a linha mesmo para anônimos — mas SÓ a do token
-- informado (filtro + limit 1). search_path fixo evita sequestro de resolução.
create or replace function public.get_shared_snapshot(p_token text)
returns table (kind text, title text, payload jsonb, snapshot_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.kind, s.title, s.payload, s.snapshot_at
  from public.shared_snapshots s
  where s.token = p_token
  limit 1;
$$;

-- Só a RPC é exposta publicamente; o acesso direto à tabela segue restrito à RLS.
revoke all on function public.get_shared_snapshot(text) from public;
grant execute on function public.get_shared_snapshot(text) to anon, authenticated;
