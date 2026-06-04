/**
 * Camada de LEITURA das "anotações pessoais" do usuário autenticado.
 *
 * server-only: usa o cliente Supabase com sessão por cookie (RLS own_annotations),
 * então cada usuário só enxerga as próprias anotações. Tipos e helpers puros vivem
 * em `annotations.ts` (isomórficos), para serem usados também em Client Components.
 */
import 'server-only';
import { createClient } from './supabase/server';
import { parseCrossRefs } from './annotations';
import type { Annotation } from './annotations';

interface AnnotationRow {
  id: number;
  osis: string;
  book_name: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  ref: string;
  body: string;
  cross_refs: unknown;
  created_at: string;
  updated_at: string;
}

const SELECT =
  'id, osis, book_name, chapter, verse_start, verse_end, ref, body, cross_refs, created_at, updated_at';

function toAnnotation(r: AnnotationRow): Annotation {
  return {
    id: r.id,
    osis: r.osis,
    bookName: r.book_name,
    chapter: r.chapter,
    verseStart: r.verse_start,
    verseEnd: r.verse_end,
    ref: r.ref,
    body: r.body,
    crossRefs: parseCrossRefs(r.cross_refs),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Lista todas as anotações do usuário (mais recentes primeiro). Vazio se anônimo. */
export async function getAnnotations(): Promise<Annotation[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('annotations')
    .select(SELECT)
    .order('updated_at', { ascending: false });
  if (error || !data) return [];
  return (data as AnnotationRow[]).map(toAnnotation);
}

/** Carrega uma anotação por id (ou null se não existir / não for do usuário, via RLS). */
export async function getAnnotation(id: number): Promise<Annotation | null> {
  if (!Number.isInteger(id)) return null;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.from('annotations').select(SELECT).eq('id', id).maybeSingle();
  if (error || !data) return null;
  return toAnnotation(data as AnnotationRow);
}

/**
 * Anotações de um capítulo (para marcar os versículos anotados no comparador).
 * Ordenadas por verse_start. Vazio se anônimo.
 */
export async function getAnnotationsForChapter(osis: string, chapter: number): Promise<Annotation[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('annotations')
    .select(SELECT)
    .eq('osis', osis)
    .eq('chapter', chapter)
    .order('verse_start', { ascending: true });
  if (error || !data) return [];
  return (data as AnnotationRow[]).map(toAnnotation);
}
