import Link from 'next/link';

export interface Activity {
  href: string;
  icon: string; // emoji
  title: string;
  description: string;
  // Classes completas (literais para o JIT do Tailwind) do chip do ícone.
  iconClass: string;
}

// Card de atividade: chip de ícone colorido + título + descrição. Pensado para
// escaneabilidade — a cor/ícone identificam a atividade num relance.
export function ActivityCard({ activity }: { activity: Activity }) {
  return (
    <Link
      href={activity.href}
      className="group flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 transition active:scale-[0.98] hover:border-neutral-300 hover:shadow-sm dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${activity.iconClass}`}
        aria-hidden
      >
        {activity.icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-base font-medium leading-tight">{activity.title}</span>
        <span className="mt-0.5 text-sm text-neutral-500">{activity.description}</span>
      </span>
      <span
        aria-hidden
        className="ml-auto text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-neutral-400 dark:text-neutral-600"
      >
        →
      </span>
    </Link>
  );
}
