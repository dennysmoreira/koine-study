'use server';

/**
 * Server Actions do compartilhamento por link público (snapshot congelado).
 *
 * Gera/atualiza um snapshot em `shared_snapshots` (RLS own_shared_snapshots) e
 * devolve o token + o caminho relativo `/share/{token}`. O cliente compõe a URL
 * absoluta a partir de `window.location.origin` (evita depender de env de host).
 *
 * Um link estável por (usuário, tipo, item): re-compartilhar atualiza o snapshot
 * mantendo o mesmo token. A leitura pública é pela RPC SECURITY DEFINER (não por
 * estas actions).
 */
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  buildStudySnapshot,
  buildAnnotationSnapshot,
  isShareToken,
  type SharedSnapshot,
} from '@/lib/shared-studies';

export interface ShareResult {
  ok: boolean;
  token?: string;
  path?: string;
  error?: string;
}

type ShareKind = 'study' | 'annotation';

/**
 * Cria ou atualiza o snapshot de um item, mantendo o token estável. A leitura de
 * `shared_snapshots` é filtrada pela RLS (só linhas do dono), então achar uma
 * linha já confirma propriedade do snapshot.
 */
async function upsertSnapshot(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  kind: ShareKind,
  sourceId: number,
  title: string,
  payload: SharedSnapshot,
): Promise<ShareResult> {
  // Filtra por user_id explicitamente (além da RLS) — (kind, source_id) não é
  // único globalmente, só (user_id, kind, source_id). Defesa em profundidade:
  // garante linha única mesmo que a RLS fosse contornada (ex.: service_role).
  const { data: existing } = await supabase
    .from('shared_snapshots')
    .select('token')
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('source_id', sourceId)
    .maybeSingle();

  const found = existing as { token: string } | null;
  if (found?.token) {
    const { error } = await supabase
      .from('shared_snapshots')
      .update({ title, payload, snapshot_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('kind', kind)
      .eq('source_id', sourceId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, token: found.token, path: `/share/${found.token}` };
  }

  const token = crypto.randomUUID();
  const { error } = await supabase
    .from('shared_snapshots')
    .insert({ user_id: userId, kind, source_id: sourceId, token, title, payload });
  if (error) return { ok: false, error: error.message };
  return { ok: true, token, path: `/share/${token}` };
}

/** Compartilha um estudo: congela o workspace atual num snapshot público. */
export async function shareStudy(studyId: number): Promise<ShareResult> {
  if (!Number.isInteger(studyId)) return { ok: false, error: 'Id inválido.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login para compartilhar.' };

  // buildStudySnapshot lê via RLS — null = estudo inexistente ou de outro usuário.
  const snapshot = await buildStudySnapshot(studyId);
  if (!snapshot) return { ok: false, error: 'Estudo não encontrado.' };

  const res = await upsertSnapshot(supabase, user.id, 'study', studyId, snapshot.title, snapshot);
  if (res.ok) revalidatePath(`/studies/${studyId}`);
  return res;
}

/** Compartilha uma anotação: congela o corpo + referências num snapshot público. */
export async function shareAnnotation(annotationId: number): Promise<ShareResult> {
  if (!Number.isInteger(annotationId)) return { ok: false, error: 'Id inválido.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Faça login para compartilhar.' };

  const snapshot = await buildAnnotationSnapshot(annotationId);
  if (!snapshot) return { ok: false, error: 'Anotação não encontrada.' };

  const res = await upsertSnapshot(supabase, user.id, 'annotation', annotationId, snapshot.title, snapshot);
  if (res.ok) revalidatePath('/annotations');
  return res;
}

/** Revoga (apaga) um link público pelo token. RLS garante que só o dono revoga. */
export async function revokeShare(token: string): Promise<{ ok: boolean; error?: string }> {
  if (!isShareToken(token)) return { ok: false, error: 'Token inválido.' };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sessão expirada. Entre novamente.' };

  // .select() devolve as linhas apagadas: vazio = token de outro dono (RLS) ou
  // inexistente. Evita o "revogado" falso quando nada foi removido.
  const { data, error } = await supabase
    .from('shared_snapshots')
    .delete()
    .eq('token', token)
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: 'Link não encontrado.' };

  revalidatePath('/studies');
  revalidatePath('/annotations');
  return { ok: true };
}

/**
 * Token do link público existente de um item (ou null). Permite a UI mostrar o
 * link já gerado sem recriar o snapshot. Filtrado pela RLS (só do dono).
 */
export async function getShareToken(kind: ShareKind, sourceId: number): Promise<string | null> {
  if (!Number.isInteger(sourceId)) return null;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('shared_snapshots')
    .select('token')
    .eq('user_id', user.id)
    .eq('kind', kind)
    .eq('source_id', sourceId)
    .maybeSingle();
  return (data as { token: string } | null)?.token ?? null;
}

/**
 * Tokens de link público de vários itens de uma vez (mapa source_id → token).
 * Para listas (ex.: /annotations) seedarem cada ShareButton sem N queries. Só
 * tokens do usuário logado (RLS + filtro explícito de user_id).
 */
export async function getShareTokens(
  kind: ShareKind,
  sourceIds: number[],
): Promise<Record<number, string>> {
  const ids = sourceIds.filter((n) => Number.isInteger(n));
  if (ids.length === 0) return {};

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  const { data } = await supabase
    .from('shared_snapshots')
    .select('source_id, token')
    .eq('user_id', user.id)
    .eq('kind', kind)
    .in('source_id', ids);

  const map: Record<number, string> = {};
  for (const r of (data ?? []) as Array<{ source_id: number; token: string }>) {
    map[r.source_id] = r.token;
  }
  return map;
}
