import { http } from './api';

// ── Tier system ───────────────────────────────────────────────────────────────

export const TIERS = [
  {
    name: 'Bronze' as const,
    min: 0,    max: 1200,
    emoji: '🥉', color: '#CD7F32', glowColor: '#CD7F3240',
    title: 'Aspiring Chemist',
    rewards: ['Bronze Rank Frame', 'Title: Aspiring Chemist'],
  },
  {
    name: 'Silver' as const,
    min: 1200, max: 1400,
    emoji: '🥈', color: '#9CA3AF', glowColor: '#9CA3AF40',
    title: 'Skilled Chemist',
    rewards: ['Silver Rank Frame', 'Title: Skilled Chemist'],
  },
  {
    name: 'Gold' as const,
    min: 1400, max: 1600,
    emoji: '🥇', color: '#F59E0B', glowColor: '#F59E0B40',
    title: 'Expert Chemist',
    rewards: ['Gold Rank Frame', 'Title: Expert Chemist'],
  },
  {
    name: 'Platinum' as const,
    min: 1600, max: 1800,
    emoji: '💠', color: '#60A5FA', glowColor: '#60A5FA40',
    title: 'Elite Chemist',
    rewards: ['Platinum Rank Frame', 'Title: Elite Chemist'],
  },
  {
    name: 'Diamond' as const,
    min: 1800, max: 2000,
    emoji: '💎', color: '#A78BFA', glowColor: '#A78BFA40',
    title: 'Diamond Chemist',
    rewards: ['Diamond Rank Frame', 'Title: Diamond Chemist'],
  },
  {
    name: 'Master Chemist' as const,
    min: 2000, max: Infinity,
    emoji: '👑', color: '#EC4899', glowColor: '#EC489940',
    title: 'Master Chemist',
    rewards: ['Master Rank Frame', 'Title: Master Chemist', 'Exclusive Master Badge'],
  },
];

export type Tier = typeof TIERS[number];
export type TierName = Tier['name'];

export function getTier(rating: number): Tier {
  for (let i = TIERS.length - 1; i >= 0; i--) {
    if (rating >= TIERS[i].min) return TIERS[i];
  }
  return TIERS[0];
}

export function getTierIndex(tier: Tier): number {
  return TIERS.findIndex((t) => t.name === tier.name);
}

export function getNextTier(tier: Tier): Tier | null {
  const idx = getTierIndex(tier);
  return idx < TIERS.length - 1 ? TIERS[idx + 1] : null;
}

export interface RankProgress {
  tier: Tier;
  nextTier: Tier | null;
  ptsInTier: number;
  ptsToNext: number | null;
  rangePts: number | null;
  progress: number;     // 0–1 within current tier
}

export function getRankProgress(rating: number): RankProgress {
  const tier     = getTier(rating);
  const nextTier = getNextTier(tier);
  const ptsInTier = rating - tier.min;
  const rangePts  = nextTier ? nextTier.min - tier.min : null;
  const ptsToNext = nextTier ? nextTier.min - rating : null;
  const progress  = rangePts ? Math.min(ptsInTier / rangePts, 1) : 1;
  return { tier, nextTier, ptsInTier, ptsToNext, rangePts, progress };
}

// ── API response types ────────────────────────────────────────────────────────

export interface Profile {
  player_id: string;
  name: string;
  email: string;
  rating: number;
  wins: number;
  losses: number;
  rank: string;
  rank_emoji: string;
  total_xp: number;
  current_streak: number;
  coins: number;
  hearts: number;
}

export interface DuelResultEntry {
  match_id: string;
  result: 'win' | 'loss' | 'tie';
  player_rating_before: number;
  rating_change: number;
  opponent_name: string;
  opponent_rating_before: number;
  played_at: string;
}

// ── Daily challenge types ─────────────────────────────────────────────────────

export interface ChallengeQuestion {
  id: string;
  display: string;       // e.g. "H₂ + O₂ → H₂O"
  labels: string[];      // one per term
  separator_idx: number; // → appears before labels[separator_idx]
  difficulty: 'easy' | 'medium' | 'hard';
  chip_max: number;
}

export interface DailyChallengeSubmission {
  score: number;
  correct_answers: number;
  total_questions: number;
  completion_time_ms: number;
  completed_at: string;
  rewards: { xp: number };
}

export interface DailyChallengeResponse {
  date: string;
  questions: ChallengeQuestion[];
  my_submission: DailyChallengeSubmission | null;
  secs_to_reset: number;
}

export interface QuestionResult {
  question_id: string;
  correct: boolean;
}

export interface SubmitChallengeResponse {
  score: number;
  correct_answers: number;
  total_questions: number;
  completion_time_ms: number;
  question_results: QuestionResult[];
  rewards: { xp: number };
  rank: number;
}

export interface DailyChallengeLeaderboardEntry {
  player_id: string;
  name: string;
  score: number;
  correct_answers: number;
  total_questions: number;
  completion_time_ms: number;
  position: number;
}

export interface DailyChallengeLeaderboardResponse {
  date: string;
  entries: DailyChallengeLeaderboardEntry[];
  my_player_id: string;
  my_rank: number;
  total_players: number;
}

export interface LeaderboardEntry {
  player_id: string;
  name: string;
  rating: number;
  wins: number;
  losses: number;
  rank: string;
  rank_emoji: string;
  position: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  my_entry: LeaderboardEntry | null;
  my_player_id: string;
  total_players: number;
}

export interface PublicProfileResponse {
  profile: Profile;
  history: DuelResultEntry[];
  global_rank: number;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function fetchProfile(): Promise<Profile> {
  const { data } = await http.get<Profile>('/api/v1/profile');
  return data;
}

export async function fetchHistory(): Promise<DuelResultEntry[]> {
  const { data } = await http.get<{ history: DuelResultEntry[] }>('/api/v1/profile/history');
  return data.history ?? [];
}

export async function fetchLeaderboard(): Promise<LeaderboardResponse> {
  const { data } = await http.get<LeaderboardResponse>('/api/v1/leaderboard');
  return data;
}

export async function fetchPublicProfile(playerId: string): Promise<PublicProfileResponse> {
  const { data } = await http.get<PublicProfileResponse>(`/api/v1/players/${playerId}/profile`);
  return data;
}

export async function fetchDailyChallenge(): Promise<DailyChallengeResponse> {
  const { data } = await http.get<DailyChallengeResponse>('/api/v1/daily-challenge');
  return data;
}

export async function submitDailyChallenge(payload: {
  completion_time_ms: number;
  answers: { question_id: string; coefficients: number[] }[];
}): Promise<SubmitChallengeResponse> {
  const { data } = await http.post<SubmitChallengeResponse>('/api/v1/daily-challenge/submit', payload);
  return data;
}

export async function fetchDailyChallengeLeaderboard(date?: string): Promise<DailyChallengeLeaderboardResponse> {
  const url = date ? `/api/v1/daily-challenge/leaderboard?date=${date}` : '/api/v1/daily-challenge/leaderboard';
  const { data } = await http.get<DailyChallengeLeaderboardResponse>(url);
  return data;
}
