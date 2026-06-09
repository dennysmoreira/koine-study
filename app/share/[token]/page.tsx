import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPublicSnapshot, type StudySnapshot, type AnnotationSnapshot } from '@/lib/shared-studies';

// Conteúdo é por-token e vem de dados do usuário; sem cache estático.
export const dynamic = 'force-dynamic';

// Conteúdo pessoal compartilhado por link: não indexar em buscadores.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const SOURCE_ICON: Record<string, string> = { text: '📄', file: '📎', annotation: '📝' };

function StudyView({ s }: { s: StudySnapshot }) {
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
        <span aria-hidden>{s.modeIcon}</span>
        <span>{s.modeLabel}</span>
        {s.reference && (
          <>
            <span>·</span>
            <span>
              {s.reference.bookName} {s.reference.chapter}
            </span>
          </>
        )}
      </div>

      <h1 className="mb-4 text-2xl font-semibold tracking-tight">{s.title}</h1>

      {s.prompt && (
        <p className="mb-4 rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-300">
          <span className="font-medium">Orientação:</span> {s.prompt}
        </p>
      )}

      {s.legacyContent && (
        <article className="mb-6 whitespace-pre-wrap break-words rounded-lg bg-neutral-50 px-4 py-3 text-[15px] leading-relaxed dark:bg-neutral-800/50">
          {s.legacyContent}
        </article>
      )}

      {s.references.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Passagens citadas</h2>
          <div className="flex flex-wrap gap-2">
            {s.references.map((r) => (
              <span
                key={r.ref}
                className="rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100"
              >
                {r.ref}
              </span>
            ))}
          </div>
        </section>
      )}

      {s.sources.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Fontes</h2>
          <ul className="space-y-1 text-sm text-neutral-600 dark:text-neutral-300">
            {s.sources.map((src, i) => (
              <li key={`${src.kind}-${i}`} className="flex items-center gap-2">
                <span aria-hidden>{SOURCE_ICON[src.kind] ?? '📄'}</span>
                <span>{src.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {s.messages.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Conversa</h2>
          {s.messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === 'user'
                  ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-amber-500 px-4 py-2 text-[15px] text-white'
                  : 'mr-auto max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-neutral-100 px-4 py-2 text-[15px] leading-relaxed text-neutral-800 dark:bg-neutral-800 dark:text-neutral-100'
              }
            >
              {m.content}
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function AnnotationView({ s }: { s: AnnotationSnapshot }) {
  return (
    <>
      <div className="mb-2 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
        <span aria-hidden>📝</span>
        <span>Anotação</span>
      </div>

      <h1 className="mb-4 text-2xl font-semibold tracking-tight">{s.title}</h1>

      <article className="whitespace-pre-wrap break-words rounded-lg bg-neutral-50 px-4 py-3 text-[15px] leading-relaxed dark:bg-neutral-800/50">
        {s.body}
      </article>

      {s.crossRefs.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Referências relacionadas</h2>
          <div className="flex flex-wrap gap-2">
            {s.crossRefs.map((r) => (
              <span
                key={r.ref}
                className="rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100"
              >
                {r.ref}
              </span>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export default async function SharePage({ params }: { params: { token: string } }) {
  const result = await getPublicSnapshot(params.token);
  if (!result) notFound();

  const { snapshot, snapshotAt } = result;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          koiné
        </Link>
        <a
          href={`/share/${params.token}/pdf`}
          className="inline-flex min-h-[44px] items-center rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
        >
          <span aria-hidden>⬇️</span>&nbsp;Baixar PDF
        </a>
      </header>

      {snapshot.kind === 'study' ? <StudyView s={snapshot} /> : <AnnotationView s={snapshot} />}

      <footer className="mt-10 border-t border-neutral-200 pt-4 text-xs text-neutral-500 dark:text-neutral-400 dark:border-neutral-800">
        Compartilhado de <span className="font-medium">koiné</span> · snapshot de {dateFmt.format(new Date(snapshotAt))}
      </footer>
    </main>
  );
}
