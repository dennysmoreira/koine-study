import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/LoginForm';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect('/');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-10">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Koiné Study</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Entre para salvar seu vocabulário e progresso.
        </p>
      </header>

      <LoginForm />

      <Link href="/" className="mt-8 text-center text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
        ← Continuar sem conta
      </Link>
    </main>
  );
}
