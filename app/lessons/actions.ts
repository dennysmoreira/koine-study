'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getLesson } from '@/lib/lessons';

export interface ToggleResult {
  ok: boolean;
  error?: string;
  completed?: boolean;
}

// Marca/desmarca uma lição como concluída para o usuário autenticado.
// Em vez de apagar o registro ao desmarcar, gravamos status 'not_started'
// (mantém histórico e evita DELETE). A RLS (own_progress) isola por auth.uid().
export async function toggleLessonComplete(
  lessonId: string,
  completed: boolean,
): Promise<ToggleResult> {
  if (!getLesson(lessonId)) return { ok: false, error: 'Lição inválida.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sessão expirada. Entre novamente.' };

  const { error } = await supabase.from('study_progress').upsert(
    {
      user_id: user.id,
      lesson_id: lessonId,
      status: completed ? 'completed' : 'not_started',
      completed_at: completed ? new Date().toISOString() : null,
    },
    { onConflict: 'user_id,lesson_id' },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath('/lessons');
  revalidatePath(`/lessons/${lessonId}`);
  return { ok: true, completed };
}
