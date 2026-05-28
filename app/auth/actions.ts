'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

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

  revalidatePath('/', 'layout');
  redirect('/');
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
    revalidatePath('/', 'layout');
    redirect('/');
  }
  return { message: 'Conta criada. Confirme o e-mail enviado para concluir o acesso.' };
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}
