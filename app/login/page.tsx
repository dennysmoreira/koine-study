import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/LoginForm';
import { createClient } from '@/lib/supabase/server';
import { safeNextPath } from '@/lib/safe-next';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const next = safeNextPath(searchParams.next);
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect(next ?? '/');

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-10">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Hermeneus</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Entre para salvar seus estudos e anotações.
        </p>
      </header>

      <LoginForm next={next} />

      {/* "Continuar sem conta" volta ao ponto de origem (next) quando houver —
          sem conta, o rascunho nao re-hidrata, mas o usuario nao perde o lugar. */}
      <Link
        href={next ?? '/'}
        className="mt-8 text-center text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
      >
        ← Continuar sem conta
      </Link>
    </main>
  );
}
