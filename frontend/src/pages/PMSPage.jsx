import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../utils/api.js';
import { useToast } from '../components/ui/Toast.jsx';
import ColumnFilterDropdown from '../components/ui/ColumnFilterDropdown.jsx';
import ColumnResizeHandle from '../components/ui/ColumnResizeHandle.jsx';
import useColumnWidths from '../hooks/useColumnWidths.js';

/* ─── Constants ──────────────────────────────────────────────────────────────── */
const PMS_COL_WIDTHS = [40, 150, 80, 180, 160, 140, 320, 130, 110]; // 🔗 Código Usina Área Responsável Validade Título Status Ações
const TYPES = [
  { value: 'POL', label: 'Políticas PMS' },
  { value: 'IM',  label: 'Instruções de Manutenção' },
  { value: 'GM',  label: 'Guias de Manutenção' },
  { value: 'MM',  label: 'Manuais de Manutenção' },
];
const TYPE_META = Object.fromEntries(TYPES.map(t => [t.value, t]));
const TYPE_COLORS = { POL: '#0066B3', IM: '#0891B2', GM: '#10B981', MM: '#8B5CF6' };

const PLANTS = ['PLM','RET','CN1','CN2','CPV','CHV','GAR','ILS','JUP','JUR','ROS','STO','SAG','TAQ','UHE'];

const STATUSES = [
  { value: 'Em elaboração',  color: '#F59E0B', bg: '#FEF3C7', text: '#92400E' },
  { value: 'Para aprovação', color: '#3B82F6', bg: '#EFF6FF', text: '#1D4ED8' },
  { value: 'Publicado',      color: '#10B981', bg: '#D1FAE5', text: '#065F46' },
  { value: 'Cancelado',      color: '#EF4444', bg: '#FEE2E2', text: '#991B1B' },
];
const STATUS_META = Object.fromEntries(STATUSES.map(s => [s.value, s]));

const VALIDADE = [
  { value: 'Em dia',  color: '#10B981', bg: '#D1FAE5', text: '#065F46' },
  { value: 'Alerta',  color: '#F59E0B', bg: '#FEF3C7', text: '#92400E' },
  { value: 'Vencido', color: '#EF4444', bg: '#FEE2E2', text: '#991B1B' },
];
const VALIDADE_META = Object.fromEntries(VALIDADE.map(v => [v.value, v]));

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
function fmtDateBR(val) {
  if (!val) return '—';
  const match = String(val).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '—';
  const [, y, m, d] = match;
  return `${d}/${m}/${y}`;
}
function externalLink(path) {
  const value = String(path || '').trim();
  if (!value) return '';
  if (/^[A-Za-z]:[\\/]/.test(value)) return `file:///${value.replace(/\\/g, '/')}`;
  if (value.startsWith('\\')) return `file:${value.replace(/\\/g, '/')}`;
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return value;
  if (/^(?:www\.)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:[/?#]|$)/i.test(value)) return `https://${value}`;
  return value;
}

/* ─── Badges ─────────────────────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const m = STATUS_META[status] || { color: '#6B7280', bg: '#F3F4F6', text: '#374151' };
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      padding:'2px 8px', borderRadius:20, fontSize:'0.72rem', fontWeight:700,
      background:m.bg, color:m.text, border:`1px solid ${m.color}33`, whiteSpace:'nowrap',
    }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:m.color, flexShrink:0 }} />
      {status}
    </span>
  );
}
function LangBadges({ hasPt, hasEn }) {
  return (
    <span style={{ display:'inline-flex', gap:3, flexShrink:0 }}>
      <span title={hasPt ? 'Possui versão em Português' : 'Sem versão em Português'} style={{
        fontSize:'0.6rem', fontWeight:700, padding:'1px 4px', borderRadius:4,
        background: hasPt ? '#D1FAE5' : '#F1F5F9', color: hasPt ? '#065F46' : '#94A3B8',
        border: `1px solid ${hasPt ? '#6EE7B7' : '#E2E8F0'}`,
      }}>PT</span>
      <span title={hasEn ? 'Possui versão em Inglês' : 'Sem versão em Inglês'} style={{
        fontSize:'0.6rem', fontWeight:700, padding:'1px 4px', borderRadius:4,
        background: hasEn ? '#D1FAE5' : '#F1F5F9', color: hasEn ? '#065F46' : '#94A3B8',
        border: `1px solid ${hasEn ? '#6EE7B7' : '#E2E8F0'}`,
      }}>EN</span>
    </span>
  );
}
function ValidadeBadge({ status, days }) {
  const m = VALIDADE_META[status] || { color: '#6B7280', bg: '#F3F4F6', text: '#374151' };
  const sub = status === 'Vencido' ? `há ${Math.abs(days)}d` : status === 'Alerta' ? `${days}d` : null;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', gap:4,
      padding:'2px 8px', borderRadius:20, fontSize:'0.72rem', fontWeight:700,
      background:m.bg, color:m.text, border:`1px solid ${m.color}33`, whiteSpace:'nowrap',
    }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:m.color, flexShrink:0 }} />
      {status}{sub ? ` · ${sub}` : ''}
    </span>
  );
}

/* ─── StatCard ───────────────────────────────────────────────────────────────── */
function StatCard({ label, value, sub, color = '#0066B3' }) {
  return (
    <div style={{
      background:'#fff', border:'1px solid #E2E8F0', borderRadius:10,
      padding:'14px 18px', display:'flex', flexDirection:'column', gap:4,
      borderTop:`3px solid ${color}`, flex:'1 1 0', minWidth:100,
    }}>
      <div style={{ fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#94A3B8' }}>{label}</div>
      <div style={{ fontFamily:'var(--font-display)', fontSize:'1.6rem', fontWeight:700, color, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:'0.72rem', color:'#64748B' }}>{sub}</div>}
    </div>
  );
}

/* ─── Charts ─────────────────────────────────────────────────────────────────── */
function ChartTooltip({ pos, color, label, value, breakdowns }) {
  return createPortal(
    <div style={{ position:'fixed', left:pos.x, top:pos.y+14, transform:'translateX(-50%)', pointerEvents:'none', zIndex:99999 }}>
      <div style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:8, padding:'8px 12px', boxShadow:'0 4px 16px rgba(0,0,0,0.15)', fontSize:'0.72rem', whiteSpace:'nowrap', minWidth:200 }}>
        <div style={{ fontWeight:800, marginBottom:5, color: color || '#1E293B', fontSize:'0.78rem' }}>{label}</div>
        <div style={{ display:'flex', justifyContent:'space-between', gap:18, lineHeight:1.55 }}>
          <span style={{ color:'#64748B' }}>Total</span>
          <span style={{ color:'#1E293B', fontWeight:700 }}>{value}</span>
        </div>
        {breakdowns.map(group => {
          const rows = group.items.filter(it => it.value > 0);
          return (
            <div key={group.title} style={{ borderTop:'1px solid #F1F5F9', marginTop:5, paddingTop:4 }}>
              <div style={{ fontSize:'0.62rem', fontWeight:800, color:'#64748B', textTransform:'uppercase', marginBottom:3 }}>Por {group.title}</div>
              {rows.length === 0
                ? <div style={{ color:'#94A3B8' }}>Sem dados</div>
                : rows.map(it => (
                    <div key={it.label} style={{ display:'flex', justifyContent:'space-between', gap:18, lineHeight:1.55 }}>
                      <span style={{ color:'#64748B' }}>{it.label}</span>
                      <span style={{ color: it.color || '#1E293B', fontWeight:700 }}>{it.value}</span>
                    </div>
                  ))}
            </div>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
function HBarChart({ data, title, activeFilter, onFilter }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const visible = data.filter(d => d.value > 0);
  const clickable = !!onFilter;
  const [hovered, setHovered] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x:0, y:0 });
  return (
    <div style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:10, borderTop:'3px solid #0066B3', padding:'14px 16px', flex:1, minWidth:0 }}>
      <div style={{ fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#94A3B8', marginBottom:10 }}>{title}</div>
      {visible.length === 0 ? <div style={{ fontSize:'0.78rem', color:'#CBD5E1', textAlign:'center', padding:'16px 0' }}>Sem dados</div>
        : <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            {visible.map((d,i) => {
              const isActive = activeFilter === d.filterKey;
              return (
                <div key={i}
                  onClick={() => clickable && onFilter(isActive ? '' : d.filterKey)}
                  onMouseEnter={e => { setHovered(d); setTooltipPos({ x:e.clientX, y:e.clientY }); }}
                  onMouseMove={e => setTooltipPos({ x:e.clientX, y:e.clientY })}
                  onMouseLeave={() => setHovered(null)}
                  style={{ display:'flex', alignItems:'center', gap:8, cursor: clickable ? 'pointer' : 'default',
                    opacity: activeFilter && !isActive ? 0.45 : 1, transition:'opacity 0.15s',
                    borderRadius:4, padding:'2px 0',
                  }}
                >
                  <div style={{ fontSize:'0.68rem', color: isActive ? '#001F5B' : '#475569', width:34, textAlign:'right', flexShrink:0, fontWeight: isActive ? 700 : 600 }}>{d.label}</div>
                  <div style={{ flex:1, background:'#F1F5F9', borderRadius:4, height:14, overflow:'hidden' }}>
                    <div style={{ width:`${(d.value/max)*100}%`, height:'100%', background:d.color||'#0066B3', borderRadius:4 }} />
                  </div>
                  <div style={{ fontSize:'0.68rem', fontWeight:700, color:'#1E293B', width:24, flexShrink:0 }}>{d.value}</div>
                </div>
              );
            })}
          </div>}
      {hovered && hovered.tooltipBreakdowns && (
        <ChartTooltip pos={tooltipPos} color={hovered.color} label={hovered.label} value={hovered.value} breakdowns={hovered.tooltipBreakdowns} />
      )}
    </div>
  );
}
/* ─── MiniDonut / StatsOverviewCard — donut com % real + legenda clicável ───── */
const CTG_BLUE = '#0066B3';
function MiniDonut({ data, highlightKey, highlightLabel, activeFilter, onFilter }) {
  const total = data.reduce((s,d) => s+d.value, 0);
  const highlight = data.find(d => d.filterKey === highlightKey);
  const pct = total ? (highlight?.value || 0) / total * 100 : 0;
  const pctLabel = pct.toLocaleString('pt-BR', { minimumFractionDigits:1, maximumFractionDigits:1 });
  const size = 150, r = 58, cx = size/2, cy = size/2, strokeW = 18, circ = 2*Math.PI*r;
  const dash = (pct/100) * circ;
  const isActive = activeFilter === highlightKey;
  const clickable = !!onFilter;
  const [hovered, setHovered] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x:0, y:0 });
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10, flex:1, minWidth:0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {dash > 0 && (
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={CTG_BLUE} strokeWidth={strokeW}
            strokeDasharray={`${dash} ${circ-dash}`} strokeDashoffset={circ/4}
            opacity={activeFilter && !isActive ? 0.35 : 1}
            style={{ cursor: clickable ? 'pointer' : 'default', transition:'opacity 0.15s' }}
            onClick={() => clickable && onFilter(isActive ? '' : highlightKey)}
            onMouseEnter={e => { setHovered(highlight); setTooltipPos({ x:e.clientX, y:e.clientY }); }}
            onMouseMove={e => setTooltipPos({ x:e.clientX, y:e.clientY })}
            onMouseLeave={() => setHovered(null)}
          />
        )}
        <text x={cx} y={cy-6} textAnchor="middle" style={{ fontSize:'1.3rem', fontWeight:800, fill:'#0F172A' }}>{pctLabel}%</text>
        <text x={cx} y={cy+15} textAnchor="middle" style={{ fontSize:'0.6rem', fontWeight:700, letterSpacing:'0.04em', fill:'#94A3B8' }}>{highlightLabel.toUpperCase()}</text>
      </svg>
      <div style={{ display:'flex', flexDirection:'column', gap:6, width:'100%' }}>
        {data.filter(d=>d.value>0).map((d,i) => {
          const isItemActive = activeFilter === d.filterKey;
          return (
            <div key={i}
              onClick={() => clickable && onFilter(isItemActive ? '' : d.filterKey)}
              onMouseEnter={e => { setHovered(d); setTooltipPos({ x:e.clientX, y:e.clientY }); }}
              onMouseMove={e => setTooltipPos({ x:e.clientX, y:e.clientY })}
              onMouseLeave={() => setHovered(null)}
              style={{ display:'flex', alignItems:'center', gap:6, cursor: clickable ? 'pointer' : 'default', opacity: activeFilter && !isItemActive ? 0.5 : 1, transition:'opacity 0.15s' }}
            >
              <span style={{ width:8, height:8, borderRadius:'50%', background:d.color, flexShrink:0 }}/>
              <span style={{ fontSize:'0.74rem', color:'#475569', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.label}</span>
              <span style={{ fontSize:'0.74rem', fontWeight:700, color:'#1E293B', flexShrink:0 }}>{d.value.toLocaleString('pt-BR')}</span>
            </div>
          );
        })}
      </div>
      {hovered && hovered.tooltipBreakdowns && (
        <ChartTooltip pos={tooltipPos} color={hovered.color} label={hovered.label} value={hovered.value} breakdowns={hovered.tooltipBreakdowns} />
      )}
    </div>
  );
}
function StatsOverviewCard({ blocks }) {
  return (
    <div style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:10, borderTop:'3px solid #0066B3', padding:'16px 20px', width:'100%', height:'100%', boxSizing:'border-box', display:'flex', flexDirection:'column', justifyContent:'center' }}>
      <div style={{ display:'flex', gap:18, alignItems:'center' }}>
        {blocks.map((b,i) => (
          <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:8, minWidth:0 }}>
            <div style={{ fontSize:'0.62rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#94A3B8' }}>{b.title}</div>
            <MiniDonut {...b}/>
          </div>
        ))}
      </div>
    </div>
  );
}

