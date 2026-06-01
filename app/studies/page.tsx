import Link from 'next/link';
import { getSavedStudies } from '@/lib/saved-studies';
import { getStudyMode } from '@/lib/study-modes';
import { NewStudyButton } from '@/components/NewStudyButton';
import { StudyListItem } from '@/components/StudyListItem';

export const dynamic = 'force-dynamic';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

export default async function StudiesPage() {
  const studies = await getSavedStudies();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
          ← Início
        </Link>
        <span className="text-xs text-neutral-500">{studies.length} salvos</span>
      </header>

      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Estudos salvos</h1>
          <p className="text-sm text-neutral-500">Seus workspaces e os textos gerados no comparador com IA.</p>
        </div>
        <NewStudyButton />
      </div>

      {studies.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
          <p className="text-sm text-neutral-500">
            Nenhum estudo salvo ainda. Abra o comparador, gere um estudo com IA e toque em
            <span className="font-medium"> Salvar</span>.
          </p>
          <Link
            href="/compare"
            className="mt-4 inline-block rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600"
          >
            Abrir comparador
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {studies.map((s) => {
            const meta = getStudyMode(s.mode);
            return (
              <StudyListItem
                key={s.id}
                study={{
                  id: s.id,
                  title: s.title,
                  icon: meta.icon,
                  subtitle: s.bookName && s.chapter ? `${s.bookName} ${s.chapter}` : null,
                  dateLabel: dateFmt.format(new Date(s.createdAt)),
                }}
              />
            );
          })}
        </ul>
      )}
    </main>
  );
}
