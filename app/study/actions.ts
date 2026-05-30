'use server';

/**
 * Server Actions dos "estudos salvos": gravar e remover.
 * Toda escrita passa pela RLS (own_studies), isolando por auth.uid().
 */
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isStudyMode, getStudyMode } from '@/lib/study-modes';

export interface SaveStudyInput {
  osis: string;
  chapter: number;
  bookName: string;
  mode: string;
  prompt?: string;
  codes?: string[];
  content: string;
}

export interface SaveStudyResult {
  ok: boolean;
  id?: number;
  error?: string;
}

// Deriva um título curto: 1ª linha de cabeçalho Markdown do conteúdo; senão,
// rótulo do modo + referência. Mantém a listagem legível sem abrir o estudo.
function deriveTitle(content: string, mode: string, bookName: string, chapter: number): string {
  const heading = content
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('#'));
  if (heading) {
    const clean = heading.replace(/^#+\s*/, '').replace(/[*_`]/g, '').trim();
    if (clean) return clean.slice(0, 120);
  }
  const label = isStudyMode(mode) ? getStudyMode(mode).label : 'Estudo';
  return `${label} — ${bookName} ${chapter}`;
}

export async function saveStudy(input: SaveStudyInput): Promise<SaveStudyResult> {
  const content = input.content?.trim();
  if (!content) return { ok: false, error: 'Nada para salvar.' };
  if (!isStudyMode(input.mode)) return { ok: false, error: 'Modo inválido.' };
  if (!input.osis || !Number.isInteger(input.chapter) || input.chapter < 1) {
    return { ok: false, error: 'Referência inválida.' };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login para salvar estudos.' };

  const { data, error } = await supabase
    .from('saved_studies')
    .insert({
      user_id: user.id,
      osis: input.osis,
      chapter: input.chapter,
      book_name: input.bookName,
      mode: input.mode,
      title: deriveTitle(content, input.mode, input.bookName, input.chapter),
      prompt: input.prompt?.trim() || null,
      codes: input.codes ?? [],
      content,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'Falha ao salvar.' };

  revalidatePath('/studies');
  return { ok: true, id: (data as { id: number }).id };
}

export async function deleteStudy(id: number): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(id)) return { ok: false, error: 'Id inválido.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sessão expirada. Entre novamente.' };

  // RLS (own_studies) garante que só o dono apaga o próprio registro.
  const { error } = await supabase.from('saved_studies').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/studies');
  return { ok: true };
}
