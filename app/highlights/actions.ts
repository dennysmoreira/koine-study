'use server';

/**
 * Server Actions de DESTAQUES (marca-texto): aplicar uma cor a versículos
 * selecionados (upsert — trocar a cor não duplica) e remover. RLS
 * (own_highlights) isola por auth.uid(); validação na borda.
 */
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isHighlightColor } from '@/lib/highlight-colors';

// Teto de versículos por aplicação (um capítulo inteiro grande cabe).
const MAX_VERSES = 200;

function validVerses(verses: unknown): number[] {
  if (!Array.isArray(verses)) return [];
  return [...new Set(verses.filter((v): v is number => Number.isInteger(v) && (v as number) >= 1))];
}

export async function applyHighlight(
  osis: string,
  chapter: number,
  verses: number[],
  color: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!osis || !Number.isInteger(chapter) || chapter < 1) return { ok: false, error: 'Passagem inválida.' };
  if (!isHighlightColor(color)) return { ok: false, error: 'Cor inválida.' };
  const list = validVerses(verses);
  if (list.length === 0) return { ok: false, error: 'Selecione ao menos um versículo.' };
  if (list.length > MAX_VERSES) return { ok: false, error: 'Seleção grande demais.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login para destacar.' };

  const rows = list.map((verse) => ({ user_id: user.id, osis, chapter, verse, color }));
  const { error } = await supabase
    .from('highlights')
    .upsert(rows, { onConflict: 'user_id,osis,chapter,verse' });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/compare/${osis}/${chapter}`);
  revalidatePath('/highlights');
  return { ok: true };
}

export async function removeHighlight(
  osis: string,
  chapter: number,
  verses: number[],
): Promise<{ ok: boolean; error?: string }> {
  if (!osis || !Number.isInteger(chapter) || chapter < 1) return { ok: false, error: 'Passagem inválida.' };
  const list = validVerses(verses);
  if (list.length === 0) return { ok: false, error: 'Nada para remover.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sessão expirada. Entre novamente.' };

  const { error } = await supabase
    .from('highlights')
    .delete()
    .eq('osis', osis)
    .eq('chapter', chapter)
    .in('verse', list);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/compare/${osis}/${chapter}`);
  revalidatePath('/highlights');
  return { ok: true };
}