const PLANT_BLUES = ['#001F5B','#003A8C','#0050B3','#0066B3','#0070CC','#0082E6','#0091EA','#00AEEF','#29BAF0','#64CCF4','#97DDF7','#BFECFA','#D6F4FF','#E8F8FF'];
function VBarChart({ data, title, activeFilter, onFilter }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const visible = data.filter(d => d.value > 0);
  const clickable = !!onFilter;
  const [hovered, setHovered] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x:0, y:0 });
  return (
    <div style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:10, borderTop:'3px solid #0066B3', padding:'14px 16px', flex:1, minWidth:0, width:'100%' }}>
      <div style={{ fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#94A3B8', marginBottom:10 }}>{title}</div>
      {visible.length === 0
        ? <div style={{ fontSize:'0.78rem', color:'#CBD5E1', textAlign:'center', padding:'16px 0' }}>Sem dados</div>
        : <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:120, overflow:'hidden' }}>
            {visible.map((d,i) => {
              const isActive = activeFilter === d.filterKey;
              return (
                <div key={i}
                  onClick={() => clickable && onFilter(isActive ? '' : d.filterKey)}
                  onMouseEnter={e => { setHovered(d); setTooltipPos({ x:e.clientX, y:e.clientY }); }}
                  onMouseMove={e => setTooltipPos({ x:e.clientX, y:e.clientY })}
                  onMouseLeave={() => setHovered(null)}
                  style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:0, minWidth:0,
                    cursor: clickable ? 'pointer' : 'default',
                    opacity: activeFilter && !isActive ? 0.4 : 1,
                    transition:'opacity 0.15s',
                  }}
                >
                  <div style={{ fontSize:'0.75rem', fontWeight:700, color: isActive ? '#001F5B' : '#1E293B', marginBottom:3 }}>{d.value}</div>
                  <div style={{
                    width:'100%',
                    height:`${Math.max((d.value/max)*80,6)}px`,
                    background: isActive ? (d.color||PLANT_BLUES[i % PLANT_BLUES.length]) : PLANT_BLUES[i % PLANT_BLUES.length],
                    borderRadius:'4px 4px 0 0',
                    transition:'height 0.4s ease',
                    minHeight:6,
                    opacity: activeFilter && !isActive ? 0.5 : 1,
                  }}/>
                  <div style={{
                    fontSize:'0.72rem', fontWeight: isActive ? 700 : 600, color: isActive ? '#001F5B' : '#334155', textAlign:'center',
                    width:'100%', marginTop:5, lineHeight:1, letterSpacing:'0.02em',
                  }}>{d.label}</div>
                </div>
              );
            })}
          </div>
      }
      {hovered && hovered.tooltipBreakdowns && (
        <ChartTooltip pos={tooltipPos} color={hovered.color} label={hovered.label} value={hovered.value} breakdowns={hovered.tooltipBreakdowns} />
      )}
    </div>
  );
}

