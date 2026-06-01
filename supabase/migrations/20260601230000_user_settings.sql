-- ════════════════════════════════════════════════════════════════════════
--  koine-study — configurações por usuário (BYOK: "traga sua própria chave")
--
--  Guarda a chave da API do Gemini de cada usuário, CRIPTOGRAFADA na aplicação
--  (AES-256-GCM, ver lib/crypto.ts) — o banco nunca vê a chave em claro. A RLS
--  isola por auth.uid() (cada usuário só lê/escreve a própria linha), de modo
--  que um vazamento de dump exporia apenas ciphertext sem a APP_SECRET_KEY.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  gemini_api_key_enc text,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

-- Dono (auth.uid()) faz tudo na própria linha; with_check garante que não dá
-- para gravar uma linha de outro usuário.
drop policy if exists "own_user_settings" on public.user_settings;
create policy "own_user_settings" on public.user_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
