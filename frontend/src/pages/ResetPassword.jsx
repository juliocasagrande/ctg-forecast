import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../utils/api.js';
import PasswordInput, { getPasswordStrength } from '../components/ui/PasswordInput.jsx';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Link inválido. Solicite uma nova redefinição de senha.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }

    const pwCheck = getPasswordStrength(password);
    if (!pwCheck.allPassed) {
      setError('Senha não atende aos requisitos mínimos');
      return;
    }

    setLoading(true);
    try {
      const r = await api.post('/auth/reset-password', {
        token,
        new_password: password,
      });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao redefinir senha. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (!token && !success) {
    return (
      <div className="login-page">
        <div className="login-left">
          <div className="login-brand">
            <div className="login-logo">CTG<span>.</span>Engenharia</div>
          </div>
        </div>
        <div className="login-right">
          <div className="login-form-wrap" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>⚠️</div>
            <h2>Link inválido</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
              Este link de redefinição é inválido ou expirou.
            </p>
            <button className="btn btn-primary" onClick={() => navigate('/login')}>
              Voltar ao login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-left">
        <div className="login-brand">
          <div className="login-logo">CTG<span>.</span>Engenharia</div>
          <p className="login-tagline">
            Plataforma integrada de soluções<br />e projetos de engenharia — CTG Brasil.
          </p>
        </div>
      </div>

      <div className="login-right">
        <div className="login-form-wrap">
          <div className="login-form-header">
            <h1>{success ? 'Senha redefinida!' : 'Redefinir Senha'}</h1>
            <p>
              {success
                ? 'Sua senha foi alterada com sucesso. Redirecionando para o login...'
                : 'Crie uma nova senha segura para sua conta.'}
            </p>
          </div>

          {error && <div className="login-error">{error}</div>}

          {success ? (
            <div className="login-success" style={{ textAlign: 'center', padding: '24px' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>✓</div>
              <p style={{ fontWeight: 600, marginBottom: 8 }}>Senha alterada com sucesso!</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Você será redirecionado para a página de login em instantes...
              </p>
              <button className="btn btn-primary" style={{ marginTop: 20, width: '100%' }}
                onClick={() => navigate('/login')}>
                Ir para o login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <PasswordInput
                label="Nova senha"
                value={password}
                onChange={setPassword}
                placeholder="Mínimo 8 caracteres"
                autoFocus
              />

              <div className="form-group">
                <label className="form-label">Confirmar nova senha</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="Repita a nova senha"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary"
                style={{ width: '100%', padding: '12px', fontSize: '0.95rem', marginTop: 8 }}
                disabled={loading || !getPasswordStrength(password).allPassed || password !== confirmPassword}>
                {loading ? 'Redefinindo...' : 'Redefinir senha'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
