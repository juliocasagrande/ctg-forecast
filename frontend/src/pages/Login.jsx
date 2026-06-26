import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../utils/api.js';
import PasswordInput, { getPasswordStrength } from '../components/ui/PasswordInput.jsx';

// ─── MODAL DE RECUPERAÇÃO DE SENHA ─────────────────────────────────────
function ForgotPasswordModal({ onClose }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!email) {
      setError('Informe seu e-mail');
      return;
    }
    setLoading(true);
    try {
      const r = await api.post('/auth/forgot-password', { email });
      setMessage(r.data.message || 'Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha.');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao solicitar redefinição.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: '32px', maxWidth: 420, width: '90%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}>
        <h2 style={{ margin: '0 0 8px', color: 'var(--ctg-navy)' }}>Esqueceu sua senha?</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 20 }}>
          Informe seu e-mail cadastrado. Enviaremos um link para redefinir sua senha.
        </p>

        {error && <div className="login-error">{error}</div>}
        {message && <div className="login-success" style={{ padding: '12px', fontSize: '0.85rem' }}>{message}</div>}

        {!message && (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">E-mail</label>
              <input
                className="form-input"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoComplete="email"
                required
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 12 }}
              disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar link de redefinição'}
            </button>
          </form>
        )}

        <button
          onClick={onClose}
          className="btn btn-secondary"
          style={{ width: '100%', marginTop: 12, background: 'transparent', border: '1px solid var(--border)' }}>
          Voltar ao login
        </button>
      </div>
    </div>
  );
}

const ROLE_OPTIONS = [
  {
    value: 'engenheiro',
    label: 'Engenheiro',
    desc: 'Acesso aos projetos designados. Preenche e atualiza o Forecast.',
    icon: 'ENG',
    needsArea: true,
  },
  {
    value: 'coordenador',
    label: 'Coordenador',
    desc: 'Acesso total à sua área. Gerencia equipe e dados dos projetos.',
    icon: 'CRD',
    needsArea: true,
  },
  {
    value: 'gerente',
    label: 'Gerente / Diretor',
    desc: 'Visualização de todos os dados. Sem poder de edição.',
    icon: 'GER',
    needsArea: false,
  },
];

const AREA_OPTIONS = [
  { value: 'eletrica',       label: 'Eng. Elétrica' },
  { value: 'mecanica',       label: 'Eng. Mecânica' },
  { value: 'confiabilidade', label: 'Eng. Confiabilidade' },
  { value: 'modernizacao',   label: 'Modernização' },
];

