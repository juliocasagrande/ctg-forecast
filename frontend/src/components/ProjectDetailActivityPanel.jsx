// ── Activity Panel ────────────────────────────────────────────────────────────
import { useState, useEffect } from 'react';
import api from '../utils/api.js';

const ROLE_LABELS = { admin:'Administrador', engenheiro:'Engenheiro', planejador:'Planejador', coordenador:'Coordenador', gerente:'Gerente' };

export default function ActivityPanel({ projectId }) {
  const [activity, setActivity] = useState(null);
  useEffect(()=>{
    api.get(`/forecast/project/${projectId}/activity`).then(r=>setActivity(r.data)).catch(()=>{});
  },[projectId]);
  if (!activity) return null;

  const roleMap = {};
  const update = (r, action) => {
    if (!roleMap[r.role] || new Date(r.last_at) > new Date(roleMap[r.role].last_at))
      roleMap[r.role] = { ...r, action };
  };
  activity.forecast.forEach(r => update(r, 'Dados atualizados'));
  activity.checkins.forEach(r => update(r, 'Check-in realizado'));
  activity.consolidated.forEach(r => update(r, 'Realizado consolidado'));

  const items = Object.values(roleMap);
  if (!items.length) return null;

  return (
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10,paddingTop:10,borderTop:'1px solid var(--border)'}}>
      {items.map(e => {
        const days = Math.floor((Date.now() - new Date(e.last_at)) / 86400000);
        const fresh = days <= 30;
        return (
          <div key={e.role} style={{display:'flex',flexDirection:'column',gap:2,padding:'7px 11px',borderRadius:'var(--radius-md)',background: fresh ? '#F0FDF4' : '#FEF2F2',border:`1px solid ${fresh ? '#BBF7D0' : '#FECACA'}`,minWidth:120}}>
            <div style={{display:'flex',alignItems:'center',gap:5}}>
              <span style={{width:7,height:7,borderRadius:'50%',background: fresh ? '#16A34A' : '#DC2626',flexShrink:0}}/>
              <span style={{fontSize:'0.65rem',fontWeight:700,color: fresh ? '#15803D' : '#991B1B',textTransform:'uppercase',letterSpacing:'0.06em'}}>{ROLE_LABELS[e.role]||e.role}</span>
            </div>
            <div style={{fontSize:'0.75rem',fontWeight:500,color:'var(--text-primary)'}}>{e.user_name}</div>
            <div style={{fontSize:'0.65rem',color:'var(--text-muted)'}}>{e.action}</div>
            <div style={{fontSize:'0.65rem',fontWeight:600,color: fresh ? '#15803D' : '#DC2626'}}>
              {days===0?'Hoje':days===1?'Ontem':`Há ${days} dias`}
            </div>
          </div>
        );
      })}
    </div>
  );
}
