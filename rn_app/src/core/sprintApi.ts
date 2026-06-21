import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8080';

const http = axios.create({ baseURL: BASE_URL });
http.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('jwt');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type SprintQuestionType = 'atomic_number' | 'symbol' | 'group' | 'period';

export interface SprintQuestion {
  id: string;
  type: SprintQuestionType;
  prompt: string;
  options: string[]; // exactly 4 choices
}

export interface SprintSubmission {
  score: number;
  correct_answers: number;
  total_questions: number;
  completion_time_ms: number;
  completed_at: string;
  rewards: { xp: number };
  personal_best: number;
}

export interface SprintResponse {
  date: string;
  questions: SprintQuestion[];
  my_submission: SprintSubmission | null;
  personal_best: number;
  secs_to_reset: number;
}

export interface SprintQuestionResult {
  question_id: string;
  correct: boolean;
  selected_index: number;
  correct_index: number;
  correct_option: string;
}

export interface SprintSubmitResponse {
  score: number;
  correct_answers: number;
  total_questions: number;
  completion_time_ms: number;
  question_results: SprintQuestionResult[];
  rewards: { xp: number };
  rank: number;
  personal_best: number;
}

export interface SprintLeaderboardEntry {
  player_id: string;
  name: string;
  score: number;
  correct_answers: number;
  total_questions: number;
  completion_time_ms: number;
  position: number;
}

export interface SprintLeaderboardResponse {
  date: string;
  entries: SprintLeaderboardEntry[];
  my_player_id: string;
  my_rank: number;
  total_players: number;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function fetchSprint(): Promise<SprintResponse> {
  const { data } = await http.get<SprintResponse>('/api/v1/sprint');
  return data;
}

export async function submitSprint(payload: {
  completion_time_ms: number;
  answers: { question_id: string; selected_index: number }[];
}): Promise<SprintSubmitResponse> {
  const { data } = await http.post<SprintSubmitResponse>('/api/v1/sprint/submit', payload);
  return data;
}

export async function fetchSprintLeaderboard(date?: string): Promise<SprintLeaderboardResponse> {
  const url = date ? `/api/v1/sprint/leaderboard?date=${date}` : '/api/v1/sprint/leaderboard';
  const { data } = await http.get<SprintLeaderboardResponse>(url);
  return data;
}
