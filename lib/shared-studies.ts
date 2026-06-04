/**
 * Compartilhamento por link público (snapshot congelado).
 *
 * server-only: monta o snapshot a partir das leituras privadas do dono (RLS) e
 * lê o snapshot público pela RPC SECURITY DEFINER `get_shared_snapshot`.
 *
 * Decisão de design: o snapshot é uma CÓPIA do momento do compartilhamento
 * (congelado), não um espelho ao vivo — editar o estudo/anotação depois não
 * afeta o link já gerado (re-compartilhar atualiza). Por privacidade, as fontes
 * do estudo entram só com o TÍTULO (o conteúdo de arquivos/textos enviados NÃO
 * viaja no payload público).
 */
import 'server-only';
import { createClient } from './supabase/server';
import { getStudyWorkspace } from './saved-studies';
import { getAnnotation } from './annotations-server';
import { getStudyMode } from './study-modes';
import { annotationLabel } from './annotations';

export interface SnapshotMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Fonte do estudo no snapshot: SÓ o título (sem conteúdo, por privacidade). */
export interface SnapshotSourceRef {
  kind: 'text' | 'file' | 'annotation';
  title: string;
}

export interface SnapshotVerseRef {
  ref: string;
  bookName: string;
  chapter: number;
  verse: number;
}

export interface StudySnapshot {
  kind: 'study';
  title: string;
  modeLabel: string;
  modeIcon: string;
  reference: { bookName: string; chapter: number } | null;
  prompt: string | null;
  /** Conteúdo one-shot legado (estudos antigos), quando houver. */
  legacyContent: string | null;
  messages: SnapshotMessage[];
  sources: SnapshotSourceRef[];
  references: SnapshotVerseRef[];
}

export interface AnnotationSnapshot {
  kind: 'annotation';
  title: string;
  body: string;
  ref: string;
  crossRefs: { ref: string }[];
}

export type SharedSnapshot = StudySnapshot | AnnotationSnapshot;

export interface PublicSnapshot {
  snapshot: SharedSnapshot;
  snapshotAt: string;
}

/**
 * Monta o snapshot congelado de um estudo do usuário logado (RLS). null se o
 * estudo não existir / não for do usuário. As fontes entram só com o título.
 */
export async function buildStudySnapshot(studyId: number): Promise<StudySnapshot | null> {
  const ws = await getStudyWorkspace(studyId);
  if (!ws) return null;
  const { study, messages, sources, references } = ws;
  const meta = getStudyMode(study.mode);

  return {
    kind: 'study',
    title: study.title,
    modeLabel: meta.label,
    modeIcon: meta.icon,
    reference: study.osis && study.chapter && study.bookName
      ? { bookName: study.bookName, chapter: study.chapter }
      : null,
    prompt: study.prompt,
    legacyContent: study.content,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    sources: sources.map((s) => ({ kind: s.kind, title: s.title })),
    references: references.map((r) => ({
      ref: r.ref,
      bookName: r.bookName,
      chapter: r.chapter,
      verse: r.verse,
    })),
  };
}

/**
 * Monta o snapshot congelado de uma anotação do usuário logado (RLS). null se a
 * anotação não existir / não for do usuário.
 */
export async function buildAnnotationSnapshot(annotationId: number): Promise<AnnotationSnapshot | null> {
  const a = await getAnnotation(annotationId);
  if (!a) return null;

  return {
    kind: 'annotation',
    title: annotationLabel(a),
    body: a.body,
    ref: a.ref,
    crossRefs: a.crossRefs.map((c) => ({ ref: c.ref })),
  };
}

// Aceita só o formato de token que geramos (crypto.randomUUID). Barra payloads
// arbitrários antes de bater no banco e mantém a URL limpa.
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isShareToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

// Revalida o payload jsonb vindo do banco. Foi gravado por nós, mas validar a
// FORMA por tipo na fronteira evita um 500 na página pública (entrada anônima)
// se o schema evoluir ou uma linha legada não bater — retorna null → 404 limpo.
function parsePayload(raw: unknown): SharedSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  if (o.kind === 'study') {
    if (typeof o.title !== 'string') return null;
    if (!Array.isArray(o.messages) || !Array.isArray(o.sources) || !Array.isArray(o.references)) return null;
    return o as unknown as StudySnapshot;
  }
  if (o.kind === 'annotation') {
    if (typeof o.title !== 'string' || typeof o.body !== 'string') return null;
    if (!Array.isArray(o.crossRefs)) return null;
    return o as unknown as AnnotationSnapshot;
  }
  return null;
}

/**
 * Leitura PÚBLICA de um snapshot por token, via RPC SECURITY DEFINER (ignora RLS,
 * mas devolve só a linha do token). Funciona para anônimos. null se o token for
 * malformado ou não existir.
 */
export async function getPublicSnapshot(token: string): Promise<PublicSnapshot | null> {
  if (!isShareToken(token)) return null;

  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_shared_snapshot', { p_token: token });
  if (error || !Array.isArray(data) || data.length === 0) return null;

  const row = data[0] as { payload: unknown; snapshot_at: string };
  const snapshot = parsePayload(row.payload);
  if (!snapshot) return null;

  return { snapshot, snapshotAt: row.snapshot_at };
}
