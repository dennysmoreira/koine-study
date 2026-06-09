import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDictionaryEntry } from '@/lib/dictionary';
import { getConcordance, type Occurrence } from '@/lib/concordance';
import { transliterate } from '@/lib/transliterate';

export const dynamic = 'force-dynamic';

// Agrupa ocorrências consecutivas por livro (já vêm em ordem canônica), para
// renderizar cabeçalhos de livro sem reordenar.
function groupByBook(occ: Occurrence[]): { osis: string; bookName: string; items: Occurrence[] }[] {
  const groups: { osis: string; bookName: string; items: Occurrence[] }[] = [];
  for (const o of occ) {
    const last = groups[groups.length - 1];
    if (last && last.osis === o.osis) last.items.push(o);
    else groups.push({ osis: o.osis, bookName: o.bookName, items: [o] });
  }
  return groups;
}

export default async function OccurrencesPage({ params }: { params: { id: string } }) {
  const lemmaId = Number(params.id);
  if (!Number.isInteger(lemmaId) || lemmaId <= 0) notFound();

  const [entry, concordance] = await Promise.all([getDictionaryEntry(lemmaId), getConcordance(lemmaId)]);
  if (!entry) notFound();

  const isHebrew = entry.language === 'hbo';
  const groups = groupByBook(concordance.occurrences);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-8">
      <header className="mb-6">
        <Link
          href={`/dictionary/${lemmaId}`}
          className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          ← {entry.lemma}
        </Link>
      </header>

      <div className="mb-6">
        <h1 className={isHebrew ? 'font-hebrew text-3xl' : 'font-greek text-2xl'} dir={isHebrew ? 'rtl' : undefined}>
          {entry.lemma}
        </h1>
        <p className="mt-1 text-sm italic text-neutral-500 dark:text-neutral-400">
          {isHebrew ? entry.xlit : transliterate(entry.lemma)}
          {entry.gloss_pt ? ` · ${entry.gloss_pt}` : ''}
        </p>
        <p className="mt-2 text-sm font-medium">
          {concordance.total} ocorrência{concordance.total === 1 ? '' : 's'} no corpus
          {concordance.truncated && (
            <span className="font-normal text-neutral-500 dark:text-neutral-400">
              {' '}
              · mostrando as primeiras {concordance.occurrences.length} em ordem canônica
            </span>
          )}
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          Nenhuma ocorrência encontrada no corpus.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <section key={g.osis}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                {g.bookName} <span className="font-normal">({g.items.length})</span>
              </h2>
              <ul className="flex flex-col gap-1">
                {g.items.map((o, i) => (
                  <li key={`${o.chapter}:${o.verse}-${i}`}>
                    <Link
                      href={`/compare/${o.osis}/${o.chapter}?goto=${o.verse}`}
                      className="flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-neutral-100 dark:hover:bg-neutral-800/60"
                    >
                      <span className="shrink-0 text-sm font-medium tabular-nums text-amber-700 dark:text-amber-400">
                        {o.chapter}:{o.verse}
                      </span>
                      <span
                        className={`min-w-0 flex-1 truncate ${isHebrew ? 'font-hebrew text-right' : 'font-greek'}`}
                        dir={isHebrew ? 'rtl' : undefined}
                      >
                        {o.surface}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
