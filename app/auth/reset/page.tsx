import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ResetPasswordForm } from '@/components/ResetPasswordForm';

export const dynamic = 'force-dynamic';

/**
 * Destino do link de recuperação de senha: o /auth/callback troca o code do
 * e-mail por uma sessão (de recuperação) e redireciona para cá, onde o usuário
 * define a nova senha. Sem sessão (link expirado/aberto direto), orienta a pedir
 * um novo link em vez de mostrar um formulário que falharia no envio.
 */
export default async function ResetPasswordPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-10">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Nova senha</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {user ? `Defina a nova senha de ${user.email ?? 'sua conta'}.` : 'Link de recuperação inválido.'}
        </p>
      </header>

      {user ? (
        <ResetPasswordForm />
      ) : (
        <div className="text-center text-sm text-neutral-500">
          <p>Este link de recuperação expirou ou já foi usado.</p>
          <Link
            href="/login"
            className="mt-4 inline-block rounded-lg bg-neutral-900 px-4 py-2.5 font-medium text-white transition dark:bg-white dark:text-neutral-900"
          >
            Pedir um novo link
          </Link>
        </div>
      )}
    </main>
  );
}
