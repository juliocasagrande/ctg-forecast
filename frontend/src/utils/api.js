import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // send httpOnly cookies with every request
});

// Auto-set token from localStorage as fallback (migration period)
// Primary auth is via httpOnly cookie (sent automatically with withCredentials: true)
api.interceptors.request.use(config => {
  const token = localStorage.getItem('ctg_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redirect to login on 401, clean up localStorage
// Skip redirect for /auth/me (session check) and when already on /login
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      const url = err.config?.url || '';
      const isAuthCheck = url.includes('/auth/me');
      const isOnLogin = window.location.pathname === '/login';
      localStorage.removeItem('ctg_token');
      if (!isAuthCheck && !isOnLogin) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
