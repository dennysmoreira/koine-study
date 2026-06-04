import Link from 'next/link';
import { getAnnotations } from '@/lib/annotations-server';
import { AnnotationsList } from '@/components/AnnotationsList';
import { getShareTokens } from '@/app/share/actions';

// As anotações são dados do usuário (RLS) e mudam a cada edição/remoção; sem cache.
export const dynamic = 'force-dynamic';

export default async function AnnotationsPage() {
  const annotations = await getAnnotations();
  // Tokens de link já existentes (mapa id → token), em UMA query, para cada
  // ShareButton da lista refletir o estado certo sem regenerar o snapshot.
  const shareTokens = await getShareTokens('annotation', annotations.map((a) => a.id));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 pb-24">
      <Link href="/" className="text-sm text-neutral-500 hover:underline">
        ← Início
      </Link>

      <h1 className="mt-4 flex items-center gap-2 text-2xl font-bold">
        <span aria-hidden>📝</span> Anotações
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        Suas observações pessoais sobre as passagens, feitas no comparador.
      </p>

      <div className="mt-6">
        {annotations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-500 dark:border-neutral-700">
            Você ainda não tem anotações. Abra o{' '}
            <Link href="/compare" className="font-medium text-amber-600 hover:underline dark:text-amber-400">
              comparador
            </Link>
            , selecione um ou mais versículos e toque em “✍️ Anotar”.
          </p>
        ) : (
          <AnnotationsList annotations={annotations} shareTokens={shareTokens} />
        )}
      </div>
    </main>
  );
}