export default function Login() {
  const [tab, setTab] = useState('login');
  const [showForgot, setShowForgot] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState('engenheiro');
  const [regArea, setRegArea] = useState('');
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');
  const [regLoading, setRegLoading] = useState(false);

  const { login, loginWithAzure } = useAuth();
  const navigate = useNavigate();
  const [azureLoading, setAzureLoading] = useState(false);

  const selectedRoleOpt = ROLE_OPTIONS.find(r => r.value === regRole);
  const needsArea = selectedRoleOpt?.needsArea ?? false;
  const homePathFor = (user) =>
    user?.role === 'admin' && (!user?._originalRole || user._originalRole === 'admin')
      ? '/admin'
      : '/';

  const handleAzureLogin = async () => {
    setLoginError('');
    setAzureLoading(true);
    try {
      const user = await loginWithAzure();
      navigate(homePathFor(user));
    } catch (err) {
      console.error('[Azure SSO]', err);
      const errorCode = err.errorCode || err.name || '';
      // Só silencia se o usuário fechou o popup voluntariamente
      if (errorCode === 'user_cancelled' || errorCode === 'popup_window_error') {
        // noop
      } else {
        const msg = err.response?.data?.error || err.message || 'Erro ao autenticar com Microsoft.';
        setLoginError(msg);
      }
    } finally {
      setAzureLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const user = await login(email, password);
      // Se a senha é temporária, vai para o perfil para trocar
      if (user.forcePasswordChange) {
        navigate('/profile?changePassword=1');
      } else {
        navigate(homePathFor(user));
      }
    } catch (err) {
      setLoginError(err.response?.data?.error || 'Erro ao entrar. Tente novamente.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setRegError('');
    setRegSuccess('');
    if (needsArea && !regArea) {
      setRegError('Selecione a área de atuação');
      return;
    }
    setRegLoading(true);
    try {
      const r = await api.post('/auth/register', {
        name: regName,
        email: regEmail,
        password: regPassword,
        role: regRole,
        area: needsArea ? regArea : null,
      });
      setRegSuccess(r.data.message);
      setRegName(''); setRegEmail(''); setRegPassword(''); setRegArea('');
    } catch (err) {
      setRegError(err.response?.data?.error || 'Erro ao solicitar acesso.');
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <div className="login-page">
      <button
        type="button"
        onClick={() => navigate('/')}
        style={{
          position: 'fixed', top: 20, left: 20, zIndex: 10,
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,0.9)', border: '1.5px solid var(--border)',
          borderRadius: 8, cursor: 'pointer', padding: '8px 14px',
          color: 'var(--ctg-navy)', fontSize: '0.85rem', fontWeight: 600,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9.5L12 3l9 6.5" />
          <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
        </svg>
        Home
      </button>

      <div className="login-left">
        <div className="login-brand">
          <div className="login-logo">CTG<span>.</span>Engenharia</div>
          <p className="login-tagline">
            Plataforma integrada de soluções<br />e projetos de engenharia — CTG Brasil.
          </p>
        </div>
        <div className="login-decorlines">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="dline" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>

      <div className="login-right">
        <div className="login-form-wrap">

          <div className="login-tabs">
            <button className={`login-tab ${tab === 'login' ? 'active' : ''}`}
              onClick={() => { setTab('login'); setLoginError(''); }}>
              Entrar
            </button>
            <button className={`login-tab ${tab === 'register' ? 'active' : ''}`}
              onClick={() => { setTab('register'); setRegError(''); setRegSuccess(''); }}>
              Solicitar Acesso
            </button>
          </div>

          {/* ── LOGIN ── */}
          {tab === 'login' && (
            <>
              <div className="login-form-header">
                <h1>Bem-vindo</h1>
                <p>Entre com suas credenciais para acessar o sistema</p>
              </div>

              {loginError && <div className="login-error">{loginError}</div>}

              {/* SSO Microsoft */}
              <button
                type="button"
                onClick={handleAzureLogin}
                disabled={azureLoading || loginLoading}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 10, padding: '11px 16px', borderRadius: 8, cursor: 'pointer',
                  border: '1.5px solid #D1D5DB', background: '#fff', fontWeight: 600,
                  fontSize: '0.9rem', color: '#374151', transition: 'all 0.15s',
                  marginBottom: 16,
                }}
              >
                {/* Microsoft logo */}
                <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
                  <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
                  <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
                  <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
                </svg>
                {azureLoading ? 'Aguarde...' : 'Entrar com Microsoft'}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
                <span style={{ fontSize: '0.75rem', color: '#9CA3AF', whiteSpace: 'nowrap' }}>ou entre com senha</span>
                <div style={{ flex: 1, height: 1, background: '#E5E7EB' }} />
              </div>

              <form onSubmit={handleLogin}>
                <div className="form-group">
                  <label className="form-label">E-mail</label>
                  <input className="form-input" type="email" placeholder="seu@email.com"
                    value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Senha</label>
                  <input className="form-input" type="password" placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
                </div>
                <button type="submit" className="btn btn-primary"
                  style={{ width: '100%', padding: '12px', fontSize: '0.95rem', marginTop: 8 }}
                  disabled={loginLoading}>
                  {loginLoading ? 'Entrando...' : 'Entrar'}
                </button>
              </form>

              <p style={{ marginTop: 12, fontSize: '0.78rem', textAlign: 'center' }}>
                <button style={{ background: 'none', border: 'none', color: 'var(--ctg-blue)', cursor: 'pointer', fontWeight: 600, fontSize: 'inherit' }}
                  onClick={() => setShowForgot(true)}>
                  Esqueceu sua senha?
                </button>
              </p>

              <p style={{ marginTop: 8, fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                Ainda não tem conta?{' '}
                <button style={{ background: 'none', border: 'none', color: 'var(--ctg-blue)', cursor: 'pointer', fontWeight: 600, fontSize: 'inherit' }}
                  onClick={() => setTab('register')}>
                  Solicitar acesso
                </button>
              </p>
            </>
          )}

          {/* ── REGISTER ── */}
          {tab === 'register' && (
            <>
              <div className="login-form-header">
                <h1>Solicitar Acesso</h1>
                <p>Após o cadastro, aguarde a aprovação do administrador</p>
              </div>

              {regError && <div className="login-error">{regError}</div>}

              {regSuccess ? (
                <div className="login-success">
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--ctg-blue)', marginBottom: 10 }}>✓</div>
                  <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: 8 }}>Solicitação enviada!</div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{regSuccess}</p>
                  <button className="btn btn-secondary" style={{ marginTop: 20, width: '100%' }}
                    onClick={() => setTab('login')}>
                    Voltar ao login
                  </button>
                </div>
              ) : (
                <form onSubmit={handleRegister}>
                  <div className="form-group">
                    <label className="form-label">Nome completo</label>
                    <input className="form-input" placeholder="Seu nome completo"
                      value={regName} onChange={e => setRegName(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">E-mail corporativo</label>
                    <input className="form-input" type="email" placeholder="seu@ctgbrasil.com"
                      value={regEmail} onChange={e => setRegEmail(e.target.value)} required />
                  </div>
                  <PasswordInput
                    label="Senha"
                    value={regPassword}
                    onChange={setRegPassword}
                    placeholder="Crie uma senha segura"
                  />

                  {/* Seleção de perfil */}
                  <div className="form-group" style={{ marginBottom: 14 }}>
                    <label className="form-label">Meu perfil no sistema</label>
                    <div className="role-selector">
                      {ROLE_OPTIONS.map(opt => (
                        <div key={opt.value}
                          className={`role-option ${regRole === opt.value ? 'selected' : ''}`}
                          onClick={() => { setRegRole(opt.value); setRegArea(''); }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 'var(--radius-sm)',
                            background: 'var(--ctg-navy)', color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.05em', flexShrink: 0,
                          }}>{opt.icon}</div>
                          <div style={{ flex: 1 }}>
                            <div className="role-option-label">{opt.label}</div>
                            <div className="role-option-desc">{opt.desc}</div>
                          </div>
                          <div className="role-option-check">
                            {regRole === opt.value ? '●' : '○'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Área de atuação — aparece só para engenheiro/coordenador */}
                  {needsArea && (
                    <div className="form-group" style={{ marginBottom: 16 }}>
                      <label className="form-label">Área de atuação</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {AREA_OPTIONS.map(a => (
                          <div key={a.value}
                            onClick={() => setRegArea(a.value)}
                            style={{
                              padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                              border: `1.5px solid ${regArea === a.value ? 'var(--ctg-blue)' : 'var(--border)'}`,
                              background: regArea === a.value ? 'rgba(0,112,184,0.06)' : 'transparent',
                              display: 'flex', alignItems: 'center', gap: 8,
                              transition: 'all 0.15s',
                            }}>
                            <div style={{
                              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                              background: regArea === a.value ? 'var(--ctg-blue)' : 'var(--border)',
                            }} />
                            <span style={{ fontSize: '0.8rem', fontWeight: regArea === a.value ? 600 : 400, color: regArea === a.value ? 'var(--ctg-navy)' : 'var(--text-secondary)' }}>
                              {a.label}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button type="submit" className="btn btn-primary"
                    style={{ width: '100%', padding: '12px', fontSize: '0.95rem' }}
                    disabled={regLoading || !getPasswordStrength(regPassword).allPassed || (needsArea && !regArea)}>
                    {regLoading ? 'Enviando...' : 'Solicitar Acesso'}
                  </button>
                </form>
              )}

              <p style={{ marginTop: 16, fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                Já tem conta?{' '}
                <button style={{ background: 'none', border: 'none', color: 'var(--ctg-blue)', cursor: 'pointer', fontWeight: 600, fontSize: 'inherit' }}
                  onClick={() => setTab('login')}>
                  Entrar
                </button>
              </p>
            </>
          )}

          {showForgot && <ForgotPasswordModal onClose={() => setShowForgot(false)} />}
        </div>

        <div style={{
          position: 'absolute', bottom: 20, left: 0, right: 0,
          textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          userSelect: 'none',
        }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
            Desenvolvido por
          </span>
          <span style={{
            fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.02em',
            background: 'linear-gradient(90deg, #1a56db, #0ea5e9, #1d4ed8, #0ea5e9, #1a56db)',
            backgroundSize: '300% auto',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text', animation: 'devShimmer 4s linear infinite', display: 'inline-block',
          }}>
            Júlio Casagrande
          </span>
        </div>
      </div>
    </div>
  );
}
