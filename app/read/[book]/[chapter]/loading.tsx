// Fallback de Suspense exibido enquanto o capítulo é buscado (cache miss).
// Torna a navegação instantânea na percepção do usuário.
export default function LoadingChapter() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-8 h-4 w-16 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="mb-6 h-8 w-48 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-5 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800"
            style={{ width: `${70 + ((i * 7) % 30)}%` }}
          />
        ))}
      </div>
    </main>
  );
}
