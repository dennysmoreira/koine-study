/**
 * Camada de leitura dos "estudos salvos" do usuário autenticado.
 *
 * server-only: usa o cliente Supabase com sessão por cookie (RLS own_studies),
 * então cada usuário só enxerga os próprios estudos.
 */
import 'server-only';
import { createClient } from './supabase/server';
import { isStudyMode, type StudyMode } from './study-modes';

export interface SavedStudy {
  id: number;
  osis: string;
  chapter: number;
  bookName: string;
  mode: StudyMode;
  title: string;
  prompt: string | null;
  codes: string[];
  content: string;
  createdAt: string;
}

interface SavedStudyRow {
  id: number;
  osis: string;
  chapter: number;
  book_name: string;
  mode: string;
  title: string;
  prompt: string | null;
  codes: string[] | null;
  content: string;
  created_at: string;
}

function toStudy(row: SavedStudyRow): SavedStudy {
  return {
    id: row.id,
    osis: row.osis,
    chapter: row.chapter,
    bookName: row.book_name,
    mode: isStudyMode(row.mode) ? row.mode : 'free',
    title: row.title,
    prompt: row.prompt,
    codes: row.codes ?? [],
    content: row.content,
    createdAt: row.created_at,
  };
}

/** Lista os estudos salvos do usuário (mais recentes primeiro). Vazio se anônimo. */
export async function getSavedStudies(): Promise<SavedStudy[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('saved_studies')
    .select('id, osis, chapter, book_name, mode, title, prompt, codes, content, created_at')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as SavedStudyRow[]).map(toStudy);
}

/** Carrega um estudo salvo por id (ou null se não existir / não for do usuário). */
export async function getSavedStudy(id: number): Promise<SavedStudy | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('saved_studies')
    .select('id, osis, chapter, book_name, mode, title, prompt, codes, content, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return toStudy(data as SavedStudyRow);
}
