'use server';

/**
 * Server Actions dos "estudos salvos": gravar e remover.
 * Toda escrita passa pela RLS (own_studies), isolando por auth.uid().
 */
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { isStudyMode, getStudyMode } from '@/lib/study-modes';
import { extractFileText } from '@/lib/extract-text';
import { annotationLabel } from '@/lib/annotations';

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

// ── Workspace conversacional ───────────────────────────────────────────────

export interface CreateStudyInput {
  title?: string;
  mode?: string;
  osis?: string | null;
  chapter?: number | null;
  bookName?: string | null;
  codes?: string[];
  // Referências iniciais (ex.: versículos selecionados no comparador).
  references?: Array<{ ref: string; osis: string; bookName: string; chapter: number; verse: number }>;
}

/**
 * Cria um estudo-workspace (conteúdo vazio; a conversa vive em study_messages).
 * Opcionalmente já anexa referências bíblicas (fluxo "adicionar versículos a um
 * novo estudo" do comparador). Retorna o id criado.
 */
export async function createStudy(input: CreateStudyInput = {}): Promise<SaveStudyResult> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login para criar estudos.' };

  const mode = isStudyMode(input.mode) ? input.mode : 'free';
  const title = input.title?.trim() || 'Novo estudo';

  const { data, error } = await supabase
    .from('saved_studies')
    .insert({
      user_id: user.id,
      osis: input.osis ?? null,
      chapter: input.chapter ?? null,
      book_name: input.bookName ?? null,
      mode,
      title: title.slice(0, 120),
      codes: input.codes ?? [],
      content: null,
    })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? 'Falha ao criar.' };

  const studyId = (data as { id: number }).id;

  // Valida na fronteira: a action é exportada e chamável fora do comparador;
  // descarta referências malformadas em vez de gravar lixo em study_references.
  const refs = (input.references ?? []).filter(
    (r) =>
      !!r &&
      typeof r.ref === 'string' &&
      r.ref.length > 0 &&
      typeof r.osis === 'string' &&
      r.osis.length > 0 &&
      Number.isInteger(r.chapter) &&
      Number.isInteger(r.verse),
  );
  if (refs.length > 0) {
    const rows = refs.map((r) => ({
      study_id: studyId,
      user_id: user.id,
      ref: r.ref,
      osis: r.osis,
      book_name: r.bookName,
      chapter: r.chapter,
      verse: r.verse,
    }));
    // ignoreDuplicates: unique(study_id, ref) — versículos repetidos não duplicam.
    await supabase.from('study_references').upsert(rows, { onConflict: 'study_id,ref', ignoreDuplicates: true });
  }

  revalidatePath('/studies');
  return { ok: true, id: studyId };
}

// Confirma que o estudo pertence ao usuário logado. As tabelas-filha têm RLS por
// user_id, mas isso não impede anexar a um study_id alheio; este guard fecha o furo.
// Não precisa do userId: a leitura de saved_studies já é filtrada pela RLS
// own_studies — se veio linha, é do usuário.
async function assertOwnsStudy(
  supabase: ReturnType<typeof createClient>,
  studyId: number,
): Promise<boolean> {
  const { data } = await supabase.from('saved_studies').select('id').eq('id', studyId).maybeSingle();
  return !!data;
}

export interface ReferenceInput {
  ref: string;
  osis: string;
  bookName: string;
  chapter: number;
  verse: number;
}

export interface StudyOption {
  id: number;
  title: string;
}

/** Lista os estudos do usuário (id + título) para o seletor "adicionar a um estudo". */
export async function listMyStudies(): Promise<StudyOption[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('saved_studies')
    .select('id, title')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as Array<{ id: number; title: string }>).map((r) => ({ id: r.id, title: r.title }));
}

/**
 * Anexa em LOTE versículos a um estudo existente (fluxo "adicionar ao estudo" do
 * comparador). ignoreDuplicates evita citar o mesmo versículo duas vezes.
 */
