// ── Export Modal — category + type selection ──────────────────────────────────
import { useState } from 'react';

const EXPORT_CATEGORIES = ['Viagens', 'Contratos', 'POs'];
const EXPORT_TYPES_BY_ROLE = {
  engenheiro:  ['Budget', 'Forecast', 'Actual', 'Meta', 'Pool'],
  coordenador: ['Budget', 'Forecast', 'Actual', 'Meta', 'Pool'],
  planejador:  ['Budget', 'Forecast', 'Actual', 'Meta', 'Pool'],
  admin:       ['Budget', 'Forecast', 'Actual', 'Meta', 'Pool'],
};
const TYPE_LABELS = { Budget:'Budget', Forecast:'Forecast', Actual:'Realizado', Meta:'Meta', Pool:'Pool' };

export default function ExportModal({ open, onClose, onConfirm, role, isEngenheiro }) {
  const availableTypes = EXPORT_TYPES_BY_ROLE[role] || EXPORT_TYPES_BY_ROLE.admin;
  const [exportScope, setExportScope] = useState('projeto'); // 'projeto' | 'geral'
  const [selCats,  setSelCats]  = useState([...EXPORT_CATEGORIES]);
  const [selTypes, setSelTypes] = useState([...availableTypes]);

  const toggle = (arr, setArr, val) =>
    setArr(prev => prev.includes(val) ? prev.filter(x => x !== val) : [...prev, val]);

  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">📊 Exportar Excel</span>
          <button className="btn btn-ghost btn-icon" onClick={onClose} style={{ color:'rgba(255,255,255,0.7)' }}>✕</button>
        </div>
        <div className="modal-body">
          {/* Export scope selector */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:'0.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)', marginBottom:8 }}>
              Tipo de exportação
            </div>
            <div style={{ display:'flex', gap:8 }}>
              {[
                { id:'projeto', label:'📄 Este projeto', desc:'Dados deste projeto apenas' },
                { id:'geral',   label:'📊 Relatório Geral', desc: isEngenheiro ? 'Meus projetos (Jan/2026 – Dez/2031)' : 'Todos os projetos (Jan/2026 – Dez/2031)' },
              ].map(opt => (
                <label key={opt.id} style={{
                  flex:1, padding:'10px 12px', borderRadius:'var(--radius-md)', cursor:'pointer',
                  background: exportScope===opt.id ? 'var(--ctg-light)' : 'var(--bg-app)',
                  border: `1.5px solid ${exportScope===opt.id ? 'var(--ctg-blue)' : 'var(--border-strong)'}`,
                  userSelect:'none', transition:'all 0.15s',
                }}>
                  <input type="radio" name="scope" value={opt.id} checked={exportScope===opt.id}
                    onChange={() => setExportScope(opt.id)} style={{ marginRight:6, accentColor:'var(--ctg-blue)' }} />
                  <span style={{ fontSize:'0.83rem', fontWeight:600, color: exportScope===opt.id ? 'var(--ctg-navy)' : 'var(--text-secondary)' }}>{opt.label}</span>
                  <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:2, marginLeft:20 }}>{opt.desc}</div>
                </label>
              ))}
            </div>
          </div>
          <p style={{ fontSize:'0.82rem', color:'var(--text-secondary)', marginBottom:16 }}>
            {exportScope==='projeto'
              ? 'Selecione as categorias e tipos de dados deste projeto.'
              : 'Selecione os tipos de dados para o relatório geral.'}
          </p>

          {/* Categories — only for project export */}
          {exportScope === 'projeto' && <div style={{ marginBottom:18 }}>
            <div style={{ fontSize:'0.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)', marginBottom:8 }}>
              Categorias
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {EXPORT_CATEGORIES.map(cat => (
                <label key={cat} style={{
                  display:'flex', alignItems:'center', gap:7, padding:'7px 14px',
                  borderRadius:'var(--radius-md)', cursor:'pointer',
                  background: selCats.includes(cat) ? 'var(--ctg-light)' : 'var(--bg-app)',
                  border: `1.5px solid ${selCats.includes(cat) ? 'var(--ctg-blue)' : 'var(--border-strong)'}`,
                  fontSize:'0.83rem', fontWeight: selCats.includes(cat) ? 600 : 400,
                  color: selCats.includes(cat) ? 'var(--ctg-navy)' : 'var(--text-secondary)',
                  transition:'all 0.15s', userSelect:'none',
                }}>
                  <input type="checkbox" checked={selCats.includes(cat)}
                    onChange={() => toggle(EXPORT_CATEGORIES, setSelCats, cat)}
                    style={{ accentColor:'var(--ctg-blue)', width:14, height:14 }} />
                  {cat}
                </label>
              ))}
            </div>
          </div>}

          {/* Types */}
          <div>
            <div style={{ fontSize:'0.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text-muted)', marginBottom:8 }}>
              Tipos de dados
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {availableTypes.map(type => {
                const theme = {
                  Budget:   { bg:'var(--budget-bg)',   border:'var(--budget-border)',   text:'var(--budget-text)'   },
                  Forecast: { bg:'var(--forecast-bg)', border:'var(--forecast-border)', text:'var(--forecast-text)' },
                  Actual:   { bg:'var(--actual-bg)',   border:'var(--actual-border)',   text:'var(--actual-text)'   },
                  Meta:     { bg:'#F5F3FF', border:'#DDD6FE', text:'#6D28D9' },
                  Pool:     { bg:'#F0F9FF', border:'#BAE6FD', text:'#0369A1' },
                }[type] || {};
                const sel = selTypes.includes(type);
                return (
                  <label key={type} style={{
                    display:'flex', alignItems:'center', gap:7, padding:'7px 14px',
                    borderRadius:'var(--radius-md)', cursor:'pointer',
                    background: sel ? theme.bg : 'var(--bg-app)',
                    border: `1.5px solid ${sel ? theme.border : 'var(--border-strong)'}`,
                    fontSize:'0.83rem', fontWeight: sel ? 600 : 400,
                    color: sel ? theme.text : 'var(--text-secondary)',
                    transition:'all 0.15s', userSelect:'none',
                  }}>
                    <input type="checkbox" checked={sel}
                      onChange={() => toggle(availableTypes, setSelTypes, type)}
                      style={{ accentColor: theme.text || 'var(--ctg-blue)', width:14, height:14 }} />
                    {TYPE_LABELS[type] || type}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-export"
            disabled={selTypes.length === 0 || (exportScope==='projeto' && selCats.length === 0)}
            onClick={() => { onConfirm(selCats, selTypes, exportScope); onClose(); }}>
            📊 Exportar
          </button>
        </div>
      </div>
    </div>
  );
}
