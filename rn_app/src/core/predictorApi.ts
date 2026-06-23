import { http } from './api';

export interface PredictorQuestion {
  id: string;
  prompt: string;
  reactants: string;
  condition: string;
  concept: string;
  options: string[];
  correct_index: number;
}

export interface AnswerResult {
  question_id: string;
  correct: boolean;
  correct_index: number;
}

export interface SubmitPredictorResponse {
  correct: number;
  total: number;
  score: number;
  xp_earned: number;
  coins_earned?: number;
  results: AnswerResult[];
  completed_at: string;
}

export async function fetchLessonQuestions(lessonId: string): Promise<PredictorQuestion[]> {
  const { data } = await http.get(`/api/v1/predictor/lesson/${lessonId}`);
  return data.questions ?? [];
}

export async function submitLesson(
  lessonId: string,
  answers: { question_id: string; selected_index: number }[],
  elapsedMs: number,
): Promise<SubmitPredictorResponse> {
  const { data } = await http.post(`/api/v1/predictor/lesson/${lessonId}/submit`, {
    answers,
    elapsed_ms: elapsedMs,
  });
  return data;
}

export async function fetchPracticeQuestion(): Promise<PredictorQuestion> {
  const { data } = await http.get('/api/v1/predictor/practice');
  return data.question;
}
