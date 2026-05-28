import { fsrs, createEmptyCard, Rating, State, type Card, type Grade } from 'ts-fsrs';

// ── ponte entre a tabela srs_cards (DB) e o algoritmo FSRS (ts-fsrs) ──────
//
// Persistimos o estado de memória de longo prazo (stability/difficulty/state/
// due_at/reps/lapses/last_review). Os campos efêmeros de learning-step do FSRS
// (elapsed_days/scheduled_days/learning_steps) não são persistidos — são
// recomputados a cada sessão a partir das datas, o que é suficiente para
// granularidade diária de revisão.

export type DbState = 'new' | 'learning' | 'review' | 'relearning';
export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';

export interface SrsState {
  stability: number | null;
  difficulty: number | null;
  due_at: string; // ISO
  state: DbState;
  reps: number;
  lapses: number;
  last_review: string | null;
}

const STATE_TO_ENUM: Record<DbState, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

const ENUM_TO_STATE: Record<State, DbState> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

const GRADE_TO_RATING: Record<ReviewGrade, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const scheduler = fsrs();

function toCard(s: SrsState | null, now: Date): Card {
  if (!s || s.stability == null || s.difficulty == null) return createEmptyCard(now);
  return {
    due: new Date(s.due_at),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: s.reps,
    lapses: s.lapses,
    state: STATE_TO_ENUM[s.state],
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  };
}

// Aplica uma nota de revisão e devolve o novo estado pronto para persistir.
export function applyReview(current: SrsState | null, grade: ReviewGrade, now = new Date()): SrsState {
  const { card } = scheduler.next(toCard(current, now), now, GRADE_TO_RATING[grade]);
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    due_at: card.due.toISOString(),
    state: ENUM_TO_STATE[card.state],
    reps: card.reps,
    lapses: card.lapses,
    last_review: (card.last_review ?? now).toISOString(),
  };
}
