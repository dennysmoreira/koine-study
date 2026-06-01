/**
 * Camada de leitura dos "estudos salvos" do usuário autenticado.
 *
 * server-only: usa o cliente Supabase com sessão por cookie (RLS own_studies),
 * então cada usuário só enxerga os próprios estudos.
 */
import 'server-only';
import { createClient } from './supabase/server';
import { isStudyMode, type StudyMode } from './study-modes';
import { extractFileText } from './extract-text';

export interface SavedStudy {
  id: number;
  osis: string | null;
  chapter: number | null;
  bookName: string | null;
  mode: StudyMode;
  title: string;
  prompt: string | null;
  codes: string[];
  content: string | null;
  createdAt: string;
}

interface SavedStudyRow {
  id: number;
  osis: string | null;
  chapter: number | null;
  book_name: string | null;
  mode: string;
  title: string;
  prompt: string | null;
  codes: string[] | null;
  content: string | null;
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

// ── Workspace conversacional ───────────────────────────────────────────────
// Um estudo agrega: histórico de mensagens (chat), fontes do usuário e
// referências bíblicas citadas. Tudo RLS por auth.uid().

export interface StudyMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface StudySource {
  id: number;
  kind: 'text' | 'file';
  title: string;
  content: string | null;
  storagePath: string | null;
  mimeType: string | null;
  byteSize: number | null;
  createdAt: string;
}

export interface StudyReference {
  id: number;
  ref: string;
  osis: string;
  bookName: string;
  chapter: number;
  verse: number;
  createdAt: string;
}

export interface StudyWorkspace {
  study: SavedStudy;
  messages: StudyMessage[];
  sources: StudySource[];
  references: StudyReference[];
}

interface StudyMessageRow { id: number; role: string; content: string; created_at: string }
interface StudySourceRow {
  id: number; kind: string; title: string; content: string | null;
  storage_path: string | null; mime_type: string | null; byte_size: number | null; created_at: string;
}
interface StudyReferenceRow {
  id: number; ref: string; osis: string; book_name: string;
  chapter: number; verse: number; created_at: string;
}

function toMessage(r: StudyMessageRow): StudyMessage {
  return { id: r.id, role: r.role === 'assistant' ? 'assistant' : 'user', content: r.content, createdAt: r.created_at };
}
function toSource(r: StudySourceRow): StudySource {
  return {
    id: r.id, kind: r.kind === 'file' ? 'file' : 'text', title: r.title, content: r.content,
    storagePath: r.storage_path, mimeType: r.mime_type, byteSize: r.byte_size, createdAt: r.created_at,
  };
}
function toReference(r: StudyReferenceRow): StudyReference {
  return {
    id: r.id, ref: r.ref, osis: r.osis, bookName: r.book_name,
    chapter: r.chapter, verse: r.verse, createdAt: r.created_at,
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

/**
 * Carrega o workspace completo de um estudo: o estudo + histórico de mensagens +
 * fontes + referências. Null se não existir / não for do usuário (RLS).
 * Faz as três leituras filhas em paralelo após confirmar o estudo.
 */
export async function getStudyWorkspace(id: number): Promise<StudyWorkspace | null> {
  const study = await getSavedStudy(id);
  if (!study) return null;

  const supabase = createClient();
  const [msgs, srcs, refs] = await Promise.all([
    supabase
      .from('study_messages')
      .select('id, role, content, created_at')
      .eq('study_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('study_sources')
      .select('id, kind, title, content, storage_path, mime_type, byte_size, created_at')
      .eq('study_id', id)
      .order('created_at', { ascending: true }),
    supabase
      .from('study_references')
      .select('id, ref, osis, book_name, chapter, verse, created_at')
      .eq('study_id', id)
      .order('chapter', { ascending: true })
      .order('verse', { ascending: true }),
  ]);

  return {
    study,
    messages: ((msgs.data as StudyMessageRow[] | null) ?? []).map(toMessage),
    sources: ((srcs.data as StudySourceRow[] | null) ?? []).map(toSource),
    references: ((refs.data as StudyReferenceRow[] | null) ?? []).map(toReference),
  };
}

/**
 * Backfill lazy do texto de fontes-arquivo: para fontes file sem `content` (ex.:
 * enviadas antes da extração existir), baixa o binário do Storage, extrai o texto
 * e persiste em study_sources.content — assim só processa uma vez. Retorna a lista
 * com as fontes preenchidas. Falha de uma fonte não derruba as demais.
 */
export async function backfillFileSources(sources: StudySource[]): Promise<StudySource[]> {
  const pending = sources.filter((s) => s.kind === 'file' && !s.content && s.storagePath);
  if (pending.length === 0) return sources;

  const supabase = createClient();
  const filled = new Map<number, string>();

  await Promise.all(
    pending.map(async (s) => {
      try {
        const { data, error } = await supabase.storage.from('study-sources').download(s.storagePath!);
        if (error || !data) return;
        const bytes = new Uint8Array(await data.arrayBuffer());
        const text = await extractFileText(bytes, s.mimeType, s.title);
        if (!text) return;
        await supabase.from('study_sources').update({ content: text }).eq('id', s.id);
        filled.set(s.id, text);
      } catch {
        // ignora: a fonte segue sem texto e o chat sinaliza a falta de material.
      }
    }),
  );

  if (filled.size === 0) return sources;
  return sources.map((s) => (filled.has(s.id) ? { ...s, content: filled.get(s.id)! } : s));
}
