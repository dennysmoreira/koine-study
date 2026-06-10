import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPlan } from '@/lib/reading-plans';
import { getCustomPlan, parseCustomPlanId } from '@/lib/custom-plans';
import { getCompletedDays } from '@/lib/reading-progress';
import { getBooks } from '@/lib/corpus';
import { ReadingPlanDays } from '@/components/ReadingPlanDays';
import { DeletePlanButton } from '@/components/DeletePlanButton';

export const dynamic = 'force-dynamic';

export default async function ReadingPlanPage({ params }: { params: { plan: string } }) {
  // Fixo do catálogo OU personalizado (custom-N, resolvido sob RLS — plano de
  // outro usuário volta null e cai no 404).
  const plan = getPlan(params.plan) ?? (await getCustomPlan(params.plan));
  if (!plan) notFound();

  const isCustom = parseCustomPlanId(plan.id) != null;

  const [completed, books] = await Promise.all([getCompletedDays(plan.id), getBooks()]);
  const bookNames: Record<string, string> = Object.fromEntries(books.map((b) => [b.osis_code, b.name_pt]));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link href="/reading" className="text-sm text-neutral-500 hover:underline">
        ← Planos de leitura
      </Link>

      <div className="mt-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{plan.title}</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{plan.description}</p>
        </div>
        {isCustom && <DeletePlanButton planId={plan.id} />}
      </div>

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
