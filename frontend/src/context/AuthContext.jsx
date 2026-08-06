import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../utils/api.js';
import { msalInstance, msalInitialized, loginRequest } from '../utils/msalConfig.js';

const AuthContext = createContext(null);

// Revalida o role/permissões do usuário periodicamente para capturar início/fim de
// delegações e mudanças de acesso por página (ver AdminPanel) sem exigir novo login.
const REVALIDATE_INTERVAL = 30 * 1000;

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonicalize(value[key]);
      return result;
    }, {});
  }
  return value;
}

function sameUserState(current, incoming) {
  if (current === incoming) return true;
  if (!current || !incoming) return false;
  return JSON.stringify(canonicalize(current)) === JSON.stringify(canonicalize(incoming));
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const r = await api.get('/auth/me');
      // Mantém a mesma referência quando role/permissões/dados não mudaram. Isso
      // evita que toda a aplicação refaça buscas e mostre loaders a cada 30s.
      setUser(current => sameUserState(current, r.data) ? current : r.data);
    } catch (err) {
      // Só encerra a sessão quando o servidor confirmou que ela não é mais válida.
      // Falhas transitórias de rede/servidor não devem desmontar a tela do usuário.
      if ([401, 403, 404].includes(err.response?.status)) setUser(null);
    }
  }, []);

  useEffect(() => {
    fetchMe().finally(() => setLoading(false));

    // Revalida periodicamente para detectar delegações que começam/terminam
    const interval = setInterval(fetchMe, REVALIDATE_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchMe]);

  const login = useCallback(async (email, password) => {
    const r = await api.post('/auth/login', { email, password });
    const { user } = r.data;
    setUser(user);

    // Se a senha é temporária, força troca
    if (user.must_change_password) {
      return { ...user, forcePasswordChange: true };
    }
    return user;
  }, []);

  const loginWithAzure = useCallback(async () => {
    await msalInitialized;
    let result;
    try {
      result = await msalInstance.loginPopup(loginRequest);
    } catch (err) {
      if (err.errorCode === 'interaction_in_progress') {
        // Limpa estado pendente e retentar
        await msalInstance.handleRedirectPromise();
        result = await msalInstance.loginPopup(loginRequest);
      } else {
        throw err;
      }
    }
    const r = await api.post('/auth/azure-login', { idToken: result.idToken });
    const { user } = r.data;
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    setUser(null);
  }, []);

  const updateUser = useCallback((data) => setUser(u => ({ ...u, ...data })), []);

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithAzure, logout, updateUser, refreshUser: fetchMe }}>
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
  const isDiretor     = role === 'diretor';

  // Pode ver tudo (sem restrição de área ou projeto)
  const canViewAll = isAdmin || isCoordenador || isPlanejador || isGerente || isDiretor;

  // Pode editar (gerente e diretor são view-only)
  const canEdit = !isGerente && !isDiretor && role !== undefined;

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
    isDiretor,
    canEdit,
    canManage,
    canViewAll,
    userArea,
    hasAreaRestriction,
  };
}

// Permissão de página configurada para o usuário logado (ver AdminPanel).
// Sem override, o padrão é 'none' (fail-closed) — o admin precisa conceder acesso
// explicitamente por página. Isso vale também para admins: o backend sempre libera
// admin nas rotas (bypass de segurança), mas a visibilidade no menu/rotas respeita
// a configuração — assim o próprio admin pode enxugar a sidebar sem perder acesso
// real via URL/API.
export function usePageAccess(pageKey) {
  const { user } = useAuth();
  return user?._pageAccess?.[pageKey] || 'none';
}

// Habilitado por padrão — só retorna false quando o admin desabilitou explicitamente
// este botão para o usuário (ver AdminPanel > Configurações de Funções).
export function useButtonAccess(pageKey, buttonKey) {
  const { user } = useAuth();
  return user?._buttonAccess?.[pageKey]?.[buttonKey] !== false;
}

export default AuthContext;
