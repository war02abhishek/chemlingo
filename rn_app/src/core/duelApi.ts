import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'https://flasky-qn0j.onrender.com');

// Derives ws:// or wss:// from the http BASE_URL.
export const WS_BASE = BASE_URL.replace(/^http/, 'ws');

const http = axios.create({ baseURL: BASE_URL });
http.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('jwt');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export interface CreateMatchResponse {
  match_id: string;
  player_index: number;
  status: 'waiting' | 'ready';
}

export async function createOrJoinMatch(name: string): Promise<CreateMatchResponse> {
  const { data } = await http.post<CreateMatchResponse>('/api/v1/duel/match', { name });
  return data;
}

/** Returns the stored JWT token (needed for WS ?token= auth). */
export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('jwt');
}
