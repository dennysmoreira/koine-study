/**
 * Rascunho da barra de seleção preservado atraves do login (gate anonimo).
 *
 * Quando um usuario anonimo aciona uma acao que exige conta (anotar, destacar,
 * adicionar a estudo, explicar com IA), salvamos aqui o que ele ja investiu —
 * versiculos selecionados, texto da anotacao e referencias — antes de mandar
 * para /login. Ao voltar autenticado, o Comparator re-hidrata a selecao (e o
 * compositor de anotacao) e limpa o rascunho. Sem isso, o trabalho se perde.
 *
 * Client-safe: so usa localStorage; NAO importa node:* (e importado por
 * componente client — ver ADR-0003).
 */
import type { CrossRef } from './annotations';

const KEY = 'koine:selection-draft';
// Rascunhos velhos nao devem re-hidratar (ex.: usuario logou horas depois noutra
// aba). Uma hora cobre o round-trip de login com folga.
const MAX_AGE_MS = 60 * 60 * 1000;

export type SelectionAction = 'annotate' | 'highlight' | 'study' | 'ai';

export interface SelectionDraft {
  /** pathname do capitulo (sem query), usado para casar na re-hidratacao. */
  path: string;
  verses: number[];
  action: SelectionAction;
  /** Texto da anotacao (so quando action === 'annotate'). */
  note?: string;
  refs?: CrossRef[];
  ts: number;
}

export function saveSelectionDraft(draft: SelectionDraft): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // localStorage indisponivel (modo privado/quota) — o gate ainda leva ao
    // login, so nao preserva o rascunho. Falha silenciosa proposital.
  }
}

export function loadSelectionDraft(): SelectionDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as SelectionDraft;
    if (!draft || typeof draft.path !== 'string' || !Array.isArray(draft.verses)) return null;
    if (Date.now() - (draft.ts ?? 0) > MAX_AGE_MS) {
      clearSelectionDraft();
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function clearSelectionDraft(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // idem saveSelectionDraft.
  }
}
