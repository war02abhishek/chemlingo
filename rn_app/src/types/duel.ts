// TypeScript mirrors of the Go duel package types.
// Keep in sync with backend/internal/duel/types.go.

export type MatchStatus = 'waiting' | 'active' | 'finished';
export type DuelPhase = 'idle' | 'connecting' | 'waiting' | 'playing' | 'finished';

export interface Equation {
  id: string;
  raw: string;
  display: string;
  labels: string[];
  separator_idx: number;
  answers: number[];
  difficulty: 'easy' | 'medium' | 'hard';
  chip_max: number;
}

export interface PlayerInfo {
  player_id: string;
  name: string;
}

export interface PlayerProgress {
  player_id: string;
  current_round: number;      // 1-indexed; which equation they're on
  round_started_at: string;   // ISO 8601
  total_time_ms: number;      // cumulative solved time
  wrong_attempts: number;     // for the current equation
  rounds_solved: number;      // equations completed so far
  finished: boolean;          // all equations done
}

export interface MatchState {
  match_id: string;
  status: MatchStatus;
  players: [PlayerInfo, PlayerInfo];
  total_rounds: number;
  equations: Equation[];      // full set, same for both players
  progress: [PlayerProgress, PlayerProgress];
  winner?: string;
}

// ── WS payload types ──────────────────────────────────────────────────────────

export interface ValidationResult {
  correct: boolean;
  solve_time_ms?: number;
  wrong_attempts: number;
}

export interface RatingChange {
  player_id: string;
  before: number;
  delta: number;   // negative on loss
  after: number;
}

export interface MatchEndPayload {
  winner_id: string;   // '' = tie
  final_state: MatchState;
  rating_changes: [RatingChange, RatingChange];
}

// Discriminated union of every message the server can send.
export type WSMessage =
  | { type: 'match_joined';      payload: MatchState }
  | { type: 'state_update';      payload: MatchState }
  | { type: 'validation_result'; payload: ValidationResult }
  | { type: 'match_end';         payload: MatchEndPayload }
  | { type: 'pong';              payload: null }
  | { type: 'error';             payload: string };
