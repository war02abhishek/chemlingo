import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8080';

export const http = axios.create({ baseURL: BASE_URL });

http.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('jwt');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function login(email, password) {
  const { data } = await http.post('/auth/login', { email, password });
  await AsyncStorage.setItem('jwt', data.token);
  const role = data.student?.role ?? data.role ?? 'student';
  await AsyncStorage.setItem('role', role);
  return data;
}

export async function logout() {
  await AsyncStorage.removeItem('jwt');
}
