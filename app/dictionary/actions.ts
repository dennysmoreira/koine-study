'use server';

import { createClient } from '@/lib/supabase/server';
import { isInDeck } from '@/lib/dictionary';

export interface AddToDeckResult {
  ok: boolean;
  error?: string;
  alreadyInDeck?: boolean;
}

// Código de erro do Postgres para violação de constraint UNIQUE.
const UNIQUE_VIOLATION = '23505';

// Adiciona um lema ao baralho do usuário criando um srs_card "novo". Não
// definimos stability/difficulty/due_at/state aqui — as DEFAULTs da tabela
// (state='new', due_at=now(), stability/difficulty NULL) já produzem um card
// vencido que a fila de estudo captura e que o FSRS trata como novo na primeira
// revisão (toCard → createEmptyCard quando stability == null).
//
// Idempotente sob concorrência: o pré-check evita o caminho comum, e a
// constraint unique(user_id, lemma_id) garante a corrida — capturamos o 23505
// e reportamos sucesso em vez de vazar o erro cru do banco para a UI. A RLS
// isola por usuário; user_id é passado explicitamente porque é NOT NULL.
export async function addToDeck(lemmaId: number): Promise<AddToDeckResult> {
  if (!Number.isInteger(lemmaId) || lemmaId <= 0) {
    return { ok: false, error: 'Palavra inválida.' };
  }

  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sessão expirada. Entre novamente.' };

  if (await isInDeck(supabase, lemmaId)) return { ok: true, alreadyInDeck: true };

  const { error } = await supabase
    .from('srs_cards')
    .insert({ user_id: user.id, lemma_id: lemmaId });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { ok: true, alreadyInDeck: true };
    return { ok: false, error: 'Não foi possível adicionar ao baralho. Tente novamente.' };
  }

  return { ok: true };
}
