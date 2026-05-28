import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getStudyQueue } from '@/lib/vocab';
import { VocabSession } from '@/components/VocabSession';

export const dynamic = 'force-dynamic';

export default async function VocabPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/vocab');

  const queue = await getStudyQueue();
  const dueCount = queue.filter((c) => !c.isNew).length;
  const newCount = queue.filter((c) => c.isNew).length;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
          ← Início
        </Link>
        <div className="flex gap-3 text-xs text-neutral-500">
          <span>Revisões: {dueCount}</span>
          <span>Novas: {newCount}</span>
        </div>
      </header>

      {queue.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="text-lg font-medium">Tudo em dia! 🎉</p>
          <p className="text-sm text-neutral-500">
            Nenhuma palavra para revisar agora. Volte mais tarde.
          </p>
        </div>
      ) : (
        <VocabSession queue={queue} />
      )}
    </main>
  );
}
