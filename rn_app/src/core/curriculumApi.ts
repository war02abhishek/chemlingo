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
