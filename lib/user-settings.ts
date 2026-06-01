/**
 * Acesso server-only às configurações do usuário (user_settings). Hoje guarda a
 * chave da API do Gemini no fluxo BYOK ("traga sua própria chave"): cada usuário
 * usa a própria cota gratuita do Google AI Studio, sem custo nem limite de cota
 * para quem hospeda o app.
 *
 * A chave é gravada CRIPTOGRAFADA (lib/crypto.ts) e isolada por RLS (auth.uid()).
 */
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { decryptSecret } from '@/lib/crypto';

/**
 * Retorna a chave Gemini do usuário logado em claro, ou null se não houver
 * (ou se a descriptografia falhar — nesse caso o chamador cai para as chaves
 * compartilhadas / Groq). NUNCA exponha o retorno ao cliente.
 */
export async function getUserGeminiKey(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('user_settings')
    .select('gemini_api_key_enc')
    .eq('user_id', user.id)
    .maybeSingle();
  const enc = (data as { gemini_api_key_enc: string | null } | null)?.gemini_api_key_enc;
  return decryptSecret(enc);
}

/**
 * Status para a UI: apenas se há uma chave configurada (NUNCA devolve a chave).
 * Evita trafegar o segredo até o cliente só para mostrar "configurada / não".
 */
export async function hasUserGeminiKey(): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('user_settings')
    .select('gemini_api_key_enc')
    .eq('user_id', user.id)
    .maybeSingle();
  return !!(data as { gemini_api_key_enc: string | null } | null)?.gemini_api_key_enc;
}
