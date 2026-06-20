// TypeScript mirrors of the Go duel package types.
// Keep in sync with backend/internal/duel/types.go.

export type MatchStatus = 'waiting' | 'active' | 'finished';
export type DuelPhase = 'idle' | 'connecting' | 'waiting' | 'round' | 'between_rounds' | 'finished';

export interface Equation {
  id: string;
  raw: string;          // full balanced equation shown on correct answer
  display: string;      // uncoefficiented form shown during the round
  labels: string[];     // per-slot molecule label (e.g. ["H₂", "O₂", "H₂O"])
  separator_idx: number; // slot index where → is placed
  answers: number[];    // correct coefficients (lowest-integer)
  difficulty: 'easy' | 'medium' | 'hard';
  chip_max: number;     // highest number chip rendered
}

export interface PlayerInfo {
  player_id: string;
  name: string;
}

export interface PlayerProgress {
  player_id: string;
  hp: number;           // 0–100
  wrong_attempts: number;
  rounds_solved: number;
  solved: boolean;
}

export interface MatchState {
  match_id: string;
  status: MatchStatus;
  players: [PlayerInfo, PlayerInfo];
  current_round: number;
  total_rounds: number;
  equation: Equation;
  round_starts_at: string; // ISO 8601
  round_ends_at: string;
  progress: [PlayerProgress, PlayerProgress];
  winner?: string;
}

// ── WS payload types ──────────────────────────────────────────────────────────

export interface ValidationResult {
  correct: boolean;
  damage?: number;
  wrong_attempts: number;
}

export interface RoundEndPayload {
  winner_id: string;
  next_round_in: number; // seconds
}

export interface MatchEndPayload {
  winner_id: string;
  final_state: MatchState;
}

// Discriminated union of every message the server can send.
export type WSMessage =
  | { type: 'match_joined';      payload: MatchState }
  | { type: 'round_start';       payload: MatchState }
  | { type: 'state_update';      payload: MatchState }
  | { type: 'validation_result'; payload: ValidationResult }
  | { type: 'round_end';         payload: RoundEndPayload }
  | { type: 'match_end';         payload: MatchEndPayload }
  | { type: 'pong';              payload: null }
  | { type: 'error';             payload: string };
