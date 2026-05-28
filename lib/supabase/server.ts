import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

type CookieToSet = { name: string; value: string; options: CookieOptions };

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env (anon key em Supabase → Project Settings → API).',
  );
}

// Cliente Supabase com sessão por cookie, para Server Components / Route Handlers /
// Server Actions. Respeita RLS: anônimo lê o corpus público; usuário autenticado
// (auth.uid()) acessa os próprios dados (srs_cards, profiles…).
// A anon key é pública por design — nunca usar service_role aqui.
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(url!, anonKey!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        // Em Server Components a escrita de cookies lança; o middleware é quem
        // renova a sessão, então aqui ignoramos o erro com segurança.
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          /* chamado de um Server Component — ignorar */
        }
      },
    },
  });
}
