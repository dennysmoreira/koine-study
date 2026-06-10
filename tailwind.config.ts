import type { Config } from 'tailwindcss';

const config: Config = {
  // lib/ entra no scan: módulos de dados puros (ex.: highlight-colors) declaram
  // classes Tailwind completas que o JIT precisa ver para gerar o CSS.
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
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