export async function addReferencesToStudy(
  studyId: number,
  references: ReferenceInput[],
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(studyId)) return { ok: false, error: 'Id inválido.' };
  if (references.length === 0) return { ok: false, error: 'Nenhum versículo selecionado.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sessão expirada. Entre novamente.' };
  if (!(await assertOwnsStudy(supabase, studyId))) return { ok: false, error: 'Estudo não encontrado.' };

  const rows = references.map((r) => ({
    study_id: studyId,
    user_id: user.id,
    ref: r.ref,
    osis: r.osis,
    book_name: r.bookName,
    chapter: r.chapter,
    verse: r.verse,
  }));
  const { error } = await supabase
    .from('study_references')
    .upsert(rows, { onConflict: 'study_id,ref', ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/studies/${studyId}`);
  return { ok: true };
}

/** Remove uma referência do estudo (RLS garante propriedade). */
export async function removeStudyReference(id: number): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(id)) return { ok: false, error: 'Id inválido.' };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sessão expirada. Entre novamente.' };

  const { error } = await supabase.from('study_references').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Teto de caracteres de uma fonte de texto inline (fronteira de confiança no
// servidor; evita gravar uma linha gigante em study_sources).
const MAX_TEXT_SOURCE_CHARS = 50000;

/** Adiciona uma fonte de texto inline (anotação/trecho) ao estudo. */
export async function addTextSource(
  studyId: number,
  title: string,
  content: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(studyId)) return { ok: false, error: 'Id inválido.' };
  const cleanTitle = title?.trim();
  const cleanContent = content?.trim();
  if (!cleanContent) return { ok: false, error: 'Conteúdo vazio.' };
  if (cleanContent.length > MAX_TEXT_SOURCE_CHARS) {
    return { ok: false, error: 'Texto muito longo (máx. 50.000 caracteres).' };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sessão expirada. Entre novamente.' };
  if (!(await assertOwnsStudy(supabase, studyId))) return { ok: false, error: 'Estudo não encontrado.' };

  const { error } = await supabase.from('study_sources').insert({
    study_id: studyId,
    user_id: user.id,
    kind: 'text',
    title: (cleanTitle || 'Anotação').slice(0, 200),
    content: cleanContent,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/studies/${studyId}`);
  return { ok: true };
}

/**
 * Vincula uma anotação existente ao estudo como fonte (kind='annotation'). Vínculo
 * AO VIVO: o corpo NÃO é copiado — guardamos só a FK annotation_id e a leitura
 * (getStudyWorkspace) resolve o texto atual, então editar a anotação propaga ao
 * estudo e ao contexto da IA. O índice único parcial (study_id, annotation_id)
 * impede vincular a mesma anotação duas vezes.
 */
export async function addAnnotationSource(
  studyId: number,
  annotationId: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(studyId) || !Number.isInteger(annotationId)) {
    return { ok: false, error: 'Id inválido.' };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sessão expirada. Entre novamente.' };
  if (!(await assertOwnsStudy(supabase, studyId))) return { ok: false, error: 'Estudo não encontrado.' };

  // RLS (own_annotations) garante que só o dono lê a própria anotação.
  const { data: ann } = await supabase
    .from('annotations')
    .select('id, book_name, chapter, verse_start, verse_end')
    .eq('id', annotationId)
    .maybeSingle();
  const row = ann as
    | { id: number; book_name: string; chapter: number; verse_start: number; verse_end: number }
    | null;
  if (!row) return { ok: false, error: 'Anotação não encontrada.' };

  const title = `Anotação — ${annotationLabel({
    bookName: row.book_name,
    chapter: row.chapter,
    verseStart: row.verse_start,
    verseEnd: row.verse_end,
  })}`;

  const { error } = await supabase.from('study_sources').insert({
    study_id: studyId,
    user_id: user.id,
    kind: 'annotation',
    title: title.slice(0, 200),
    annotation_id: annotationId,
  });
  if (error) {
    // 23505 = unique_violation no índice (study_id, annotation_id): já vinculada.
    if (error.code === '23505') return { ok: false, error: 'Esta anotação já está vinculada ao estudo.' };
    console.error('addAnnotationSource falhou', error);
    return { ok: false, error: 'Falha ao vincular a anotação.' };
  }

  revalidatePath(`/studies/${studyId}`);
  return { ok: true };
}

