import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDictionaryEntry } from '@/lib/dictionary';
import { transliterate } from '@/lib/transliterate';
import { SpeakButton } from '@/components/SpeakButton';

export const dynamic = 'force-dynamic';

// Rótulos legíveis por fonte de léxico (coluna lexicon_entries.source).
const LEXICON_LABELS: Record<string, string> = {
  lsj: 'LSJ (Liddell-Scott-Jones)',
  thayers: "Thayer's",
  moulton_milligan: 'Moulton-Milligan',
};

export default async function DictionaryEntryPage({ params }: { params: { id: string } }) {
  const lemmaId = Number(params.id);
  if (!Number.isInteger(lemmaId) || lemmaId <= 0) notFound();

  const entry = await getDictionaryEntry(lemmaId);
  if (!entry) notFound();

  const isHebrew = entry.language === 'hbo';
  const bdb = entry.bdb_def_pt ?? entry.bdb_def;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-8">
      <header className="mb-6">
        <Link
          href={isHebrew ? '/dictionary?lang=hbo' : '/dictionary'}
          className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          ← Dicionário
        </Link>
      </header>

      <div className="rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
        {isHebrew ? (
          <>
            <h1 dir="rtl" className="font-hebrew text-5xl leading-none">
              {entry.lemma}
            </h1>
            <div className="mt-3 flex items-center gap-2">
              {entry.xlit && <p className="text-sm italic text-neutral-400">{entry.xlit}</p>}
              {entry.pron && <p className="text-xs text-neutral-400">/{entry.pron}/</p>}
              {/* sem voz hebraica instalada o fallback fala a romanização — sem
                  pron/xlit não haveria o que falar, então o botão nem aparece. */}
              {(entry.pron || entry.xlit) && (
                <SpeakButton text={entry.lemma} romanized={entry.pron ?? entry.xlit ?? ''} lang="hbo" />
              )}
            </div>
          </>
        ) : (
          <>
            <h1 className="font-greek text-4xl leading-none">{entry.lemma}</h1>
            <div className="mt-2 flex items-center gap-2">
              <p className="text-sm italic text-neutral-400">{transliterate(entry.lemma)}</p>
              <SpeakButton text={entry.lemma} romanized={transliterate(entry.lemma)} lang="grc" />
            </div>
          </>
        )}
        {entry.gloss_pt && <p className="mt-3 text-lg">{entry.gloss_pt}</p>}
        {entry.gloss_en && (
          <p className="mt-1 text-sm text-neutral-500">{entry.gloss_en}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
          {!isHebrew && <span>Aparece {entry.frequency}× no NT</span>}
          {entry.strongs && <span>Strong&apos;s {entry.strongs}</span>}
        </div>
      </div>

      <div className="mt-5">
        <Link
          href={`/dictionary/${lemmaId}/occurrences`}
          className="inline-flex min-h-[44px] items-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-400"
        >
          Ver todas as ocorrências →
        </Link>
      </div>

      {isHebrew && bdb && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            BDB (Brown-Driver-Briggs)
          </h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
            {bdb}
          </p>
        </section>
      )}

      {entry.abbott_smith && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            Abbott-Smith
          </h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
            {entry.abbott_smith}
          </p>
        </section>
      )}

      {entry.lexicon.map((lex) => (
        <section key={lex.source} className="mt-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-400">
            {LEXICON_LABELS[lex.source] ?? lex.source}
          </h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
            {lex.text_pt ?? lex.text_en}
          </p>
        </section>
      ))}
    </main>
  );
}
