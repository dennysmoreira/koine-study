// Fallback de Suspense do comparador enquanto o capítulo paralelo é buscado.
export default function LoadingCompare() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
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
