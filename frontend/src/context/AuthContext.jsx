import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ctg_token');
    if (token) api.defaults.headers.common['Authorization'] = `Bearer ${token}`;

    api.get('/auth/me')
      .then(r => setUser(r.data))
      .catch(() => {
        localStorage.removeItem('ctg_token');
        delete api.defaults.headers.common['Authorization'];
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await api.post('/auth/login', { email, password });
    const { token, user } = r.data;
    localStorage.setItem('ctg_token', token);
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(user);
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
  const isGestor      = role === 'gestor';       // legado — mantido para compatibilidade
  const isCoordenador = role === 'coordenador';
  const isEngenheiro  = role === 'engenheiro';
  const isPlanejador  = role === 'planejador';
  const isGerente     = role === 'gerente';

  // Pode ver tudo (sem restrição de área ou projeto)
  const canViewAll = isAdmin || isGestor || isCoordenador || isPlanejador || isGerente;

  // Pode editar (gerente é view-only)
  const canEdit = !isGerente && role !== undefined;

  // Pode gerenciar projetos (criar, editar, excluir)
  const canManage = isAdmin || isGestor || isCoordenador || isPlanejador;

  // Restrição de área: coordenador e engenheiro têm área definida
  const userArea = user?.area || null;
  const hasAreaRestriction = (isCoordenador || isEngenheiro) && !!userArea;

  return {
    role,
    isAdmin,
    isGestor,
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
