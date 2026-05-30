import Link from 'next/link';
import { AlphabetGame } from '@/components/AlphabetGame';

export const metadata = {
  title: 'Alfabeto · Koiné Study',
};

export default function AlphabetPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <Link
          href="/"
          className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
        >
          ← Início
        </Link>
        <span className="text-xs text-neutral-400">Jogo · alfabeto</span>
      </header>

      <AlphabetGame />
    </main>
  );
}
