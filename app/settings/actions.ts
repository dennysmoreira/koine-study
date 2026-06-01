'use server';

/**
 * Server Actions das configurações do usuário (BYOK). Gravam/removem a chave da
 * API do Gemini, sempre CRIPTOGRAFADA (lib/crypto.ts). A RLS (own_user_settings)
 * isola por auth.uid(); a action é a fronteira de confiança que valida o formato.
 */
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { encryptSecret } from '@/lib/crypto';

// Chaves do Google AI Studio começam com "AIza" e têm ~39 chars. Validação leve
// (formato), não semântica: uma chave bem-formada mas revogada só falhará na
// geração, quando o failover cai para as chaves compartilhadas / Groq.
const GEMINI_KEY_RE = /^AIza[\w\-]{30,80}$/;

export async function saveGeminiKey(key: string): Promise<{ ok: boolean; error?: string }> {
  const clean = key?.trim();
  if (!clean) return { ok: false, error: 'Cole sua chave do Gemini.' };
  if (!GEMINI_KEY_RE.test(clean)) {
    return { ok: false, error: 'Chave inválida. Ela começa com "AIza" (Google AI Studio → API key).' };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login para salvar a chave.' };

  let enc: string;
  try {
    enc = encryptSecret(clean);
  } catch (e) {
    // APP_SECRET_KEY ausente/ inválida: BYOK fica indisponível até configurá-la.
    return { ok: false, error: e instanceof Error ? e.message : 'Falha ao cifrar a chave.' };
  }

  const { error } = await supabase
    .from('user_settings')
    .upsert(
      { user_id: user.id, gemini_api_key_enc: enc, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings');
  return { ok: true };
}

export async function removeGeminiKey(): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sessão expirada. Entre novamente.' };

  const { error } = await supabase
    .from('user_settings')
    .update({ gemini_api_key_enc: null, updated_at: new Date().toISOString() })
    .eq('user_id', user.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings');
  return { ok: true };
}
