import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
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
