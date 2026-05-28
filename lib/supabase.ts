import 'server-only';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Defina SUPABASE_URL e SUPABASE_ANON_KEY no .env.local (anon key em Supabase → Project Settings → API).',
  );
}

// Anon key respeita RLS: as tabelas do corpus têm policy de leitura pública (corpus_read).
// Nunca usar service_role no frontend — ela ignora RLS.
// `cache: 'no-store'` evita que o Next memoize as respostas do PostgREST (App Router
// cacheia fetch() por padrão), garantindo leitura sempre fresca do corpus.
export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false },
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
  },
});
