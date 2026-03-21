import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../utils/api.js';
import PasswordInput, { getPasswordStrength } from '../components/ui/PasswordInput.jsx';

const ROLE_OPTIONS = [
  {
    value: 'engenheiro',
    label: 'Engenheiro Responsável',
    desc: 'Acesso aos projetos designados. Preenche e atualiza o Forecast.',
    icon: 'ENG',
  },
  {
    value: 'planejador',
    label: 'Planejador',
    desc: 'Visão geral de todos os projetos. Responsável pelo preenchimento do Budget.',
    icon: 'PLN',
  },
  {
    value: 'gestor',
    label: 'Coordenador / Gerente',
    desc: 'Visão completa de todos os projetos. Gerencia equipes e dados.',
    icon: 'GES',
  },
];

export default function Login() {
  const [tab, setTab] = useState('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState('engenheiro');
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');
  const [regLoading, setRegLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const user = await login(email, password);
      navigate(user.role === 'admin' ? '/admin' : '/');
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
    setRegLoading(true);
    try {
      const r = await api.post('/auth/register', {
        name: regName,
        email: regEmail,
        password: regPassword,
        role: regRole,
      });
      setRegSuccess(r.data.message);
      setRegName(''); setRegEmail(''); setRegPassword('');
    } catch (err) {
      setRegError(err.response?.data?.error || 'Erro ao solicitar acesso.');
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="login-brand">
          <div className="login-logo">CTG<span>.</span>Forecast</div>
          <p className="login-tagline">
            Controle de forecast de projetos<br />de engenharia e automação.
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
            <button
              className={`login-tab ${tab === 'login' ? 'active' : ''}`}
              onClick={() => { setTab('login'); setLoginError(''); }}
            >
              Entrar
            </button>
            <button
              className={`login-tab ${tab === 'register' ? 'active' : ''}`}
              onClick={() => { setTab('register'); setRegError(''); setRegSuccess(''); }}
            >
              Solicitar Acesso
            </button>
          </div>

          {tab === 'login' && (
            <>
              <div className="login-form-header">
                <h1>Bem-vindo</h1>
                <p>Entre com suas credenciais para acessar o sistema</p>
              </div>

              {loginError && <div className="login-error">{loginError}</div>}

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

              <p style={{ marginTop: 20, fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                Ainda não tem conta?{' '}
                <button style={{ background: 'none', border: 'none', color: 'var(--ctg-blue)', cursor: 'pointer', fontWeight: 600, fontSize: 'inherit' }}
                  onClick={() => setTab('register')}>
                  Solicitar acesso
                </button>
              </p>
            </>
          )}

          {tab === 'register' && (
            <>
              <div className="login-form-header">
                <h1>Solicitar Acesso</h1>
                <p>Após o cadastro, aguarde a aprovação do administrador</p>
              </div>

              {regError && <div className="login-error">{regError}</div>}

              {regSuccess ? (
                <div className="login-success">
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--forecast-text)', marginBottom: 10 }}>Solicitação enviada</div>
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

                  <div className="form-group" style={{ marginBottom: 16 }}>
                    <label className="form-label">Meu perfil no sistema</label>
                    <div className="role-selector">
                      {ROLE_OPTIONS.map(opt => (
                        <div key={opt.value}
                          className={`role-option ${regRole === opt.value ? 'selected' : ''}`}
                          onClick={() => setRegRole(opt.value)}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 'var(--radius-sm)',
                            background: 'var(--ctg-navy)', color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.05em',
                            flexShrink: 0,
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

                  <button type="submit" className="btn btn-primary"
                    style={{ width: '100%', padding: '12px', fontSize: '0.95rem' }}
                    disabled={regLoading || !getPasswordStrength(regPassword).allPassed}>
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

        </div>

        {/* Developer credit — discrete but visible */}
        <div style={{
          position: 'absolute', bottom: 20, left: 0, right: 0,
          textAlign: 'center',
          fontSize: '0.7rem',
          color: 'var(--text-muted)',
          letterSpacing: '0.04em',
          opacity: 0.6,
          userSelect: 'none',
        }}>
          Desenvolvido por{' '}
          <span style={{ fontWeight: 600, color: 'var(--ctg-blue)', opacity: 1 }}>
            Júlio Casagrande
          </span>
        </div>
      </div>
    </div>
  );
}
