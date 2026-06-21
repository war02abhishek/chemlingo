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

export interface CompoundIon {
  id: string;
  symbol: string;        // "Na⁺"
  base_formula: string;  // "Na" — for building formula preview
  name: string;
  charge: number;
  polyatomic: boolean;
}

export interface SelectedIon {
  ion_id: string;
  count: number;
}

export type CompoundDifficulty = 'easy' | 'medium' | 'hard';

export interface CompoundQuestion {
  id: string;
  name: string;
  difficulty: CompoundDifficulty;
  hint: string;
  available_ions: CompoundIon[];
}

export interface CompoundSubmission {
  score: number;
  correct_answers: number;
  total_questions: number;
  completion_time_ms: number;
  completed_at: string;
  rewards: { xp: number };
  personal_best: number;
}

export interface CompoundDailyResponse {
  date: string;
  questions: CompoundQuestion[];
  my_submission: CompoundSubmission | null;
  personal_best: number;
  secs_to_reset: number;
}

export interface CompoundQuestionResult {
  question_id: string;
  correct: boolean;
  correct_formula: string;
  correct_ions: SelectedIon[];
}

export interface CompoundSubmitResponse {
  score: number;
  correct_answers: number;
  total_questions: number;
  completion_time_ms: number;
  question_results: CompoundQuestionResult[];
  rewards: { xp: number };
  rank: number;
  personal_best: number;
}

export interface CompoundLeaderboardEntry {
  player_id: string;
  name: string;
  score: number;
  correct_answers: number;
  total_questions: number;
  completion_time_ms: number;
  position: number;
}

export interface CompoundLeaderboardResponse {
  date: string;
  entries: CompoundLeaderboardEntry[];
  my_player_id: string;
  my_rank: number;
  total_players: number;
}

export interface PracticeQuestion {
  question: CompoundQuestion;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function fetchCompoundDaily(): Promise<CompoundDailyResponse> {
  const { data } = await http.get<CompoundDailyResponse>('/api/v1/compound/daily');
  return data;
}

export async function submitCompoundDaily(payload: {
  completion_time_ms: number;
  answers: { question_id: string; selected_ions: SelectedIon[] }[];
}): Promise<CompoundSubmitResponse> {
  const { data } = await http.post<CompoundSubmitResponse>('/api/v1/compound/daily/submit', payload);
  return data;
}

export async function fetchCompoundLeaderboard(date?: string): Promise<CompoundLeaderboardResponse> {
  const url = date
    ? `/api/v1/compound/daily/leaderboard?date=${date}`
    : '/api/v1/compound/daily/leaderboard';
  const { data } = await http.get<CompoundLeaderboardResponse>(url);
  return data;
}

export async function fetchPracticeQuestion(
  difficulty: 'easy' | 'medium' | 'hard' | 'any' = 'any',
): Promise<PracticeQuestion> {
  const { data } = await http.get<PracticeQuestion>(
    `/api/v1/compound/practice?difficulty=${difficulty}`,
  );
  return data;
}

export async function checkPracticeAnswer(payload: {
  question_id: string;
  selected_ions: SelectedIon[];
}): Promise<{ correct: boolean; charge_balance: number }> {
  const { data } = await http.post('/api/v1/compound/practice/check', payload);
  return data;
}

// ── Formula preview helper ────────────────────────────────────────────────────

const SUB = '₀₁₂₃₄₅₆₇₈₉';
function toSub(n: number): string {
  return String(n)
    .split('')
    .map((d) => SUB[parseInt(d)])
    .join('');
}

export function buildFormulaPreview(
  ions: CompoundIon[],
  selected: SelectedIon[],
): string {
  if (selected.length === 0) return '?';

  const ionById = Object.fromEntries(ions.map((i) => [i.id, i]));

  // Cations first (+), then anions (-)
  const sorted = [...selected]
    .filter((s) => s.count > 0)
    .sort((a, b) => {
      const aCharge = ionById[a.ion_id]?.charge ?? 0;
      const bCharge = ionById[b.ion_id]?.charge ?? 0;
      return bCharge - aCharge; // positive first
    });

  return sorted
    .map(({ ion_id, count }) => {
      const ion = ionById[ion_id];
      if (!ion) return '';
      const sub = count > 1 ? toSub(count) : '';
      if (ion.polyatomic && count > 1) return `(${ion.base_formula})${sub}`;
      return `${ion.base_formula}${sub}`;
    })
    .join('');
}