// Tamanho máximo aceito para upload de arquivo-fonte (10 MB). Defesa no servidor;
// o input do cliente também filtra, mas a action é a fronteira de confiança.
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Anexa uma fonte do tipo arquivo: sobe o binário ao bucket privado 'study-sources'
 * sob o prefixo "<user_id>/<studyId>/..." (a RLS do Storage exige que o 1º segmento
 * do path seja o auth.uid()) e registra a fonte em study_sources (kind='file').
 */
export async function addFileSource(
  studyId: number,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(studyId)) return { ok: false, error: 'Id inválido.' };
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: 'Selecione um arquivo.' };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: 'Arquivo acima de 10 MB.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sessão expirada. Entre novamente.' };
  if (!(await assertOwnsStudy(supabase, studyId))) return { ok: false, error: 'Estudo não encontrado.' };

  // Sanitiza o nome e prefixa com timestamp para evitar colisão/path traversal.
  const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(-80) || 'arquivo';
  const path = `${user.id}/${studyId}/${Date.now()}-${safeName}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from('study-sources')
    .upload(path, bytes, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (upErr) return { ok: false, error: upErr.message };

  // Extrai o texto agora (PDF/texto) para alimentar o contexto da IA. Falha de
  // extração não aborta o upload: a fonte ainda fica anexada (só sem texto), e o
  // backfill lazy no chat tenta de novo. PDF escaneado/formatos sem texto → null.
  let extracted: string | null = null;
  try {
    extracted = await extractFileText(bytes, file.type || null, file.name || '');
  } catch {
    extracted = null;
  }

  const { error } = await supabase.from('study_sources').insert({
    study_id: studyId,
    user_id: user.id,
    kind: 'file',
    title: (file.name || 'Arquivo').slice(0, 200),
    content: extracted,
    storage_path: path,
    mime_type: file.type || null,
    byte_size: file.size,
  });
  if (error) {
    // Falhou o registro: remove o objeto órfão do Storage para não vazar espaço.
    await supabase.storage.from('study-sources').remove([path]);
    return { ok: false, error: error.message };
  }

  revalidatePath(`/studies/${studyId}`);
  return { ok: true };
}

/** Remove uma fonte do estudo (RLS garante propriedade). */
export async function removeStudySource(id: number): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(id)) return { ok: false, error: 'Id inválido.' };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sessão expirada. Entre novamente.' };

  // Apaga o objeto no Storage se for arquivo (o registro some via delete abaixo).
  const { data: src } = await supabase
    .from('study_sources')
    .select('kind, storage_path')
    .eq('id', id)
    .maybeSingle();
  const row = src as { kind: string; storage_path: string | null } | null;
  if (row?.kind === 'file' && row.storage_path) {
    await supabase.storage.from('study-sources').remove([row.storage_path]);
  }

  const { error } = await supabase.from('study_sources').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Renomeia um estudo (RLS own_studies garante propriedade). */
export async function updateStudyTitle(id: number, title: string): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(id)) return { ok: false, error: 'Id inválido.' };
  const clean = title?.trim();
  if (!clean) return { ok: false, error: 'Informe um título.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sessão expirada. Entre novamente.' };

  // RLS (own_studies) garante que só o dono renomeia o próprio registro.
  const { error } = await supabase
    .from('saved_studies')
    .update({ title: clean.slice(0, 120) })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/studies');
  revalidatePath(`/studies/${id}`);
  return { ok: true };
}

export async function deleteStudy(id: number): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(id)) return { ok: false, error: 'Id inválido.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sessão expirada. Entre novamente.' };

  // Revoga o link público antes (snapshot é independente da fonte, não cascateia):
  // deletar o estudo não deve deixar um link compartilhado vivo. RLS isola o dono.
  await supabase.from('shared_snapshots').delete().eq('kind', 'study').eq('source_id', id);

  // RLS (own_studies) garante que só o dono apaga o próprio registro.
  const { error } = await supabase.from('saved_studies').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/studies');
  return { ok: true };
}
