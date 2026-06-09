import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPlan } from '@/lib/reading-plans';
import { getCompletedDays } from '@/lib/reading-progress';
import { getBooks } from '@/lib/corpus';
import { ReadingPlanDays } from '@/components/ReadingPlanDays';

export const dynamic = 'force-dynamic';

export default async function ReadingPlanPage({ params }: { params: { plan: string } }) {
  const plan = getPlan(params.plan);
  if (!plan) notFound();

  const [completed, books] = await Promise.all([getCompletedDays(plan.id), getBooks()]);
  const bookNames: Record<string, string> = Object.fromEntries(books.map((b) => [b.osis_code, b.name_pt]));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link href="/reading" className="text-sm text-neutral-500 hover:underline">
        ← Planos de leitura
      </Link>

      <h1 className="mt-4 text-2xl font-bold">{plan.title}</h1>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{plan.description}</p>

      <div className="mt-6">
        <ReadingPlanDays
          planId={plan.id}
          days={plan.days}
          initialCompleted={[...completed]}
          bookNames={bookNames}
        />
      </div>
    </main>
  );
}
