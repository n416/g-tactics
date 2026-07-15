import { hc } from 'hono/client';
import type { AppType } from '../../../backend/src/index';

// 本番環境とローカル環境でURLを切り替える場合
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787';

export const client = hc<AppType>(API_URL);