import axios from 'axios';

import { getTelemetrySessionId } from './telemetry.js';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // auth via httpOnly cookie
});

// Limpa token legado em localStorage (migração — versões antigas espelhavam o JWT lá).
try { localStorage.removeItem('ctg_token'); } catch { /* ignore */ }

api.interceptors.request.use(config => {
  const sessionId = getTelemetrySessionId();
  if (sessionId && !String(config.url || '').includes('/telemetry/')) {
    config.headers['X-Session-Id'] = sessionId;
    config.headers['X-App-Page'] = window.location.pathname;
  }
  if (config.data instanceof FormData) {
    if (typeof config.headers?.delete === 'function') {
      config.headers.delete('Content-Type');
      config.headers.delete('content-type');
    } else if (config.headers) {
      delete config.headers['Content-Type'];
      delete config.headers['content-type'];
    }
  }
  return config;
});

// Redirect para /login em 401 (exceto durante checagem inicial de sessão)
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      const url = err.config?.url || '';
      const isAuthCheck = url.includes('/auth/me');
      const publicPaths = ['/login', '/reset-password', '/'];
      const isPublicPath = publicPaths.includes(window.location.pathname);
      if (!isAuthCheck && !isPublicPath) {
        window.location.href = '/';
      }
    }
    return Promise.reject(err);
  }
);

export default api;


