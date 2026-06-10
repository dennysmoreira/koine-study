/**
 * Destaques (marca-texto) do usuário — leituras server-only (RLS own_highlights).
 * Um destaque por (usuário, versículo); a cor é trocada por upsert. Eixo de
 * display (osis + chapter + verse protestantes), igual às anotações.
 */
import 'server-only';
import { createClient } from './supabase/server';
import { isHighlightColor, type HighlightColor } from './highlight-colors';

export type { HighlightColor } from './highlight-colors';

/** verso → cor, para tintar as linhas do capítulo aberto (vazio se anônimo). */
export async function getHighlightsForChapter(
  osis: string,
  chapter: number,
): Promise<Record<number, HighlightColor>> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const { data, error } = await supabase
    .from('highlights')
    .select('verse,color')
    .eq('osis', osis)
    .eq('chapter', chapter);
  if (error || !data) return {};

  const out: Record<number, HighlightColor> = {};
  for (const r of data as { verse: number; color: string }[]) {
    if (isHighlightColor(r.color)) out[r.verse] = r.color;
  }
  return out;
}

export interface HighlightItem {
  osis: string;
  chapter: number;
  verse: number;
  color: HighlightColor;
  createdAt: string;
}

/** Todos os destaques do usuário (página "Meus destaques"); vazio se anônimo. */
export async function listHighlights(): Promise<HighlightItem[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Sem ORDER BY no banco: a página reordena pelo sort_order canônico do
  // catálogo (osis alfabético não é a ordem dos livros).
  const { data, error } = await supabase
    .from('highlights')
    .select('osis,chapter,verse,color,created_at');
  if (error || !data) return [];

  return (data as Array<{ osis: string; chapter: number; verse: number; color: string; created_at: string }>)
    .filter((r) => isHighlightColor(r.color))
    .map((r) => ({ osis: r.osis, chapter: r.chapter, verse: r.verse, color: r.color as HighlightColor, createdAt: r.created_at }));
}
