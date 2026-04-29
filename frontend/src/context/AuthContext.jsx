import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api.js';

const AuthContext = createContext(null);

// Revalida o role do usuário a cada 5 minutos para capturar
// início/fim de delegações sem exigir novo login
const REVALIDATE_INTERVAL = 5 * 60 * 1000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const r = await api.get('/auth/me');
      setUser(r.data);
    } catch {
      localStorage.removeItem('ctg_token');
      delete api.defaults.headers.common['Authorization'];
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('ctg_token');
    if (token) api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    fetchMe().finally(() => setLoading(false));

    // Revalida periodicamente para detectar delegações que começam/terminam
    const interval = setInterval(fetchMe, REVALIDATE_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchMe]);

  const login = useCallback(async (email, password) => {
    const r = await api.post('/auth/login', { email, password });
    const { token, user } = r.data;
    localStorage.setItem('ctg_token', token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(user);
    
    // Se a senha é temporária, força troca
    if (user.must_change_password) {
      return { ...user, forcePasswordChange: true };
    }
    return user;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
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

export function useAuth() { return useContext(AuthContext); }

export function useRole() {
  const { user } = useAuth();
  const role = user?.role;

  const isAdmin       = role === 'admin';
  const isCoordenador = role === 'coordenador';
  const isEngenheiro  = role === 'engenheiro';
  const isPlanejador  = role === 'planejador';
  const isGerente     = role === 'gerente';

  // Pode ver tudo (sem restrição de área ou projeto)
  const canViewAll = isAdmin || isCoordenador || isPlanejador || isGerente;

  // Pode editar (gerente é view-only)
  const canEdit = !isGerente && role !== undefined;

  // Pode gerenciar projetos (criar, editar, excluir)
  const canManage = isAdmin || isCoordenador || isPlanejador;

  // Restrição de área: coordenador e engenheiro têm área definida
  const userArea = user?.area || null;
  const hasAreaRestriction = (isCoordenador || isEngenheiro) && !!userArea;

  return {
    role,
    isAdmin,
    isCoordenador,
    isEngenheiro,
    isPlanejador,
    isGerente,
    canEdit,
    canManage,
    canViewAll,
    userArea,
    hasAreaRestriction,
  };
}

export default AuthContext;
