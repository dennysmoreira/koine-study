import type { Config } from 'tailwindcss';

const config: Config = {
  // lib/ entra no scan: módulos de dados puros (ex.: highlight-colors) declaram
  // classes Tailwind completas que o JIT precisa ver para gerar o CSS.
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Tokens semânticos (valores em app/globals.css, trocados por tema). Usar
      // `bg-surface`/`text-muted`/`border-line` em vez de repetir o par
      // claro/escuro `bg-white dark:bg-neutral-900` etc.
      colors: {
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-muted': 'rgb(var(--surface-muted) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
      },
      fontFamily: {
        greek: ['var(--font-greek)', 'Gentium Plus', 'Georgia', 'serif'],
        hebrew: [
          'var(--font-hebrew)',
          'SBL Hebrew',
          'Ezra SIL',
          'Taamey Frank CLM',
          'Frank Ruhl Libre',
          'David',
          'serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
