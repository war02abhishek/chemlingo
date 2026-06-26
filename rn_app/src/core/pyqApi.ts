import { http } from './api';

export interface PYQQuestion {
  id: string;
  exam: string;       // "JEE Main" | "JEE Advanced" | "NEET"
  year: number;
  statement: string;
  options: string[];
  explanation: string;
}

export interface PYQSessionResponse {
  topic_slug: string;
  questions: PYQQuestion[];
  best_score: number;
  total: number;
}

export interface PYQResult {
  question_id: string;
  correct: boolean;
  correct_index: number;
  explanation: string;
}

export interface PYQSubmitResponse {
  correct: number;
  total: number;
  score: number;        // 0–100
  xp_earned: number;
  coins_earned: number;
  results: PYQResult[];
}

export async function fetchPYQQuestions(topicId: string): Promise<PYQSessionResponse> {
  const { data } = await http.get<PYQSessionResponse>(`/api/v1/topics/${topicId}/pyq`);
  return data;
}

export async function submitPYQ(
  topicId: string,
  answers: { question_id: string; selected_index: number }[]
): Promise<PYQSubmitResponse> {
  const { data } = await http.post<PYQSubmitResponse>(`/api/v1/topics/${topicId}/pyq/submit`, { answers });
  return data;
}
