import { http } from './api';

export interface TeacherOverview {
  active_students: number;
  avg_streak: number;
  lessons_this_week: number;
  at_risk_count: number;
}

export interface StudentRow {
  id: string;
  full_name: string;
  email: string;
  current_streak: number;
  total_xp: number;
  lessons_this_week: number;
  last_active: string | null;
}

export interface WeakLesson {
  lesson_title: string;
  topic_title: string;
  avg_score: number;
  struggling_count: number;
}

export interface BatchRow {
  id: string;
  name: string;
  student_count: number;
  current_topic_id: string;
}

export async function fetchTeacherOverview(): Promise<TeacherOverview> {
  const { data } = await http.get('/api/v1/teacher/overview');
  return data;
}

export async function fetchBatchStudents(batchId?: string): Promise<StudentRow[]> {
  const { data } = await http.get('/api/v1/teacher/students', { params: batchId ? { batch_id: batchId } : {} });
  return data.students ?? [];
}

export async function fetchInsights(): Promise<WeakLesson[]> {
  const { data } = await http.get('/api/v1/teacher/insights');
  return data.weak_lessons ?? [];
}

export async function fetchBatches(): Promise<BatchRow[]> {
  const { data } = await http.get('/api/v1/teacher/batches');
  return data.batches ?? [];
}

export async function createBatch(name: string): Promise<{ id: string }> {
  const { data } = await http.post('/api/v1/teacher/batches', { name });
  return data;
}