/* ─── Field ──────────────────────────────────────────────────────────────────── */
const fS = { padding:'7px 10px', border:'1.5px solid #E2E8F0', borderRadius:6, fontSize:'0.85rem', fontFamily:'var(--font-body)', color:'#1E293B', background:'#fff', outline:'none', width:'100%', boxSizing:'border-box' };
const fLocked = { ...fS, background:'#F8FAFC', color:'#94A3B8', cursor:'not-allowed' };
function Field({ label, required, children }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <label style={{ fontSize:'0.72rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'#64748B' }}>
        {label}{required && <span style={{ color:'#EF4444', marginLeft:2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

/* ─── StatusModal ────────────────────────────────────────────────────────────── */
function StatusModal({ open, onClose, onSaved, doc }) {
  const { toast } = useToast();
  const [status, setStatus] = useState(doc?.status || '');
  const [link, setLink]     = useState(doc?.document_link || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open && doc) { setStatus(doc.status); setLink(doc.document_link || ''); } }, [open, doc]);
  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/pms/${doc.id}/status`, { status, ...(status === 'Publicado' ? { document_link: link } : {}) });
      toast('Status atualizado com sucesso!', 'success');
      onSaved();
      setTimeout(() => onClose(), 500);
    } catch (err) { toast(err.response?.data?.error || 'Erro ao atualizar status.', 'error'); }
    finally { setSaving(false); }
  };
  const hasChanges = status !== doc?.status || (status === 'Publicado' && link !== (doc?.document_link || ''));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth:440, width:'92vw' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">🔖 Alterar Status</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.7)', fontSize:'1.1rem' }}>✕</button>
        </div>
        <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ fontSize:'0.78rem', color:'#64748B', background:'#F8FAFC', padding:'8px 12px', borderRadius:8 }}>
            Documento: <strong style={{ fontFamily:'monospace', color:'#001F5B' }}>{doc?.code}</strong>
          </div>
          <Field label="Novo Status" required>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {STATUSES.map(s => (
                <label key={s.value} style={{
                  display:'flex', alignItems:'center', gap:10, padding:'10px 14px',
                  border:`2px solid ${status===s.value ? s.color : '#E2E8F0'}`,
                  borderRadius:10, cursor:'pointer',
                  background: status===s.value ? s.bg : '#fff',
                }}>
                  <input type="radio" name="pms_status" value={s.value} checked={status===s.value}
                    onChange={() => setStatus(s.value)} style={{ display:'none' }}/>
                  <span style={{ width:10, height:10, borderRadius:'50%', background:s.color, flexShrink:0 }}/>
                  <span style={{ fontSize:'0.85rem', fontWeight: status===s.value ? 700 : 400, color: status===s.value ? s.text : '#475569' }}>{s.value}</span>
                </label>
              ))}
            </div>
          </Field>
          {status === 'Publicado' && (
            <Field label="Link do Documento">
              <input type="text" value={link} onChange={e => setLink(e.target.value)}
                placeholder="https://... ou caminho de rede"
                style={{ ...fS, border:'1.5px solid #10B981', background:'#F0FDF4' }}/>
            </Field>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? 'Salvando...' : '💾 Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── RevisionModal ──────────────────────────────────────────────────────────── */
function RevisionModal({ open, onClose, onSaved, doc, allUsers }) {
  const { toast } = useToast();
  const [date, setDate] = useState(new Date().toISOString().slice(0,10));
  const [responsible, setResponsible] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open && doc) { setDate(new Date().toISOString().slice(0,10)); setResponsible(doc.responsible || ''); } }, [open, doc]);
  if (!open || !doc) return null;

  const currentRev = doc.revision ?? -1;
  const nextRev = currentRev + 1;

  const handleSave = async () => {
    if (!date) { toast('Data é obrigatória.', 'error'); return; }
    setSaving(true);
    try {
      await api.post(`/pms/${doc.id}/revision`, { date, responsible });
      toast(`Revisão R${nextRev} criada com sucesso! A validade foi reiniciada por 3 anos.`, 'success');
      onSaved();
      setTimeout(() => onClose(), 500);
    } catch (err) { toast(err.response?.data?.error || 'Erro ao criar revisão.', 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth:500, width:'92vw' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">🔄 Nova Revisão</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.7)', fontSize:'1.1rem' }}>✕</button>
        </div>
        <div className="modal-body" style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:8, padding:'10px 14px', fontSize:'0.8rem', color:'#1D4ED8' }}>
            ℹ️ Criando <strong>Revisão R{nextRev}</strong> de <strong style={{ fontFamily:'monospace' }}>{doc.base_code || doc.code}</strong>. A validade de 3 anos é reiniciada a partir da nova data.
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <Field label="Código base"><input value={doc.base_code || doc.code} readOnly style={fLocked}/></Field>
            <Field label="Revisão"><input value={`R${nextRev}`} readOnly style={{ ...fLocked, background:'#EFF6FF', color:'#1D4ED8', fontWeight:700 }}/></Field>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="Data da Revisão" required>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={fS}/>
            </Field>
            <Field label="Responsável">
              <select value={responsible} onChange={e => setResponsible(e.target.value)} style={fS}>
                <option value="">— Manter atual —</option>
                {allUsers.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
              </select>
            </Field>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Criando...' : `🔄 Criar Revisão R${nextRev}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── PMSDocModal — criar / editar ──────────────────────────────────────────── */
function PMSDocModal({ open, onClose, onSaved, doc, allUsers }) {
  const { toast } = useToast();
  const isEdit = !!doc;

  const initForm = () => ({
    type:             doc?.type || 'POL',
    code:             doc?.code || '',
    category:         doc?.category || '',
    plant:            doc?.plant || '',
    equipment_number: doc?.equipment_number || '',
    sub_item:         doc?.sub_item || '',
    area:             doc?.area || '',
    title_pt:         doc?.title_pt || '',
    title_en:         doc?.title_en || '',
    has_pt:           doc?.has_pt !== false,
    has_en:           doc?.has_en || false,
    responsible:      doc?.responsible || '',
    date:             doc?.date ? doc.date.slice(0,10) : new Date().toISOString().slice(0,10),
    status:           doc?.status || 'Em elaboração',
    document_link:    doc?.document_link || '',
    notes:             doc?.notes || '',
  });

  const [form, setForm] = useState(initForm);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setForm(initForm()); }, [open, doc]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const needsPlant = form.type === 'GM' || form.type === 'MM';
  const needsEquip = form.type === 'MM';

  const handleSubmit = async () => {
    const missing = [];
    if (!form.code)        missing.push('Código');
    if (!form.area)        missing.push('Área');
    if (!form.title_pt)    missing.push('Título (PT)');
    if (!form.responsible) missing.push('Responsável');
    if (!form.date)        missing.push('Data');
    if (missing.length) { toast(`Campo obrigatório não preenchido: ${missing.join(', ')}`, 'error', 4500); return; }

    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/pms/${doc.id}`, form);
        toast('Documento atualizado com sucesso!', 'success');
      } else {
        await api.post('/pms', form);
        toast('Documento registrado com sucesso!', 'success');
      }
      onSaved();
      setTimeout(() => onClose(), 600);
    } catch (err) { toast(err.response?.data?.error || 'Erro ao salvar.', 'error'); }
    finally { setSaving(false); }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth:720, width:'95vw', maxHeight:'93vh', display:'flex', flexDirection:'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ flexShrink:0 }}>
          <span className="modal-title">{isEdit ? '✏️ Editar Documento PMS' : '📄 Novo Documento PMS'}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.7)', fontSize:'1.1rem' }}>✕</button>
        </div>
        <div className="modal-body" style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:12 }}>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="Tipo" required>
              <select value={form.type} onChange={e => set('type', e.target.value)} style={isEdit ? fLocked : fS} disabled={isEdit}>
                {TYPES.map(o => <option key={o.value} value={o.value}>{o.value} — {o.label}</option>)}
              </select>
            </Field>
            <Field label="Código" required>
              <input value={form.code} onChange={e => set('code', e.target.value)}
                placeholder="ex: GM-CHV-01, MM-JUR-001.02, POL-PMS-006"
                style={isEdit ? fLocked : fS} readOnly={isEdit}/>
            </Field>
          </div>

          <div style={{ display:'grid', gridTemplateColumns: needsPlant ? (needsEquip ? '1fr 1fr 1fr' : '1fr 1fr') : '1fr', gap:12 }}>
            {needsPlant && (
              <Field label="Usina">
                <select value={form.plant} onChange={e => set('plant', e.target.value)} style={fS}>
                  <option value="">— Selecionar —</option>
                  {PLANTS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
            )}
            {needsEquip && (
              <Field label="Nº Equipamento">
                <input value={form.equipment_number} onChange={e => set('equipment_number', e.target.value)} style={fS}/>
              </Field>
            )}
            {needsPlant && (
              <Field label="Subitem">
                <input value={form.sub_item} onChange={e => set('sub_item', e.target.value)} style={fS}/>
              </Field>
            )}
          </div>

          {form.type === 'IM' && (
            <Field label="Categoria">
              <input value={form.category} onChange={e => set('category', e.target.value)}
                placeholder="ex: Instruções Manutenção Elétrica" style={fS}/>
            </Field>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="Área" required>
              <input value={form.area} onChange={e => set('area', e.target.value)}
                placeholder="ex: Engenharia Elétrica" style={fS}/>
            </Field>
            <Field label="Responsável" required>
              <select value={form.responsible} onChange={e => set('responsible', e.target.value)} style={fS}>
                <option value="">— Selecionar —</option>
                {allUsers.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Título (Português)" required>
            <textarea value={form.title_pt} onChange={e => set('title_pt', e.target.value)} rows={2} style={{ ...fS, resize:'vertical' }}/>
          </Field>
          <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:'0.8rem', color:'#475569', cursor:'pointer', marginTop:-6 }}>
            <input type="checkbox" checked={form.has_pt} onChange={e => set('has_pt', e.target.checked)} style={{ width:15, height:15, accentColor:'#0066B3' }}/>
            Documento possui versão em Português
          </label>

          <Field label="Título (Inglês)">
            <textarea value={form.title_en} onChange={e => set('title_en', e.target.value)} rows={2} style={{ ...fS, resize:'vertical' }}/>
          </Field>
          <label style={{ display:'flex', alignItems:'center', gap:7, fontSize:'0.8rem', color:'#475569', cursor:'pointer', marginTop:-6 }}>
            <input type="checkbox" checked={form.has_en} onChange={e => set('has_en', e.target.checked)} style={{ width:15, height:15, accentColor:'#0066B3' }}/>
            Documento possui versão em Inglês
          </label>

          <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:12 }}>
            <Field label="Data de Aprovação/Revisão" required>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={fS}/>
            </Field>
          </div>

          <Field label="Status" required>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {STATUSES.map(s => (
                <label key={s.value} style={{
                  display:'flex', alignItems:'center', gap:6, padding:'6px 14px',
                  border:`1.5px solid ${form.status===s.value ? s.color : '#E2E8F0'}`,
                  borderRadius:20, cursor:'pointer', fontSize:'0.82rem',
                  background: form.status===s.value ? s.bg : '#fff',
                  color: form.status===s.value ? s.text : '#64748B',
                  fontWeight: form.status===s.value ? 700 : 400,
                }}>
                  <input type="radio" name="pms_doc_status" value={s.value} checked={form.status===s.value}
                    onChange={() => set('status', s.value)} style={{ display:'none' }}/>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:s.color, flexShrink:0 }}/>
                  {s.value}
                </label>
              ))}
            </div>
          </Field>

          {form.status === 'Publicado' && (
            <Field label="Link do Documento">
              <input type="text" value={form.document_link} onChange={e => set('document_link', e.target.value)}
                placeholder="https://... ou \\servidor\pasta"
                style={{ ...fS, border:'1.5px solid #10B981', background:'#F0FDF4' }}/>
            </Field>
          )}

          <Field label="Observações">
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} style={{ ...fS, resize:'vertical' }}/>
          </Field>

        </div>
        <div className="modal-footer" style={{ flexShrink:0 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Salvando...' : isEdit ? '💾 Salvar Alterações' : '📄 Registrar Documento'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── ImportExcelModal ───────────────────────────────────────────────────────── */
function ImportExcelModal({ open, onClose, onImported }) {
  const { toast } = useToast();
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => { if (!open) { setFile(null); setPreview(null); setResult(null); } }, [open]);
  if (!open) return null;

  const handleFile = async (f) => {
    if (!f) return;
    setFile(f); setParsing(true); setPreview(null); setResult(null);
    try {
      const fd = new FormData(); fd.append('file', f);
      const res = await api.post('/pms/import/preview', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPreview(res.data);
    } catch (err) { toast(err.response?.data?.error || 'Erro ao ler planilha.', 'error'); }
    finally { setParsing(false); }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await api.post('/pms/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(res.data);
      toast(`Importação concluída: ${res.data.created} criados, ${res.data.updated} atualizados.`, 'success');
      onImported();
    } catch (err) { toast(err.response?.data?.error || 'Erro ao importar.', 'error'); }
    finally { setImporting(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth:780, width:'95vw', maxHeight:'90vh', display:'flex', flexDirection:'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ flexShrink:0 }}>
          <span className="modal-title">📥 Importar Planilha PMS</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.7)', fontSize:'1.1rem' }}>✕</button>
        </div>
        <div className="modal-body" style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:8, padding:'10px 14px', fontSize:'0.8rem', color:'#1D4ED8', lineHeight:1.6 }}>
            ℹ️ Use o mesmo arquivo de referência da engenharia: um workbook com as abas <strong>POL</strong>, <strong>IM</strong>, <strong>GM</strong> e <strong>MM</strong> (mesmo layout exportado por esta página em "Exportar"). Documentos com código já existente são atualizados (o responsável já atribuído na UI nunca é sobrescrito); os demais são criados.
          </div>

          {!file && (
            <div
              onClick={() => inputRef.current?.click()}
              style={{ border:'2px dashed #CBD5E1', borderRadius:10, padding:'32px 20px', textAlign:'center', cursor:'pointer', color:'#94A3B8' }}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#0066B3'; }}
              onDragLeave={e => { e.currentTarget.style.borderColor = '#CBD5E1'; }}
              onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#CBD5E1'; handleFile(e.dataTransfer.files[0]); }}
            >
              <div style={{ fontSize:'2rem', marginBottom:8 }}>📄</div>
              <div style={{ fontSize:'0.85rem', fontWeight:600, color:'#475569' }}>Clique ou arraste o arquivo .xlsx aqui</div>
              <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display:'none' }} onChange={e => handleFile(e.target.files[0])}/>
            </div>
          )}

          {parsing && (
            <div style={{ textAlign:'center', padding:'24px 0', color:'#64748B' }}>
              <div className="spinner" style={{ margin:'0 auto 10px' }}/> Processando arquivo...
            </div>
          )}

          {preview && !result && (
            <div>
              <div style={{ fontSize:'0.7rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#64748B', marginBottom:8 }}>
                {preview.total} registros encontrados
                {preview.perSheet && (
                  <span style={{ fontWeight:400, textTransform:'none', letterSpacing:'normal', marginLeft:8, color:'#94A3B8' }}>
                    ({Object.entries(preview.perSheet).map(([t, n]) => `${t}: ${n}`).join(' · ')})
                  </span>
                )}
              </div>
              <div style={{ overflowX:'auto', border:'1px solid #E2E8F0', borderRadius:8, maxHeight:260, overflowY:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.78rem' }}>
                  <thead>
                    <tr style={{ background:'#001F5B', position:'sticky', top:0 }}>
                      {['Tipo','Código','Área','Responsável','Data'].map(h => (
                        <th key={h} style={{ padding:'8px 10px', textAlign:'left', color:'#fff', fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.map((r, i) => (
                      <tr key={i} style={{ background: i%2===0 ? '#fff' : '#F8FAFC', borderBottom:'1px solid #F1F5F9' }}>
                        <td style={{ padding:'7px 10px' }}>{r.type}</td>
                        <td style={{ padding:'7px 10px', fontFamily:'monospace', fontWeight:700, color:'#001F5B', whiteSpace:'nowrap' }}>{r.code}</td>
                        <td style={{ padding:'7px 10px' }}>{r.area || '—'}</td>
                        <td style={{ padding:'7px 10px' }}>{r.responsible || '—'}</td>
                        <td style={{ padding:'7px 10px', whiteSpace:'nowrap' }}>{fmtDateBR(r.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result && (
            <div style={{ background:'#D1FAE5', border:'1px solid #6EE7B7', borderRadius:8, padding:'14px 16px' }}>
              <div style={{ fontWeight:700, color:'#065F46', marginBottom:6 }}>✅ Importação concluída</div>
              <div style={{ fontSize:'0.82rem', color:'#064E3B', display:'flex', gap:16 }}>
                <span>✨ <strong>{result.created}</strong> criados</span>
                <span>🔄 <strong>{result.updated}</strong> atualizados</span>
                {result.errors > 0 && <span style={{ color:'#991B1B' }}>⚠️ <strong>{result.errors}</strong> erros</span>}
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer" style={{ flexShrink:0 }}>
          <button className="btn btn-secondary" onClick={onClose}>Fechar</button>
          {preview && !result && (
            <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
              {importing ? 'Importando...' : `📥 Importar ${preview.total} documentos`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────────── */
export default function PMSPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState([]);

  const [docModal, setDocModal]       = useState({ open:false, doc:null });
  const [statusModal, setStatusModal] = useState({ open:false, doc:null });
  const [revModal, setRevModal]       = useState({ open:false, doc:null });
  const [importModal, setImportModal] = useState(false);

  const [search, setSearch]             = useState('');
  const [typeFilter, setTypeFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [plantFilter, setPlantFilter]   = useState('');
  const [validadeFilter, setValidadeFilter] = useState('');
  const [myDocsOnly, setMyDocsOnly]     = useState(false);
  const [expandedGroup, setExpandedGroup] = useState(null);
  const [expandedDoc, setExpandedDoc]     = useState(null);

  const [chartTypeFilter, setChartTypeFilter]         = useState('');
  const [chartValidadeFilter, setChartValidadeFilter] = useState('');
  const [chartPlantFilter, setChartPlantFilter]       = useState('');
  const [chartLangFilter, setChartLangFilter]         = useState('');

  const [colFilterCode, setColFilterCode]       = useState([]);
  const [colFilterPlant, setColFilterPlant]     = useState([]);
  const [colFilterArea, setColFilterArea]       = useState([]);
  const [colFilterResp, setColFilterResp]       = useState([]);
  const [colFilterValidade, setColFilterValidade] = useState([]);
  const [colFilterStatus, setColFilterStatus]   = useState([]);

  const { widths: colWidths, handleResizeStart } = useColumnWidths(PMS_COL_WIDTHS);

  const SUPERIOR_ROLES = ['admin','gerente','coordenador'];
  const isSuperior = SUPERIOR_ROLES.includes(user?.role);

  const isOwner = (doc) => {
    if (!user?.name || !doc.responsible) return false;
    return doc.responsible.trim().toLowerCase() === user.name.trim().toLowerCase();
  };
  const canAct = (doc) => isOwner(doc) || isSuperior;

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/pms');
      setDocs(Array.isArray(res.data) ? res.data : []);
    } catch { toast('Erro ao carregar documentos PMS.', 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);
  useEffect(() => {
    api.get('/users/for-delegation').then(r => setAllUsers(r.data || [])).catch(() => {});
  }, []);

  const exportExcel = useCallback(async () => {
    try {
      const base = import.meta.env.VITE_API_URL || '/api';
      const res = await fetch(`${base}/export/pms`, { credentials: 'include' });
      if (!res.ok) throw new Error('Falha na exportação');
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `CTG_PMS_${new Date().getFullYear()}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast('Excel exportado com sucesso!', 'success');
    } catch { toast('Erro ao exportar Excel.', 'error'); }
  }, [toast]);

  useEffect(() => {
    window._exportPMSExcel = exportExcel;
    const onImport = () => setImportModal(true);
    window.addEventListener('import-pms-excel', onImport);
    return () => {
      delete window._exportPMSExcel;
      window.removeEventListener('import-pms-excel', onImport);
    };
  }, [exportExcel]);

  const openNew  = () => setDocModal({ open:true, doc:null });
  const openEdit = (doc) => setDocModal({ open:true, doc });

  const hasActiveFilters = !!(search || typeFilter || statusFilter || plantFilter || validadeFilter || myDocsOnly
    || colFilterCode.length || colFilterPlant.length || colFilterArea.length || colFilterResp.length || colFilterValidade.length || colFilterStatus.length
    || chartTypeFilter || chartValidadeFilter || chartPlantFilter || chartLangFilter);
  const clearFilters = () => {
    setSearch(''); setTypeFilter(''); setStatusFilter(''); setPlantFilter(''); setValidadeFilter(''); setMyDocsOnly(false);
    setColFilterCode([]); setColFilterPlant([]); setColFilterArea([]); setColFilterResp([]); setColFilterValidade([]); setColFilterStatus([]);
    setChartTypeFilter(''); setChartValidadeFilter(''); setChartPlantFilter(''); setChartLangFilter('');
  };

  // Aplica todos os filtros (busca, dropdowns, colunas e gráficos), exceto a dimensão de
  // gráfico indicada em `skip` — assim o próprio gráfico clicado continua mostrando todas
  // as categorias (para dar pra trocar a seleção), enquanto os demais elementos da página
  // (tabela, KPIs, outros gráficos) refletem o cruzamento.
  const applyFilters = useCallback((skip) => {
    let data = [...docs];
    if (myDocsOnly) data = data.filter(d => isOwner(d));
    if (skip !== 'type' && typeFilter) data = data.filter(d => d.type === typeFilter);
    if (statusFilter) data = data.filter(d => d.status === statusFilter);
    if (skip !== 'plant' && plantFilter) data = data.filter(d => d.plant === plantFilter);
    if (skip !== 'validade' && validadeFilter) data = data.filter(d => d.validade_status === validadeFilter);
    if (skip !== 'type' && chartTypeFilter) data = data.filter(d => d.type === chartTypeFilter);
    if (skip !== 'validade' && chartValidadeFilter) data = data.filter(d => d.validade_status === chartValidadeFilter);
    if (skip !== 'plant' && chartPlantFilter) data = data.filter(d => d.plant === chartPlantFilter);
    if (skip !== 'lang' && chartLangFilter === 'with_en') data = data.filter(d => d.has_en);
    else if (skip !== 'lang' && chartLangFilter === 'without_en') data = data.filter(d => !d.has_en);
    if (colFilterCode.length)   data = data.filter(d => colFilterCode.includes(d.code));
    if (colFilterPlant.length)  data = data.filter(d => colFilterPlant.includes(d.plant));
    if (colFilterArea.length)   data = data.filter(d => colFilterArea.includes(d.area));
    if (colFilterResp.length)   data = data.filter(d => colFilterResp.includes(d.responsible));
    if (colFilterValidade.length) data = data.filter(d => colFilterValidade.includes(d.validade_status));
    if (colFilterStatus.length) data = data.filter(d => colFilterStatus.includes(d.status));
    const q = search.toLowerCase();
    if (q) {
      data = data.filter(d =>
        (d.code||'').toLowerCase().includes(q)
        || (d.responsible||'').toLowerCase().includes(q)
        || (d.title_pt||'').toLowerCase().includes(q)
        || (d.area||'').toLowerCase().includes(q)
        || (d.plant||'').toLowerCase().includes(q)
      );
    }
    return data;
  }, [docs, typeFilter, statusFilter, plantFilter, validadeFilter, search, myDocsOnly, user,
      colFilterCode, colFilterPlant, colFilterArea, colFilterResp, colFilterValidade, colFilterStatus, chartTypeFilter, chartValidadeFilter, chartPlantFilter, chartLangFilter]);

  const dedupeLatest = (arr) => {
    const map = new Map();
    arr.forEach(d => {
      const key = d.base_code || d.code;
      const cur = map.get(key);
      if (!cur || (d.revision ?? -1) > (cur.revision ?? -1)) map.set(key, d);
    });
    return Array.from(map.values());
  };

  const filtered          = useMemo(() => applyFilters(null),      [applyFilters]);
  const kpiDocs           = useMemo(() => dedupeLatest(filtered),  [filtered]);
  const typeChartDocs     = useMemo(() => dedupeLatest(applyFilters('type')),     [applyFilters]);
  const plantChartDocs    = useMemo(() => dedupeLatest(applyFilters('plant')),    [applyFilters]);
  const validadeChartDocs = useMemo(() => dedupeLatest(applyFilters('validade')), [applyFilters]);
  const langChartDocs     = useMemo(() => dedupeLatest(applyFilters('lang')),     [applyFilters]);

  const groups = useMemo(() => {
    const map = new Map();
    filtered.forEach(d => {
      const key = d.base_code || d.code;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(d);
    });
    map.forEach(arr => arr.sort((a,b) => (b.revision ?? -1) - (a.revision ?? -1)));
    return Array.from(map.entries()).map(([key, items]) => ({ key, items, latest: items[0] }));
  }, [filtered]);

  /* KPIs — refletem o cruzamento total (todos os filtros, incluindo gráficos) */
  const totalAll   = kpiDocs.length;
  const published  = kpiDocs.filter(d => d.status === 'Publicado').length;
  const expiring   = kpiDocs.filter(d => d.validade_status === 'Alerta').length;
  const expired    = kpiDocs.filter(d => d.validade_status === 'Vencido').length;
  const myDocsCount = kpiDocs.filter(d => isOwner(d)).length;

  /* Charts — cada um reflete os demais filtros, exceto a própria dimensão */
  const langBreakdown = (arr) => {
    const withEn = arr.filter(d => d.has_en).length;
    return [
      { label:'Com Inglês', value: withEn, color:'#10B981' },
      { label:'Só Português', value: arr.length - withEn, color:'#94A3B8' },
    ];
  };

  const typeChartData = TYPES.map(t => {
    const itemsForType = typeChartDocs.filter(d=>d.type===t.value);
    return { label:t.value, value:itemsForType.length, color:TYPE_COLORS[t.value], filterKey:t.value,
      tooltipBreakdowns: [
        { title:'Usina',  items: PLANTS.map(p => ({ label:p, value: itemsForType.filter(d=>d.plant===p).length })) },
        { title:'Status de validade', items: VALIDADE.map(v => ({ label:v.value, value: itemsForType.filter(d=>d.validade_status===v.value).length, color:v.color })) },
        { title:'Idioma', items: langBreakdown(itemsForType) },
      ] };
  });
  const validadeChartData = VALIDADE.map(v => {
    const itemsForValidade = validadeChartDocs.filter(d=>d.validade_status===v.value);
    return { label:v.value, value:itemsForValidade.length, color:v.color, filterKey:v.value,
      tooltipBreakdowns: [
        { title:'Tipo',  items: TYPES.map(t => ({ label:t.value, value: itemsForValidade.filter(d=>d.type===t.value).length, color:TYPE_COLORS[t.value] })) },
        { title:'Usina', items: PLANTS.map(p => ({ label:p, value: itemsForValidade.filter(d=>d.plant===p).length })) },
        { title:'Idioma', items: langBreakdown(itemsForValidade) },
      ] };
  });
  const plantChartData = PLANTS.map(p => {
    const itemsForPlant = plantChartDocs.filter(d=>d.plant===p);
    return { label:p, value:itemsForPlant.length, color:'#0066B3', filterKey:p,
      tooltipBreakdowns: [
        { title:'Tipo',  items: TYPES.map(t => ({ label:t.value, value: itemsForPlant.filter(d=>d.type===t.value).length, color:TYPE_COLORS[t.value] })) },
        { title:'Status de validade', items: VALIDADE.map(v => ({ label:v.value, value: itemsForPlant.filter(d=>d.validade_status===v.value).length, color:v.color })) },
        { title:'Idioma', items: langBreakdown(itemsForPlant) },
      ] };
  }).filter(d=>d.value>0);
  const langWithEn = langChartDocs.filter(d => d.has_en).length;
  const langItemsFor = (predicate) => langChartDocs.filter(predicate);
  const langChartData = [
    { label:'Com Inglês', value: langWithEn, color:'#10B981', filterKey:'with_en',
      tooltipBreakdowns: [
        { title:'Tipo',  items: TYPES.map(t => ({ label:t.value, value: langItemsFor(d=>d.has_en && d.type===t.value).length, color:TYPE_COLORS[t.value] })) },
        { title:'Usina', items: PLANTS.map(p => ({ label:p, value: langItemsFor(d=>d.has_en && d.plant===p).length })) },
        { title:'Status de validade', items: VALIDADE.map(v => ({ label:v.value, value: langItemsFor(d=>d.has_en && d.validade_status===v.value).length, color:v.color })) },
      ] },
    { label:'Só Português', value: langChartDocs.length - langWithEn, color:'#94A3B8', filterKey:'without_en',
      tooltipBreakdowns: [
        { title:'Tipo',  items: TYPES.map(t => ({ label:t.value, value: langItemsFor(d=>!d.has_en && d.type===t.value).length, color:TYPE_COLORS[t.value] })) },
        { title:'Usina', items: PLANTS.map(p => ({ label:p, value: langItemsFor(d=>!d.has_en && d.plant===p).length })) },
        { title:'Status de validade', items: VALIDADE.map(v => ({ label:v.value, value: langItemsFor(d=>!d.has_en && d.validade_status===v.value).length, color:v.color })) },
      ] },
  ];
  const plantsUsed = PLANTS.filter(p => docs.some(d => d.plant === p));
  const areasUsed   = [...new Set(docs.map(d => d.area).filter(Boolean))];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16, padding:'0 2px' }}>

      {/* KPI Cards + Visão geral (validade / idioma) */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:10, alignItems:'stretch' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {/* Linha 1: KPI cards */}
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'stretch' }}>
            <StatCard label="Total Geral"      value={totalAll}   color="#001F5B"/>
            <StatCard label="Publicados"       value={published}  color="#10B981"/>
            <StatCard label="Vencendo (30d)"   value={expiring}   color={expiring>0?'#F59E0B':'#94A3B8'} sub={expiring>0?'Atenção':'Tudo ok'}/>
            <StatCard label="Vencidos"         value={expired}    color={expired>0?'#EF4444':'#94A3B8'} sub={expired>0?'Ação necessária':'Tudo ok'}/>
          </div>
          {/* Linha 2: gráficos por tipo/usina */}
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'stretch', flex:1 }}>
            <div style={{ flex:'1 1 220px', minWidth:200, display:'flex' }}>
              <HBarChart title="Documentos por Tipo" data={typeChartData}
                activeFilter={chartTypeFilter}
                onFilter={setChartTypeFilter}
              />
            </div>
            <div style={{ flex:'2 1 400px', minWidth:280, display:'flex' }}>
              <VBarChart title="Documentos por Usina" data={plantChartData}
                activeFilter={chartPlantFilter}
                onFilter={setChartPlantFilter}
              />
            </div>
          </div>
        </div>

        {/* Coluna individual: visão geral (mesma altura das duas linhas à esquerda) */}
        <StatsOverviewCard
          blocks={[
            {
              title: 'Status de Validade', data: validadeChartData,
              highlightKey: 'Em dia', highlightLabel: 'Em dia',
              activeFilter: chartValidadeFilter,
              onFilter: setChartValidadeFilter,
            },
            {
              title: 'Relação de Idioma', data: langChartData,
              highlightKey: 'with_en', highlightLabel: 'Com Inglês',
              activeFilter: chartLangFilter,
              onFilter: setChartLangFilter,
            },
          ]}
        />
      </div>

      {/* Filter bar */}
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <button onClick={openNew} style={{
          display:'flex', alignItems:'center', gap:6, padding:'8px 16px',
          border:'none', borderRadius:8, background:'#10B981',
          fontSize:'0.8rem', fontWeight:700, cursor:'pointer', color:'#fff', flexShrink:0,
        }}>+ Novo Documento</button>

        <button onClick={() => setMyDocsOnly(v=>!v)} style={{
          display:'flex', alignItems:'center', gap:7, padding:'8px 16px',
          border:`2px solid ${myDocsOnly ? '#7C3AED' : '#DDD6FE'}`,
          borderRadius:8, cursor:'pointer', flexShrink:0, transition:'all 0.15s',
          background: myDocsOnly ? '#7C3AED' : '#F5F3FF',
          color: myDocsOnly ? '#fff' : '#6D28D9',
          fontSize:'0.8rem', fontWeight:700,
        }}>
          <span style={{ fontSize:'0.9rem' }}>👤</span>
          {myDocsOnly ? 'Todos os docs' : 'Meus docs'}
          {myDocsOnly && <span style={{ background:'rgba(255,255,255,0.25)', borderRadius:10, padding:'1px 6px', fontSize:'0.7rem' }}>{myDocsCount}</span>}
        </button>

        <button onClick={clearFilters} disabled={!hasActiveFilters} style={{
          display:'flex', alignItems:'center', gap:6, padding:'8px 16px',
          border:'1.5px solid #FCA5A5', borderRadius:8, background:'#FEE2E2', color:'#DC2626',
          fontSize:'0.8rem', fontWeight:700, cursor: hasActiveFilters ? 'pointer' : 'not-allowed',
          opacity: hasActiveFilters ? 1 : 0.5, flexShrink:0,
        }}>Limpar filtros</button>

        <div style={{ display:'flex', gap:6, alignItems:'center', flex:1, background:'#fff', border:'1px solid #E2E8F0', borderRadius:8, padding:'7px 12px', minWidth:0 }}>
          <span style={{ color:'#94A3B8', fontSize:'0.85rem', flexShrink:0 }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar código, responsável, título, área..."
            style={{ flex:1, border:'none', outline:'none', fontSize:'0.82rem', fontFamily:'var(--font-body)', color:'#1E293B', background:'transparent', minWidth:0 }}/>
          {search && <button onClick={() => setSearch('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#94A3B8', flexShrink:0 }}>✕</button>}
          <Div/>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selStyle(!!typeFilter)}>
            <option value="">Todos os tipos</option>
            {TYPES.map(t => <option key={t.value} value={t.value}>{t.value}</option>)}
          </select>
          <Div/>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selStyle(!!statusFilter)}>
            <option value="">Todos os status</option>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.value}</option>)}
          </select>
          <Div/>
          <select value={validadeFilter} onChange={e => setValidadeFilter(e.target.value)} style={selStyle(!!validadeFilter)}>
            <option value="">Toda validade</option>
            {VALIDADE.map(v => <option key={v.value} value={v.value}>{v.value}</option>)}
          </select>
          <Div/>
          <select value={plantFilter} onChange={e => setPlantFilter(e.target.value)} style={selStyle(!!plantFilter)}>
            <option value="">Todas as usinas</option>
            {plantsUsed.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <Div/>
          <span style={{ fontSize:'0.72rem', color:'#94A3B8', whiteSpace:'nowrap', flexShrink:0 }}>{groups.length} grupos / {filtered.length} docs</span>
        </div>
      </div>

      {/* Tabela agrupada */}
      <div style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:10, overflow:'hidden', maxHeight:'calc(100vh - 460px)', minHeight:200, overflowY:'auto' }}>
        {loading ? (
          <div style={{ padding:48, textAlign:'center', color:'#94A3B8' }}>
            <div className="spinner" style={{ margin:'0 auto 12px' }}/>Carregando documentos...
          </div>
        ) : groups.length === 0 ? (
          <div style={{ padding:48, textAlign:'center' }}>
            <div style={{ fontSize:'2rem', marginBottom:10 }}>📄</div>
            <div style={{ fontSize:'0.9rem', color:'#64748B', fontWeight:600 }}>
              {myDocsOnly ? 'Você não é responsável por nenhum documento' : 'Nenhum documento encontrado'}
            </div>
            <button onClick={openNew} style={{ marginTop:12, padding:'8px 18px', border:'none', borderRadius:8, background:'#001F5B', color:'#fff', fontSize:'0.82rem', fontWeight:700, cursor:'pointer' }}>+ Registrar Documento</button>
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed', minWidth: PMS_COL_WIDTHS.reduce((s,w)=>s+w,0) }}>
            <colgroup>
              {colWidths.map((w, i) => <col key={i} style={{ width:w }} />)}
            </colgroup>
            <thead style={{ position:'sticky', top:0, zIndex:2 }}>
              <tr style={{ background:'#F8FAFC', borderBottom:'2px solid #E2E8F0' }}>
                <th style={{ ...TH, textAlign:'center' }}>🔗<ColumnResizeHandle onResizeStart={handleResizeStart(0)} /></th>
                <th style={TH}>
                  <div style={{ display:'flex', alignItems:'center' }}>
                    Código
                    <ColumnFilterDropdown column="Código" uniqueValues={[...new Set(docs.map(d => d.code).filter(Boolean))]} selectedValues={colFilterCode} onChange={setColFilterCode}/>
                  </div>
                  <ColumnResizeHandle onResizeStart={handleResizeStart(1)} />
                </th>
                <th style={TH}>
                  <div style={{ display:'flex', alignItems:'center' }}>
                    Usina
                    <ColumnFilterDropdown column="Usina" uniqueValues={plantsUsed} selectedValues={colFilterPlant} onChange={setColFilterPlant}/>
                  </div>
                  <ColumnResizeHandle onResizeStart={handleResizeStart(2)} />
                </th>
                <th style={TH}>
                  <div style={{ display:'flex', alignItems:'center' }}>
                    Área
                    <ColumnFilterDropdown column="Área" uniqueValues={areasUsed} selectedValues={colFilterArea} onChange={setColFilterArea}/>
                  </div>
                  <ColumnResizeHandle onResizeStart={handleResizeStart(3)} />
                </th>
                <th style={TH}>
                  <div style={{ display:'flex', alignItems:'center' }}>
                    Responsável
                    <ColumnFilterDropdown column="Responsável" uniqueValues={[...new Set(docs.map(d => d.responsible).filter(Boolean))]} selectedValues={colFilterResp} onChange={setColFilterResp}/>
                  </div>
                  <ColumnResizeHandle onResizeStart={handleResizeStart(4)} />
                </th>
                <th style={TH}>
                  <div style={{ display:'flex', alignItems:'center' }}>
                    Validade
                    <ColumnFilterDropdown column="Validade" uniqueValues={VALIDADE.map(v => v.value)} selectedValues={colFilterValidade} onChange={setColFilterValidade}/>
                  </div>
                  <ColumnResizeHandle onResizeStart={handleResizeStart(5)} />
                </th>
                <th style={TH}>Título<ColumnResizeHandle onResizeStart={handleResizeStart(6)} /></th>
                <th style={TH}>
                  <div style={{ display:'flex', alignItems:'center' }}>
                    Status
                    <ColumnFilterDropdown column="Status" uniqueValues={STATUSES.map(s => s.value)} selectedValues={colFilterStatus} onChange={setColFilterStatus}/>
                  </div>
                  <ColumnResizeHandle onResizeStart={handleResizeStart(7)} />
                </th>
                <th style={TH}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(({ key, items, latest }) => {
                const hasRevisions = items.length > 1;
                const groupOpen = expandedGroup === key;
                const isMine = isOwner(latest);

                return (
                  <Fragment key={key}>
                    <tr
                      onClick={() => setExpandedDoc(expandedDoc===latest.id ? null : latest.id)}
                      style={{ background:'#fff', cursor:'pointer', borderBottom: expandedDoc===latest.id ? 'none' : '1px solid #F1F5F9' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F0F9FF'}
                      onMouseLeave={e => e.currentTarget.style.background='#fff'}
                    >
                      <td style={{ ...TD, textAlign:'center' }}>
                        {latest.document_link && (
                          <a
                            href={externalLink(latest.document_link)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Abrir documento"
                            onClick={e => e.stopPropagation()}
                            style={{ color:'#0b5cab', textDecoration:'none', fontSize:'0.9rem' }}
                          >🔗</a>
                        )}
                      </td>
                      <td style={TD}>
                        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                          {hasRevisions && (
                            <button onClick={e => { e.stopPropagation(); setExpandedGroup(groupOpen ? null : key); }}
                              title={groupOpen ? 'Recolher revisões' : `Ver ${items.length} versões`}
                              style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 9px', borderRadius:10,
                                border:`1.5px solid ${groupOpen?'#0066B3':'#CBD5E1'}`,
                                background: groupOpen?'#0066B3':'#F8FAFC',
                                color: groupOpen?'#fff':'#64748B',
                                fontSize:'0.65rem', fontWeight:700, cursor:'pointer', flexShrink:0,
                              }}>
                              <span style={{ fontSize:'0.6rem' }}>{groupOpen?'▲':'▼'}</span>
                              {items.length} {items.length===1?'versão':'versões'}
                            </button>
                          )}
                          <span style={{
                            fontSize:'0.6rem', fontWeight:700, color:'#fff', background:TYPE_COLORS[latest.type],
                            borderRadius:6, padding:'1px 5px', flexShrink:0,
                          }}>{latest.type}</span>
                          <span style={{ fontFamily:'monospace', fontWeight:700, color:'#001F5B', fontSize:'0.82rem' }}>{latest.code}</span>
                          {isMine && <span style={{ fontSize:'0.6rem', background:'#F5F3FF', color:'#6D28D9', border:'1px solid #DDD6FE', borderRadius:10, padding:'1px 5px', fontWeight:700 }}>meu</span>}
                        </div>
                      </td>
                      <td style={{ ...TD, fontSize:'0.78rem', color:'#64748B' }}>{latest.plant||'—'}</td>
                      <td style={{ ...TD, fontSize:'0.78rem', color:'#64748B', maxWidth:160 }}>{latest.area}</td>
                      <td style={{ ...TD, fontSize:'0.82rem' }}>{latest.responsible}</td>
                      <td style={TD}><ValidadeBadge status={latest.validade_status} days={latest.days_to_expire}/></td>
                      <td style={{ ...TD, fontSize:'0.82rem', maxWidth:240 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <LangBadges hasPt={latest.has_pt} hasEn={latest.has_en}/>
                          <span style={{ display:'-webkit-box', WebkitLineClamp:1, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{latest.title_pt}</span>
                        </div>
                      </td>
                      <td style={TD}><StatusBadge status={latest.status}/></td>
                      <td style={{ ...TD }} onClick={e => e.stopPropagation()}>
                        <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                          {canAct(latest) && (
                            <>
                              <ActionBtn color="#8B5CF6" onClick={() => setRevModal({ open:true, doc:latest })} tooltip="Nova Revisão">🔄</ActionBtn>
                              <ActionBtn color="#0066B3" onClick={() => setStatusModal({ open:true, doc:latest })} tooltip="Alterar Status">🔖</ActionBtn>
                              <ActionBtn color="#475569" onClick={() => openEdit(latest)} tooltip="Editar Documento">✏️</ActionBtn>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {expandedDoc === latest.id && (
                      <tr style={{ background:'#F8FBFF', borderBottom:'1px solid #E2E8F0' }}>
                        <td colSpan={9} style={{ padding:'12px 16px' }}>
                          <DocDetail doc={latest}/>
                        </td>
                      </tr>
                    )}

                    {groupOpen && items.slice(1).map(rev => (
                      <Fragment key={rev.id}>
                        <tr
                          onClick={() => setExpandedDoc(expandedDoc===rev.id ? null : rev.id)}
                          style={{ background:'#FAFAFA', cursor:'pointer', borderBottom: expandedDoc===rev.id?'none':'1px solid #F1F5F9' }}
                          onMouseEnter={e => e.currentTarget.style.background='#F0F9FF'}
                          onMouseLeave={e => e.currentTarget.style.background='#FAFAFA'}
                        >
                          <td style={{ ...TD, textAlign:'center' }}>
                            {rev.document_link && (
                              <a
                                href={externalLink(rev.document_link)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Abrir documento"
                                onClick={e => e.stopPropagation()}
                                style={{ color:'#0b5cab', textDecoration:'none', fontSize:'0.9rem' }}
                              >🔗</a>
                            )}
                          </td>
                          <td style={{ ...TD, paddingLeft:0 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:0 }}>
                              <div style={{ width:28, display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                                <div style={{ width:1, height:'50%', background:'#CBD5E1' }}/>
                                <div style={{ width:12, height:1, background:'#CBD5E1', alignSelf:'flex-end' }}/>
                                <div style={{ width:1, height:'50%', background:'transparent' }}/>
                              </div>
                              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                <span style={{ fontFamily:'monospace', fontWeight:600, color:'#64748B', fontSize:'0.78rem' }}>{rev.code}</span>
                                {rev.revision === null || rev.revision === undefined
                                  ? <span style={{ fontSize:'0.6rem', background:'#F1F5F9', color:'#94A3B8', borderRadius:10, padding:'1px 6px' }}>original</span>
                                  : <span style={{ fontSize:'0.6rem', background:'#EFF6FF', color:'#3B82F6', border:'1px solid #BFDBFE', borderRadius:10, padding:'1px 6px', fontWeight:700 }}>R{rev.revision}</span>
                                }
                              </div>
                            </div>
                          </td>
                          <td style={{ ...TD, fontSize:'0.75rem', color:'#94A3B8' }}>{rev.plant||'—'}</td>
                          <td style={{ ...TD, fontSize:'0.75rem', color:'#94A3B8' }}>{rev.area}</td>
                          <td style={{ ...TD, fontSize:'0.78rem', color:'#64748B' }}>{rev.responsible}</td>
                          <td style={TD}><ValidadeBadge status={rev.validade_status} days={rev.days_to_expire}/></td>
                          <td style={{ ...TD, fontSize:'0.78rem', color:'#64748B', maxWidth:280 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              <LangBadges hasPt={rev.has_pt} hasEn={rev.has_en}/>
                              <span style={{ display:'-webkit-box', WebkitLineClamp:1, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{rev.title_pt}</span>
                            </div>
                          </td>
                          <td style={TD}><StatusBadge status={rev.status}/></td>
                          <td style={{ ...TD }} onClick={e => e.stopPropagation()}>
                            {canAct(rev) && (
                              <div style={{ display:'flex', gap:5 }}>
                                <ActionBtn color="#0066B3" onClick={() => setStatusModal({ open:true, doc:rev })} tooltip="Alterar Status">🔖</ActionBtn>
                                <ActionBtn color="#475569" onClick={() => openEdit(rev)} tooltip="Editar Documento">✏️</ActionBtn>
                              </div>
                            )}
                          </td>
                        </tr>
                        {expandedDoc === rev.id && (
                          <tr style={{ background:'#F8FBFF', borderBottom:'1px solid #E2E8F0' }}>
                            <td colSpan={9} style={{ padding:'12px 16px 12px 32px' }}>
                              <DocDetail doc={rev}/>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <PMSDocModal open={docModal.open} onClose={() => setDocModal({ open:false, doc:null })} onSaved={fetchDocs} doc={docModal.doc} allUsers={allUsers}/>
      <StatusModal open={statusModal.open} onClose={() => setStatusModal({ open:false, doc:null })} onSaved={fetchDocs} doc={statusModal.doc}/>
      <RevisionModal open={revModal.open} onClose={() => setRevModal({ open:false, doc:null })} onSaved={fetchDocs} doc={revModal.doc} allUsers={allUsers}/>
      <ImportExcelModal open={importModal} onClose={() => setImportModal(false)} onImported={fetchDocs}/>
    </div>
  );
}

/* ─── DocDetail ──────────────────────────────────────────────────────────────── */
function DocDetail({ doc }) {
  return (
    <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
      <div style={{ flex:1, minWidth:200 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:'10px 24px' }}>
          {doc.plant && <InfoItem label="Usina" value={doc.plant}/>}
          {doc.category && <InfoItem label="Categoria" value={doc.category}/>}
          <InfoItem label="Tipo" value={`${doc.type} — ${TYPE_META[doc.type]?.label||''}`}/>
          <InfoItem label="Área" value={doc.area}/>
          {doc.revision !== null && doc.revision !== undefined && <InfoItem label="Revisão" value={`R${doc.revision}`}/>}
          <InfoItem label="Validade" value={fmtDateBR(doc.expiry_date)}/>
          <InfoItem label="Idiomas disponíveis" value={<LangBadges hasPt={doc.has_pt} hasEn={doc.has_en}/>}/>
          {doc.title_en && <InfoItem label="Título (Inglês)" value={doc.title_en} full/>}
          {doc.notes && <InfoItem label="Observações" value={doc.notes} full/>}
        </div>
        {doc.status === 'Publicado' && (
          <div style={{ marginTop:8 }}>
            {doc.document_link
              ? <a href={externalLink(doc.document_link)} target="_blank" rel="noopener noreferrer"
                  style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:'0.8rem', color:'#0066B3', fontWeight:600, textDecoration:'none' }}>
                  🔗 Acessar documento
                </a>
              : <span style={{ fontSize:'0.78rem', color:'#EF4444', fontWeight:600 }}>⚠ Publicado sem link cadastrado</span>
            }
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Style helpers ──────────────────────────────────────────────────────────── */
const TH = { position:'relative', padding:'10px 14px', textAlign:'left', fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color:'#64748B', whiteSpace:'nowrap' };
const TD = { padding:'10px 14px', verticalAlign:'middle' };
const Div = () => <div style={{ width:1, height:18, background:'#E2E8F0', flexShrink:0 }}/>;
const selStyle = (active) => ({ border:'none', outline:'none', fontSize:'0.78rem', fontFamily:'var(--font-body)', color: active?'#001F5B':'#94A3B8', fontWeight: active?700:400, cursor:'pointer', background:'transparent', flexShrink:0 });
function ActionBtn({ color, onClick, children, tooltip }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position:'relative', display:'inline-flex' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}>
      <button onClick={onClick} style={{
        width:30, height:30, border:`1.5px solid ${color}20`, borderRadius:7,
        background:`${color}10`, color, fontSize:'0.82rem', cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'center',
        transition:'all 0.1s', flexShrink:0,
      }}
        onMouseEnter={e => { e.currentTarget.style.background=`${color}25`; e.currentTarget.style.borderColor=color; }}
        onMouseLeave={e => { e.currentTarget.style.background=`${color}10`; e.currentTarget.style.borderColor=`${color}20`; }}
      >{children}</button>
      {show && tooltip && (
        <div style={{
          position:'absolute', bottom:'calc(100% + 6px)', left:'50%', transform:'translateX(-50%)',
          background:'#1E293B', color:'#fff', fontSize:'0.68rem', fontWeight:600,
          padding:'4px 9px', borderRadius:6, whiteSpace:'nowrap', zIndex:9999,
          pointerEvents:'none', boxShadow:'0 2px 8px rgba(0,0,0,0.25)',
        }}>
          {tooltip}
          <div style={{ position:'absolute', top:'100%', left:'50%', transform:'translateX(-50%)', width:0, height:0, borderLeft:'4px solid transparent', borderRight:'4px solid transparent', borderTop:'4px solid #1E293B' }}/>
        </div>
      )}
    </div>
  );
}
function InfoItem({ label, value, full }) {
  return (
    <div style={{ gridColumn: full?'1 / -1':undefined }}>
      <div style={{ fontSize:'0.62rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'#94A3B8', marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:'0.82rem', color:'#1E293B', fontWeight:500 }}>{value}</div>
    </div>
  );
}
