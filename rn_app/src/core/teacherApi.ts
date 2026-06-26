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
  paused: boolean;
  topic_start_date: string | null;
  topic_end_date: string | null;
  extended_days: number;
  batch_code: string;
}

export interface AddStudentResult {
  created: boolean;
  temp_password?: string;
}

export interface TopicSequenceRow {
  id: string;
  slug: string;
  title: string;
  icon: string;
  position: number;
  status: 'done' | 'current' | 'locked';
  day_current: number;
  day_total: number;
  paused: boolean;
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

export interface TopicProgress {
  topic_title: string;
  lessons_completed: number;
  total_lessons: number;
  boss_defeated: boolean;
}

export interface RecentLesson {
  lesson_title: string;
  topic_title: string;
  score: number;
  completed_at: string;
}

export interface StudentDetail {
  id: string;
  full_name: string;
  email: string;
  current_streak: number;
  total_xp: number;
  rating: number;
  last_active: string | null;
  lessons_total: number;
  accuracy_pct: number;
  topics: TopicProgress[];
  recent_lessons: RecentLesson[];
}

export async function fetchStudentDetail(studentId: string): Promise<StudentDetail> {
  const { data } = await http.get(`/api/v1/teacher/students/${studentId}`);
  return data;
}

export async function addStudentToBatch(batchId: string, email: string): Promise<AddStudentResult> {
  const { data } = await http.post<AddStudentResult>(`/api/v1/teacher/batches/${batchId}/students`, { email });
  return data;
}

export async function getBatchCurriculum(batchId: string): Promise<TopicSequenceRow[]> {
  const { data } = await http.get(`/api/v1/teacher/batches/${batchId}/curriculum`);
  return data.topics ?? [];
}

export async function advanceTopic(batchId: string): Promise<void> {
  await http.put(`/api/v1/teacher/batches/${batchId}/topic/advance`);
}

export async function pauseTopic(batchId: string): Promise<void> {
  await http.put(`/api/v1/teacher/batches/${batchId}/topic/pause`);
}

export async function extendTopic(batchId: string): Promise<void> {
  await http.put(`/api/v1/teacher/batches/${batchId}/topic/extend`);
}
