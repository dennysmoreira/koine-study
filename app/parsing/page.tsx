import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getParsingQuestion } from '@/lib/parsing';
import { ParsingQuiz } from '@/components/ParsingQuiz';

export const dynamic = 'force-dynamic';

export default async function ParsingPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/parsing');

  const [{ count: total }, { count: correct }, question] = await Promise.all([
    supabase.from('quiz_attempts').select('id', { count: 'exact', head: true }),
    supabase.from('quiz_attempts').select('id', { count: 'exact', head: true }).eq('correct', true),
    getParsingQuestion(),
  ]);

  const accuracy = total && total > 0 ? Math.round(((correct ?? 0) / total) * 100) : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
          ← Início
        </Link>
        {accuracy !== null && (
          <span className="text-xs text-neutral-500">
            Acerto: {accuracy}% ({total})
          </span>
        )}
      </header>

      <ParsingQuiz first={question} />
    </main>
  );
}
