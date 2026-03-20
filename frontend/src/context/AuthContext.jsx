import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ctg_token');
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      api.get('/auth/me')
        .then(r => setUser(r.data))
        .catch(() => { localStorage.removeItem('ctg_token'); })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await api.post('/auth/login', { email, password });
    const { token, user } = r.data;
    localStorage.setItem('ctg_token', token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('ctg_token');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
  }, []);

  const updateUser = useCallback((data) => setUser(u => ({ ...u, ...data })), []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useRole() {
  const { user } = useAuth();
  return {
    role: user?.role,
    isAdmin:       user?.role === 'admin',
    isGestor:      user?.role === 'gestor',
    isEngenheiro:  user?.role === 'engenheiro',
    isPlanejador:  user?.role === 'planejador',
    canEdit:       user?.role !== 'admin',
    canManage:     user?.role === 'admin' || user?.role === 'gestor' || user?.role === 'planejador',
    canViewAll:    user?.role === 'admin' || user?.role === 'gestor' || user?.role === 'planejador',
  };
}

export default AuthContext;
