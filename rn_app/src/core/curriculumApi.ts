import { http } from './api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TopicWithProgress {
  id: string;
  slug: string;
  title: string;
  icon: string;
  position: number;
  total_lessons: number;
  lessons_completed: number;
  boss_defeated: boolean;
  // "" = unlocked, "self" = beat prev boss, "teacher" = waiting for teacher
  lock_reason: '' | 'self' | 'teacher';
}

export interface LessonWithStatus {
  id: string;
  slug: string;
  title: string;
  position: number;
  game_mode: 'reaction_predictor' | 'periodic_sprint' | 'compound_builder';
  concept_text: string;
  xp_reward: number;
  coin_reward: number;
  completed: boolean;
  score: number;
}

export interface CurriculumResponse {
  topics: TopicWithProgress[];
}

export interface LessonsResponse {
  lessons: LessonWithStatus[];
}

export interface CompleteLessonResponse {
  xp_earned: number;
  coins_earned: number;
  already_done: boolean;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function fetchCurriculum(): Promise<CurriculumResponse> {
  const { data } = await http.get<CurriculumResponse>('/api/v1/curriculum');
  return data;
}

export async function fetchTopicLessons(topicSlug: string): Promise<LessonsResponse> {
  const { data } = await http.get<LessonsResponse>(`/api/v1/curriculum/progress?topic=${topicSlug}`);
  return data;
}

export async function completeLesson(lessonId: string, score: number): Promise<CompleteLessonResponse> {
  const { data } = await http.post<CompleteLessonResponse>(`/api/v1/lessons/${lessonId}/complete`, { score });
  return data;
}

export interface BossQuestion {
  id: string;
  prompt: string;
  reactants: string;
  condition: string;
  concept: string;
  options: string[];
  correct_index: number;
}

export interface BossSubmitResponse {
  correct: number;
  total: number;
  score: number;
  passed: boolean;
  xp_earned: number;
  coins_earned: number;
  results: { question_id: string; correct: boolean; correct_index: number }[];
}

export async function joinBatch(code: string): Promise<{ ok: boolean; batch_name: string }> {
  const { data } = await http.post('/api/v1/batches/join', { code });
  return data;
}

export async function setPassword(password: string): Promise<void> {
  await http.put('/api/v1/profile/password', { password });
}

export async function fetchBossQuestions(topicId: string): Promise<BossQuestion[]> {
  const { data } = await http.get(`/api/v1/topics/${topicId}/boss`);
  return data.questions ?? [];
}

export async function submitBoss(
  topicId: string,
  answers: { question_id: string; selected_index: number }[],
): Promise<BossSubmitResponse> {
  const { data } = await http.post<BossSubmitResponse>(`/api/v1/topics/${topicId}/boss/submit`, { answers });
  return data;
}
