'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/safe-next';

export interface AuthState {
  error?: string;
  message?: string;
}

function readCredentials(formData: FormData): { email: string; password: string } {
  return {
    email: String(formData.get('email') ?? '').trim(),
    password: String(formData.get('password') ?? ''),
  };
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password } = readCredentials(formData);
  if (!email || !password) return { error: 'Informe e-mail e senha.' };

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: 'E-mail ou senha inválidos.' };

  // `next` traz o usuario de volta de onde veio (ex.: o capitulo onde tentou
  // anotar sem conta). safeNextPath barra open redirect.
  const next = safeNextPath(formData.get('next') as string | null);
  revalidatePath('/', 'layout');
  redirect(next ?? '/');
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password } = readCredentials(formData);
  if (!email || !password) return { error: 'Informe e-mail e senha.' };
  if (password.length < 8) return { error: 'A senha deve ter ao menos 8 caracteres.' };

  const supabase = createClient();
  const origin = headers().get('origin') ?? '';
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { error: error.message };

  // Sessão imediata (confirmação de e-mail desativada no projeto) → entra direto.
  if (data.session) {
    const next = safeNextPath(formData.get('next') as string | null);
    revalidatePath('/', 'layout');
    redirect(next ?? '/');
  }
  return { message: 'Conta criada. Confirme o e-mail enviado para concluir o acesso.' };
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}

/**
 * "Esqueci minha senha": envia o e-mail de recuperação. O link do e-mail passa
 * pelo /auth/callback (troca o code por uma sessão de recuperação) e segue para
 * /auth/reset, onde o usuário define a nova senha.
 *
 * A resposta é a MESMA com e-mail cadastrado ou não — não revelar quais e-mails
 * têm conta (enumeração de usuários).
 */
export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) return { error: 'Informe seu e-mail.' };
  // Guarda mínima de formato (a action é chamável fora do form): rejeita só o
  // claramente inválido — não revela nada sobre e-mails cadastrados.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Informe um e-mail válido.' };

  const supabase = createClient();
  const origin = headers().get('origin') ?? '';
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/auth/reset`,
  });

  return {
    message: 'Se este e-mail tiver uma conta, você receberá um link de recuperação. Confira também o spam.',
  };
}

/**
 * Define a nova senha do usuário da sessão atual (a sessão de recuperação criada
 * pelo link do e-mail). Sem sessão → o link expirou ou já foi usado.
 */
export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');
  if (password.length < 8) return { error: 'A senha deve ter ao menos 8 caracteres.' };
  if (password !== confirm) return { error: 'As senhas não conferem.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Link expirado ou já usado. Peça um novo em "Esqueci minha senha".' };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    // ex.: nova senha igual à anterior — devolve a mensagem do provedor.
    return { error: error.message };
  }

  revalidatePath('/', 'layout');
  redirect('/');
}
