import { createClient } from '@/lib/supabase/server';

// Conjunto de lesson_id concluídos pelo usuário autenticado.
// RLS (own_progress) garante que só vêm os registros do próprio auth.uid().
export async function getCompletedSet(): Promise<Set<string>> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();

  const { data, error } = await supabase
    .from('study_progress')
    .select('lesson_id')
    .eq('status', 'completed');
  if (error) throw new Error(`getCompletedSet: ${error.message}`);

  return new Set((data ?? []).map((r) => (r as { lesson_id: string }).lesson_id));
}
