'use server';

/**
 * Server Actions das "anotações pessoais": criar, editar, excluir e listar.
 * Toda escrita passa pela RLS (own_annotations), isolando por auth.uid().
 */
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  annotationLabel,
  rangeRef,
  sanitizeCrossRef,
  OSIS_RE,
  MAX_BOOK_NAME_LEN,
  MAX_CHAPTER,
  MAX_VERSE,
  type CrossRef,
} from '@/lib/annotations';

// Teto de caracteres do corpo da anotação (fronteira de confiança no servidor).
const MAX_BODY_CHARS = 50000;
// Teto de referências relacionadas por anotação (evita payload abusivo).
const MAX_CROSS_REFS = 50;

export interface CreateAnnotationInput {
  osis: string;
  bookName: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  body: string;
  crossRefs?: CrossRef[];
}

/**
 * Valida e normaliza as referências relacionadas (fronteira de confiança).
 * Recusa faixas inválidas; reconstrói o rótulo `ref` no servidor (via
 * sanitizeCrossRef) para não confiar no texto vindo do cliente.
 */
function sanitizeCrossRefs(input: CrossRef[] | undefined): { refs: CrossRef[]; error?: string } {
  if (!input || input.length === 0) return { refs: [] };
  if (input.length > MAX_CROSS_REFS) return { refs: [], error: 'Referências relacionadas demais (máx. 50).' };

  const refs: CrossRef[] = [];
  for (const r of input) {
    const clean = sanitizeCrossRef(r);
    if (!clean) return { refs: [], error: 'Referência relacionada inválida.' };
    refs.push(clean);
  }
  return { refs };
}

export interface AnnotationResult {
  ok: boolean;
  id?: number;
  error?: string;
}

export async function createAnnotation(input: CreateAnnotationInput): Promise<AnnotationResult> {
  const body = input.body?.trim();
  if (!body) return { ok: false, error: 'Escreva o conteúdo da anotação.' };
  if (body.length > MAX_BODY_CHARS) return { ok: false, error: 'Anotação muito longa (máx. 50.000 caracteres).' };
  // Valida a âncora na fronteira: o osis vira segmento de URL no comparador, daí
  // o charset restrito; bookName e os limites de capítulo/versículo evitam lixo.
  if (
    typeof input.osis !== 'string' ||
    !OSIS_RE.test(input.osis) ||
    typeof input.bookName !== 'string' ||
    input.bookName.length === 0 ||
    input.bookName.length > MAX_BOOK_NAME_LEN
  ) {
    return { ok: false, error: 'Referência inválida.' };
  }
  if (
    !Number.isInteger(input.chapter) ||
    !Number.isInteger(input.verseStart) ||
    !Number.isInteger(input.verseEnd) ||
    input.chapter < 1 ||
    input.chapter > MAX_CHAPTER ||
    input.verseStart < 1 ||
    input.verseEnd < input.verseStart ||
    input.verseEnd > MAX_VERSE
  ) {
    return { ok: false, error: 'Faixa de versículos inválida.' };
  }

  const { refs: crossRefs, error: refsError } = sanitizeCrossRefs(input.crossRefs);
  if (refsError) return { ok: false, error: refsError };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login para anotar.' };

  // Reconstrói o rótulo `ref` no servidor (não confia no texto do cliente).
  const ref = rangeRef(input.bookName, input.chapter, input.verseStart, input.verseEnd);

  const { data, error } = await supabase
    .from('annotations')
    .insert({
      user_id: user.id,
      osis: input.osis,
      book_name: input.bookName,
      chapter: input.chapter,
      verse_start: input.verseStart,
      verse_end: input.verseEnd,
      ref,
      body,
      cross_refs: crossRefs,
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error('createAnnotation falhou', error);
    return { ok: false, error: 'Falha ao salvar a anotação.' };
  }

  revalidatePath('/annotations');
  revalidatePath(`/compare/${input.osis}/${input.chapter}`);
  return { ok: true, id: (data as { id: number }).id };
}

/**
 * Atualiza corpo e referências relacionadas de uma anotação em UMA escrita
 * atômica (evita estado parcial de gravar o corpo e falhar nas refs). Como as
 * fontes-anotação dos estudos resolvem o conteúdo ao vivo, as mudanças aqui se
 * propagam ao contexto da IA sem recópia.
 */
export async function updateAnnotation(
  id: number,
  body: string,
  crossRefs?: CrossRef[],
): Promise<AnnotationResult> {
  if (!Number.isInteger(id)) return { ok: false, error: 'Id inválido.' };
  const clean = body?.trim();
  if (!clean) return { ok: false, error: 'Escreva o conteúdo da anotação.' };
  if (clean.length > MAX_BODY_CHARS) return { ok: false, error: 'Anotação muito longa (máx. 50.000 caracteres).' };

  const { refs, error: refsError } = sanitizeCrossRefs(crossRefs);
  if (refsError) return { ok: false, error: refsError };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sessão expirada. Entre novamente.' };

  // RLS (own_annotations) garante que só o dono edita a própria anotação. O
  // select devolve a linha afetada: se vier null, a anotação não existe (ou não
  // é do usuário) e nada foi atualizado.
  const { data, error } = await supabase
    .from('annotations')
    .update({ body: clean, cross_refs: refs, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('osis, chapter')
    .maybeSingle();
  if (error) {
    console.error('updateAnnotation falhou', error);
    return { ok: false, error: 'Falha ao salvar a anotação.' };
  }
  const loc = data as { osis: string; chapter: number } | null;
  if (!loc) return { ok: false, error: 'Anotação não encontrada.' };

  revalidatePath('/annotations');
  revalidatePath(`/compare/${loc.osis}/${loc.chapter}`);
  return { ok: true, id };
}

export async function deleteAnnotation(id: number): Promise<AnnotationResult> {
  if (!Number.isInteger(id)) return { ok: false, error: 'Id inválido.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sessão expirada. Entre novamente.' };

  // Revoga o link público (snapshot é independente da fonte, não cascateia):
  // apagar a anotação não deve deixar um link compartilhado vivo. RLS isola o dono.
  await supabase.from('shared_snapshots').delete().eq('kind', 'annotation').eq('source_id', id);

  // RLS (own_annotations) garante que só o dono apaga; o ON DELETE CASCADE em
  // study_sources.annotation_id remove os vínculos a estudos automaticamente.
  const { error } = await supabase.from('annotations').delete().eq('id', id);
  if (error) {
    console.error('deleteAnnotation falhou', error);
    return { ok: false, error: 'Falha ao remover a anotação.' };
  }

  revalidatePath('/annotations');
  return { ok: true, id };
}

export interface AnnotationOption {
  id: number;
  label: string;
  preview: string;
}

/** Lista as anotações do usuário (rótulo + prévia) para o seletor "vincular ao estudo". */
export async function listMyAnnotations(): Promise<AnnotationOption[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('annotations')
    .select('id, book_name, chapter, verse_start, verse_end, body')
    .order('updated_at', { ascending: false });
  if (error || !data) return [];

  return (
    data as Array<{ id: number; book_name: string; chapter: number; verse_start: number; verse_end: number; body: string }>
  ).map((r) => ({
    id: r.id,
    label: annotationLabel({ bookName: r.book_name, chapter: r.chapter, verseStart: r.verse_start, verseEnd: r.verse_end }),
    preview: r.body.length > 80 ? `${r.body.slice(0, 80)}…` : r.body,
  }));
}
