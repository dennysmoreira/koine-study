// Fallback de Suspense do comparador enquanto o capítulo é buscado.
//
// Espelha a ESTRUTURA do leitor (cabeçalho + legenda de versões + blocos de
// versículo alternando original/tradução) em vez de um esqueleto genérico: na
// troca de capítulo a tela mantém a mesma forma, então a transição parece
// "conteúdo carregando no lugar" e não a página inteira piscando para um branco.
export default function LoadingCompare() {
  const bar = 'animate-pulse rounded bg-neutral-200 dark:bg-neutral-800';
  return (
    <div className="w-full">
      {/* Cabeçalho: título do capítulo + linha de ações (Estudo + ⋯). */}
      <header className="border-b border-line px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className={`h-4 w-12 ${bar}`} />
          <div className={`h-5 w-24 ${bar}`} />
          <div className={`h-4 w-12 ${bar}`} />
        </div>
        <div className="mx-auto mt-2 flex max-w-5xl items-center gap-3">
          <div className={`h-6 w-20 ${bar}`} />
          <div className={`ml-auto h-6 w-6 ${bar}`} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-5">
        {/* Legenda de versões. */}
        <div className={`mb-4 h-3 w-44 ${bar}`} />

        {/* Blocos de versículo: linha "original" (mais larga) + "tradução". */}
        <div className="flex flex-col gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className={`h-4 ${bar}`} style={{ width: `${82 - ((i * 9) % 22)}%` }} />
              <div className={`h-4 ${bar}`} style={{ width: `${74 - ((i * 11) % 28)}%` }} />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
