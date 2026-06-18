import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8080';

const http = axios.create({ baseURL: BASE_URL });

http.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('jwt');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function login(email, password) {
  const { data } = await http.post('/auth/login', { email, password });
  await AsyncStorage.setItem('jwt', data.token);
  return data;
}

export async function logout() {
  await AsyncStorage.removeItem('jwt');
}

export async function getDueDrills() {
  const { data } = await http.get('/api/v1/drills/due');
  return data.drills ?? [];
}

export async function submitAttempt({ drillId, isCorrect, timeTakenMs, answer }) {
  const { data } = await http.post('/api/v1/drills/attempt', {
    drill_id: drillId,
    is_correct: isCorrect,
    time_taken_ms: timeTakenMs,
    answer,
  });
  return data;
}

export async function getLeaderboard() {
  const { data } = await http.get('/api/v1/leaderboard');
  return data.leaderboard ?? [];
}

export async function getHint({ questionData, studentAnswer, correctAnswer }) {
  const { data } = await http.post('/api/v1/hint', {
    question_data: questionData,
    student_answer: studentAnswer,
    correct_answer: correctAnswer,
  });
  return data.hint;
}
