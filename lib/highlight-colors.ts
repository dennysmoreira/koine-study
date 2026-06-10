/**
 * Cores de destaque (marca-texto) — módulo de DADOS PUROS (sem imports server-only)
 * para ser compartilhado entre o cliente (seletor de cor, tinta das linhas) e o
 * servidor (validação nas actions, leituras).
 */

export const HIGHLIGHT_COLORS = ['yellow', 'green', 'blue', 'pink', 'purple'] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export function isHighlightColor(value: unknown): value is HighlightColor {
  return typeof value === 'string' && (HIGHLIGHT_COLORS as readonly string[]).includes(value);
}

/** Bolinha do seletor de cor (classes completas para o JIT do Tailwind). */
export const HIGHLIGHT_DOT: Record<HighlightColor, string> = {
  yellow: 'bg-yellow-300',
  green: 'bg-green-300',
  blue: 'bg-sky-300',
  pink: 'bg-pink-300',
  purple: 'bg-violet-300',
};

/** Rótulo PT da cor (acessibilidade do seletor). */
export const HIGHLIGHT_LABEL: Record<HighlightColor, string> = {
  yellow: 'Amarelo',
  green: 'Verde',
  blue: 'Azul',
  pink: 'Rosa',
  purple: 'Roxo',
};
