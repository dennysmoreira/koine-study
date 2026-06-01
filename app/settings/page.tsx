import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { hasUserGeminiKey } from '@/lib/user-settings';
import { GeminiKeyForm } from '@/components/GeminiKeyForm';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const hasKey = await hasUserGeminiKey();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
          ← Início
        </Link>
        <span className="max-w-[12rem] truncate text-xs text-neutral-500" title={user.email ?? ''}>
          {user.email}
        </span>
      </header>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-neutral-500">Inteligência artificial do estudo.</p>
      </div>

      <GeminiKeyForm hasKey={hasKey} />

      <p className="mt-4 text-xs text-neutral-400">
        Sem chave própria, o estudo com IA usa uma cota compartilhada (limitada) e, como rede de
        segurança, um provedor alternativo gratuito. Cadastrar sua chave evita o limite compartilhado.
      </p>
    </main>
  );
}
