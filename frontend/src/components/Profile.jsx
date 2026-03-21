import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../utils/api.js';
import { useToast } from './ui/Toast.jsx';
import PasswordInput, { getPasswordStrength } from './ui/PasswordInput.jsx';

const ROLE_LABELS = { admin:'Administrador', gestor:'Gestor', engenheiro:'Engenheiro' };

export default function Profile() {
  const { user, updateUser } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);
  const [pwForm, setPwForm] = useState({ current_password:'', new_password:'', confirm:'' });
  const [changingPw, setChangingPw] = useState(false);

  const initials = name.split(' ').slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('');
  const roleColor = { admin:'#001F5B', gestor:'#0070B8', engenheiro:'#166534' }[user?.role] || '#888';

  const handleSaveProfile = async () => {
    if (!name.trim() || !email.trim()) return toast('Preencha nome e email', 'error');
    setSaving(true);
    try {
      const r = await api.put(`/users/${user.id}`, { name, email });
      updateUser(r.data);
      toast('Perfil atualizado', 'success');
    } catch (err) { toast(err.response?.data?.error || 'Erro ao salvar', 'error'); }
    finally { setSaving(false); }
  };

  const handleChangePassword = async () => {
    if (pwForm.new_password !== pwForm.confirm) return toast('As senhas não coincidem', 'error');
    if (pwForm.new_password.length < 6) return toast('Mínimo 6 caracteres', 'error');
    setChangingPw(true);
    try {
      await api.post('/auth/change-password', { current_password: pwForm.current_password, new_password: pwForm.new_password });
      setPwForm({ current_password:'', new_password:'', confirm:'' });
      toast('Senha alterada com sucesso', 'success');
    } catch (err) { toast(err.response?.data?.error || 'Erro ao alterar senha', 'error'); }
    finally { setChangingPw(false); }
  };

  return (
    <div style={{maxWidth:560}}>
      {/* Avatar + role banner */}
      <div style={{background:`linear-gradient(135deg, ${roleColor}, ${roleColor}CC)`,borderRadius:'var(--radius-lg)',padding:'24px 24px 20px',marginBottom:20,display:'flex',alignItems:'center',gap:16}}>
        <div style={{width:56,height:56,borderRadius:'50%',background:'rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.3rem',fontWeight:700,color:'#fff',flexShrink:0}}>
          {initials}
        </div>
        <div>
          <div style={{fontFamily:'var(--font-display)',fontSize:'1.3rem',color:'#fff',lineHeight:1.1}}>{user?.name}</div>
          <div style={{fontSize:'0.8rem',color:'rgba(255,255,255,0.7)',marginTop:3}}>
            {ROLE_LABELS[user?.role]} · {user?.email}
          </div>
        </div>
      </div>

      {/* Edit profile */}
      <div className="card" style={{marginBottom:16}}>
        <div className="card-header"><span className="card-title">Dados Pessoais</span></div>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">Nome completo</label>
            <input className="form-input" value={name} onChange={e=>setName(e.target.value)}/>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">E-mail</label>
            <input className="form-input" type="email" value={email} onChange={e=>setEmail(e.target.value)}/>
          </div>
        </div>
        <div style={{padding:'0 20px 16px',display:'flex',justifyContent:'flex-end'}}>
          <button className="btn btn-primary" onClick={handleSaveProfile} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>

      {/* Change password */}
      <div className="card">
        <div className="card-header"><span className="card-title">Alterar Senha</span></div>
        <div className="card-body">
          <div className="form-group">
            <label className="form-label">Senha atual</label>
            <input className="form-input" type="password" value={pwForm.current_password}
              onChange={e=>setPwForm(f=>({...f,current_password:e.target.value}))} placeholder="••••••••"/>
          </div>
          <div className="form-group">
            <label className="form-label">Senha atual</label>
            <input className="form-input" type="password" value={pwForm.current_password}
              onChange={e=>setPwForm(f=>({...f,current_password:e.target.value}))} placeholder="••••••••"/>
          </div>
          <PasswordInput
            label="Nova senha"
            value={pwForm.new_password}
            onChange={v=>setPwForm(f=>({...f,new_password:v}))}
            placeholder="Crie uma senha segura"
            confirm
            confirmValue={pwForm.confirm}
          />
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Confirmar nova senha</label>
            <input className="form-input" type="password" value={pwForm.confirm}
              onChange={e=>setPwForm(f=>({...f,confirm:e.target.value}))} placeholder="Repita a nova senha"/>
            {pwForm.confirm.length > 0 && pwForm.new_password !== pwForm.confirm && (
              <div style={{fontSize:'0.72rem',color:'#DC2626',marginTop:4,fontWeight:600}}>✕ Senhas não coincidem</div>
            )}
            {pwForm.confirm.length > 0 && pwForm.new_password === pwForm.confirm && pwForm.new_password.length > 0 && (
              <div style={{fontSize:'0.72rem',color:'#16A34A',marginTop:4,fontWeight:600}}>✓ Senhas coincidem</div>
            )}
          </div>
        </div>
        <div style={{padding:'0 20px 16px',display:'flex',justifyContent:'flex-end'}}>
          <button className="btn btn-primary" onClick={handleChangePassword}
            disabled={changingPw || !getPasswordStrength(pwForm.new_password).allPassed || pwForm.new_password !== pwForm.confirm}>
            {changingPw ? 'Alterando...' : 'Alterar Senha'}
          </button>
        </div>
      </div>
    </div>
  );
}
