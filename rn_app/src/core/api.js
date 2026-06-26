import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8080';

export const http = axios.create({ baseURL: BASE_URL });

http.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('jwt');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let refreshQueue = [];

function drainQueue(newToken, error) {
  refreshQueue.forEach((cb) => (error ? cb.reject(error) : cb.resolve(newToken)));
  refreshQueue = [];
}

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    // Try silent token refresh before logging out
    const refreshToken = await AsyncStorage.getItem('refresh_token');
    if (!refreshToken) {
      await AsyncStorage.multiRemove(['jwt', 'role', 'refresh_token']);
      DeviceEventEmitter.emit('unauthorized');
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshQueue.push({
          resolve: (token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(http(original));
          },
          reject,
        });
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refresh_token: refreshToken });
      await AsyncStorage.multiSet([['jwt', data.token], ['refresh_token', data.refresh_token]]);
      http.defaults.headers.common.Authorization = `Bearer ${data.token}`;
      drainQueue(data.token, null);
      original.headers.Authorization = `Bearer ${data.token}`;
      return http(original);
    } catch (refreshErr) {
      drainQueue(null, refreshErr);
      await AsyncStorage.multiRemove(['jwt', 'role', 'refresh_token']);
      DeviceEventEmitter.emit('unauthorized');
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  }
);

export async function login(email, password) {
  const { data } = await http.post('/auth/login', { email, password });
  await AsyncStorage.multiSet([
    ['jwt', data.token],
    ['refresh_token', data.refresh_token ?? ''],
    ['role', data.student?.role ?? data.role ?? 'student'],
    ['needs_password_change', data.student?.needs_password_change ? '1' : '0'],
    ['is_new_user', '0'],
  ]);
  return data;
}

export async function register(name, email, password, role) {
  const { data } = await http.post('/auth/register', { name, email, password, role });
  const resolvedRole = data.student?.role ?? role ?? 'student';
  await AsyncStorage.multiSet([
    ['jwt', data.token],
    ['refresh_token', data.refresh_token ?? ''],
    ['role', resolvedRole],
    ['needs_password_change', '0'],
    ['is_new_user', resolvedRole === 'student' ? '1' : '0'],
  ]);
  return data;
}

export async function logout() {
  await AsyncStorage.multiRemove(['jwt', 'role', 'refresh_token']);
}
