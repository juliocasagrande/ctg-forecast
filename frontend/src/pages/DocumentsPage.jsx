import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../utils/api.js';
import { useToast } from '../components/ui/Toast.jsx';
import ColumnFilterDropdown from '../components/ui/ColumnFilterDropdown.jsx';
import * as mammoth from 'mammoth';

/* ─── Constants ──────────────────────────────────────────────────────────────── */
const DOC_TYPES = [
  { value: 'ATA', label: 'Atas' },
  { value: 'CTA', label: 'Cartas' },
  { value: 'RT',  label: 'Relatório Técnico' },
  { value: 'EP',  label: 'Ensaios Preditivos' },
  { value: 'ET',  label: 'Especificação Técnica' },
  { value: 'ROP', label: 'Rel. de Ocorrências e Perturbações' },
  { value: 'MC',  label: 'Memorial de Cálculo' },
  { value: 'ROG', label: 'Rel. Ocorrência Grave e Indisponibilidade' },
  { value: 'RFH', label: 'Relatório de Falha Humana' },
];
const AREAS = [
  { value: 'ENG', label: 'Eng. de Manutenção' },
  { value: 'PRD', label: 'Produção' },
  { value: 'COP', label: 'Coordenação Operação' },
];
const PLANT_SIGLAS = {
  'PCH Palmeiras':'PLM', 'PCH Retiro':'RET',
  'UHE Canoas 1':'CN1',  'UHE Canoas 2':'CN2',
  'UHE Capivara':'CPV',  'UHE Chavantes':'CHV',
  'UHE Garibaldi':'GAR', 'UHE Ilha Solteira':'ILS',
  'UHE Jupiá':'JUP',     'UHE Jurumirim':'JUR',
  'UHE Rosana':'ROS',    'UHE Salto':'STO',
  'UHE Salto Grande':'SAG', 'UHE Taquaruçu':'TAQ',
};

const ALL_PLANTS = [
  'PCH Palmeiras','PCH Retiro','UHE Canoas 1','UHE Canoas 2',
  'UHE Capivara','UHE Chavantes','UHE Garibaldi','UHE Ilha Solteira',
  'UHE Jupiá','UHE Jurumirim','UHE Rosana','UHE Salto',
  'UHE Salto Grande','UHE Taquaruçu',
];
const STATUSES = [
  { value: 'Em elaboração',  color: '#F59E0B', bg: '#FEF3C7', text: '#92400E' },
  { value: 'Para aprovação', color: '#3B82F6', bg: '#EFF6FF', text: '#1D4ED8' },
  { value: 'Publicado',      color: '#10B981', bg: '#D1FAE5', text: '#065F46' },
  { value: 'Cancelado',      color: '#EF4444', bg: '#FEE2E2', text: '#991B1B' },
];
const STATUS_META = Object.fromEntries(STATUSES.map(s => [s.value, s]));
const TYPE_META   = Object.fromEntries(DOC_TYPES.map(t => [t.value, t]));
const CURRENT_YEAR       = new Date().getFullYear();
const CURRENT_YEAR_SHORT = CURRENT_YEAR % 100;

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
function fmtDateBR(val) {
  if (!val) return '—';
  const match = String(val).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '—';
  const [, y, m, d] = match;
  return `${d}/${m}/${y}`;
}
function buildCode(type, area, seq, year, revision) {
  if (!type || !area || !seq || !year) return '';
  const seqStr = String(seq).padStart(3, '0');
  const yy     = String(year).padStart(2, '0');
  let code = `${type}-${area}-${seqStr}-${yy}`;
  const rev = parseInt(revision);
  if (!isNaN(rev) && revision !== '' && revision !== null && revision !== undefined) code += `-R${rev}`;
  return code;
}

/* ─── StatusBadge ────────────────────────────────────────────────────────────── */
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
function HBarChart({ data, title, activeFilter, onFilter }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const visible = data.filter(d => d.value > 0);
  const clickable = !!onFilter;
  return (
    <div style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:10, padding:'14px 16px', flex:1, minWidth:0 }}>
      <div style={{ fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#94A3B8', marginBottom:10 }}>{title}</div>
      {visible.length === 0 ? <div style={{ fontSize:'0.78rem', color:'#CBD5E1', textAlign:'center', padding:'16px 0' }}>Sem dados</div>
        : <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            {visible.map((d,i) => {
              const isActive = activeFilter === d.filterKey;
              return (
                <div key={i}
                  onClick={() => clickable && onFilter(isActive ? '' : d.filterKey)}
                  style={{ display:'flex', alignItems:'center', gap:8, cursor: clickable ? 'pointer' : 'default',
                    opacity: activeFilter && !isActive ? 0.45 : 1, transition:'opacity 0.15s',
                    borderRadius:4, padding:'2px 0',
                  }}
                >
                  <div style={{ fontSize:'0.68rem', color: isActive ? '#001F5B' : '#475569', width:34, textAlign:'right', flexShrink:0, fontWeight: isActive ? 700 : 600 }}>{d.label}</div>
                  <div style={{ flex:1, background:'#F1F5F9', borderRadius:4, height:14, overflow:'hidden' }}>
                    <div style={{ width:`${(d.value/max)*100}%`, height:'100%', background:d.color||'#0066B3', borderRadius:4 }} />
                  </div>
                  <div style={{ fontSize:'0.68rem', fontWeight:700, color:'#1E293B', width:20, flexShrink:0 }}>{d.value}</div>
                </div>
              );
            })}
          </div>}
    </div>
  );
}
function DonutChart({ data, title, activeFilter, onFilter }) {
  const total = data.reduce((s,d) => s+d.value, 0);
  const r=32, cx=45, cy=45, circ=2*Math.PI*r;
  let off=0;
  const slices = data.filter(d=>d.value>0).map(d => { const dash=(d.value/total)*circ; const s={...d,dash,offset:off}; off+=dash; return s; });
  const clickable = !!onFilter;
  return (
    <div style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:10, padding:'14px 16px', flex:1, minWidth:0 }}>
      <div style={{ fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#94A3B8', marginBottom:10 }}>{title}</div>
      {total===0 ? <div style={{ fontSize:'0.78rem', color:'#CBD5E1', textAlign:'center', padding:'16px 0' }}>Sem dados</div>
        : <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <svg width={90} height={90} viewBox="0 0 90 90" style={{ flexShrink:0 }}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F1F5F9" strokeWidth={14}/>
              {slices.map((s,i) => {
                const isActive = activeFilter === s.filterKey;
                return (
                  <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={14}
                    strokeDasharray={`${s.dash} ${circ-s.dash}`} strokeDashoffset={-s.offset+circ/4}
                    opacity={activeFilter && !isActive ? 0.3 : 1}
                    style={{ cursor: clickable ? 'pointer' : 'default', transition:'opacity 0.15s' }}
                    onClick={() => clickable && onFilter(isActive ? '' : s.filterKey)}
                  />
                );
              })}
              <text x={cx} y={cy+1} textAnchor="middle" dominantBaseline="middle" style={{ fontSize:'0.8rem', fontWeight:700, fill:'#1E293B' }}>{total}</text>
            </svg>
            <div style={{ display:'flex', flexDirection:'column', gap:5, flex:1, minWidth:0 }}>
              {slices.map((s,i) => {
                const isActive = activeFilter === s.filterKey;
                return (
                  <div key={i}
                    onClick={() => clickable && onFilter(isActive ? '' : s.filterKey)}
                    style={{ display:'flex', alignItems:'center', gap:5, cursor: clickable ? 'pointer' : 'default',
                      opacity: activeFilter && !isActive ? 0.4 : 1, transition:'opacity 0.15s',
                    }}
                  >
                    <span style={{ width:8, height:8, borderRadius:'50%', background:s.color, flexShrink:0 }}/>
                    <span style={{ fontSize:'0.68rem', color:'#475569', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight: isActive ? 700 : 400 }}>{s.label}</span>
                    <span style={{ fontSize:'0.68rem', fontWeight:700, color:'#1E293B', flexShrink:0 }}>{s.value}</span>
                  </div>
                );
              })}
            </div>
          </div>}
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

/* ─── StatusModal — alterar apenas o status ─────────────────────────────────── */
function StatusModal({ open, onClose, onSaved, doc }) {
  const { toast } = useToast();
  const [status, setStatus]   = useState(doc?.status || '');
  const [saving, setSaving]   = useState(false);
  const [link, setLink]       = useState(doc?.document_link || '');

  useEffect(() => { if (open && doc) { setStatus(doc.status); setLink(doc.document_link || ''); } }, [open, doc]);

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/documents/${doc.id}/status`, {
        status,
        ...(status === 'Publicado' ? { document_link: link } : {}),
      });
      toast('Status atualizado com sucesso!', 'success');
      onSaved();
      setTimeout(() => onClose(), 500);
    } catch (err) { toast(err.response?.data?.error || 'Erro ao atualizar status.', 'error'); }
    finally { setSaving(false); }
  };

  // Check if there are changes to save
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
                  transition:'all 0.12s',
                }}>
                  <input type="radio" name="new_status" value={s.value} checked={status===s.value}
                    onChange={() => setStatus(s.value)} style={{ display:'none' }}/>
                  <span style={{ width:10, height:10, borderRadius:'50%', background:s.color, flexShrink:0 }}/>
                  <span style={{ fontSize:'0.85rem', fontWeight: status===s.value ? 700 : 400, color: status===s.value ? s.text : '#475569' }}>{s.value}</span>
                  {s.value === 'Cancelado' && <span style={{ marginLeft:'auto', fontSize:'0.7rem', color:'#94A3B8' }}>Irreversível sem permissão</span>}
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

/* ─── RevisionModal — nova revisão (só data e responsável) ─────────────────── */
function RevisionModal({ open, onClose, onSaved, doc, allUsers }) {
  const { toast } = useToast();
  const [date, setDate]             = useState(new Date().toISOString().slice(0,10));
  const [responsible, setResponsible] = useState('');
  const [saving, setSaving]         = useState(false);

  useEffect(() => {
    if (open && doc) {
      setDate(new Date().toISOString().slice(0,10));
      setResponsible(doc.responsible || '');
    }
  }, [open, doc]);

  if (!open || !doc) return null;

  const currentRev = doc.revision ?? -1;
  const nextRev    = currentRev + 1;

  const handleSave = async () => {
    if (!date) { toast('Data é obrigatória.', 'error'); return; }
    setSaving(true);
    try {
      await api.post(`/documents/${doc.id}/revision`, { date, responsible });
      toast(`Revisão R${nextRev} criada com sucesso!`, 'success');
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
            ℹ️ Criando <strong>Revisão R{nextRev}</strong> de <strong style={{ fontFamily:'monospace' }}>{doc.base_code || doc.code}</strong>. O documento original é mantido.
          </div>

          {/* Campos bloqueados — informativo */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            <Field label="Código base"><input value={doc.base_code || doc.code} readOnly style={fLocked}/></Field>
            <Field label="Revisão"><input value={`R${nextRev}`} readOnly style={{ ...fLocked, background:'#EFF6FF', color:'#1D4ED8', fontWeight:700 }}/></Field>
            <Field label="Título"><input value={doc.subject} readOnly style={fLocked} title={doc.subject}/></Field>
          </div>

          {/* Só estes dois são editáveis */}
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

/* ─── DocModal — criar / editar ─────────────────────────────────────────────── */
function DocModal({ open, onClose, onSaved, doc, nextSeq, allUsers }) {
  const { toast } = useToast();
  const isEdit    = !!doc;

  const initForm = () => ({
    type:            doc?.type  || '',
    area:            doc?.area  || 'ENG',
    sequence_number: doc?.sequence_number ?? nextSeq ?? '',
    year:            doc?.year  ?? CURRENT_YEAR_SHORT,
    revision:        doc?.revision !== null && doc?.revision !== undefined ? doc.revision : '',
    plant:           doc?.plant || '',
    responsible:     doc?.responsible || '',
    date:            doc?.date ? doc.date.slice(0,10) : new Date().toISOString().slice(0,10),
    subject:         doc?.subject || '',
    status:          doc?.status || 'Em elaboração',
    document_link:   doc?.document_link || '',
    notes:           doc?.notes || '',
    author_ids:      doc?.authors?.map(a => a.id) || [],
  });

  const [form, setForm]   = useState(initForm);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setForm(initForm()); }, [open, doc, nextSeq]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const toggleAuthor = (id) => setForm(p => ({
    ...p,
    author_ids: p.author_ids.includes(id) ? p.author_ids.filter(x => x !== id) : [...p.author_ids, id],
  }));

  const preview = buildCode(form.type, form.area, form.sequence_number, form.year, form.revision);

  const handleSubmit = async () => {
    const missing = [];
    if (!form.type)        missing.push('Tipo de Documento');
    if (!form.area)        missing.push('Área');
    if (!form.responsible) missing.push('Responsável');
    if (!form.date)        missing.push('Data');
    if (!form.subject)     missing.push('Título do Documento');
    if (!form.status)      missing.push('Status');
    if (missing.length) { toast(`Campo obrigatório não preenchido: ${missing.join(', ')}`, 'error', 4500); return; }

    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/documents/${doc.id}`, form);
        toast('Documento atualizado com sucesso!', 'success');
      } else {
        await api.post('/documents', form);
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
          <span className="modal-title">{isEdit ? '✏️ Editar Documento' : '📄 Novo Documento'}</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.7)', fontSize:'1.1rem' }}>✕</button>
        </div>
        <div className="modal-body" style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:12 }}>

          {/* Preview do código */}
          <div style={{ background:'#F8FAFC', border:'1px solid #E2E8F0', borderRadius:8, padding:'9px 14px', display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', color:'#94A3B8', whiteSpace:'nowrap' }}>Código gerado:</span>
            <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:'1rem', color: preview?'#001F5B':'#CBD5E1' }}>{preview || 'Preencha os campos abaixo'}</span>
          </div>

          {/* Tipo + Área — bloqueados em edição */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="Tipo de Documento" required>
              <select value={form.type} onChange={e => set('type', e.target.value)}
                style={isEdit ? fLocked : fS} disabled={isEdit}>
                <option value="">— Selecionar —</option>
                {DOC_TYPES.map(o => <option key={o.value} value={o.value}>{o.value} — {o.label}</option>)}
              </select>
            </Field>
            <Field label="Área" required>
              <select value={form.area} onChange={e => set('area', e.target.value)}
                style={isEdit ? fLocked : fS} disabled={isEdit}>
                {AREAS.map(o => <option key={o.value} value={o.value}>{o.value} — {o.label}</option>)}
              </select>
            </Field>
          </div>

          {/* Nº + Ano + Revisão — todos bloqueados em edição */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
            <Field label="Nº Sequencial">
              <input value={form.sequence_number} readOnly style={fLocked}/>
            </Field>
            <Field label="Ano (2 dígitos)" required>
              <input type="number" value={form.year} onChange={e => set('year', e.target.value)}
                min={0} max={99} style={isEdit ? fLocked : fS} readOnly={isEdit}/>
            </Field>
            <Field label="Revisão">
              <input type="number" value={form.revision} onChange={e => set('revision', e.target.value)}
                min={0} placeholder="Sem rev." style={isEdit ? fLocked : fS} readOnly={isEdit}/>
            </Field>
          </div>

          {/* Usina + Responsável + Data */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
            <Field label="Usina">
              <select value={form.plant} onChange={e => set('plant', e.target.value)} style={fS}>
                <option value="">— Selecionar —</option>
                {ALL_PLANTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Responsável" required>
              <select value={form.responsible} onChange={e => set('responsible', e.target.value)} style={fS}>
                <option value="">— Selecionar —</option>
                {allUsers.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
              </select>
            </Field>
            <Field label="Data" required>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={fS}/>
            </Field>
          </div>

          {/* Título */}
          <Field label="Título do Documento" required>
            <textarea value={form.subject} onChange={e => set('subject', e.target.value)}
              rows={2} style={{ ...fS, resize:'vertical' }}/>
          </Field>

          {/* Status */}
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
                  userSelect:'none',
                }}>
                  <input type="radio" name="doc_status" value={s.value} checked={form.status===s.value}
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
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={2} placeholder="Informações adicionais..." style={{ ...fS, resize:'vertical' }}/>
          </Field>

          {/* Autores / Participantes */}
          <Field label="Autores / Participantes">
            <div style={{ border:'1.5px solid #E2E8F0', borderRadius:8, padding:'8px 10px', display:'flex', flexWrap:'wrap', gap:6, maxHeight:120, overflowY:'auto' }}>
              {allUsers.map(u => {
                const selected = form.author_ids.includes(u.id);
                return (
                  <button key={u.id} type="button" onClick={() => toggleAuthor(u.id)} style={{
                    padding:'4px 10px', borderRadius:20, fontSize:'0.75rem', cursor:'pointer',
                    border:`1.5px solid ${selected ? '#0066B3' : '#E2E8F0'}`,
                    background: selected ? '#EFF6FF' : '#F8FAFC',
                    color: selected ? '#0066B3' : '#64748B',
                    fontWeight: selected ? 700 : 400,
                    transition:'all 0.1s',
                  }}>
                    {selected ? '✓ ' : ''}{u.name}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize:'0.68rem', color:'#94A3B8', marginTop:2 }}>Todos os autores podem editar, subir revisão e alterar status.</div>
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

/* ─── VBarChart ──────────────────────────────────────────────────────────────── */
// Tons de azul CTG para as barras de usina
const PLANT_BLUES = [
  '#001F5B','#003A8C','#0050B3','#0066B3','#0070CC',
  '#0082E6','#0091EA','#00AEEF','#29BAF0','#64CCF4',
  '#97DDF7','#BFECFA','#D6F4FF','#E8F8FF',
];

function VBarChart({ data, title, activeFilter, onFilter }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const visible = data.filter(d => d.value > 0);
  const clickable = !!onFilter;
  // Altura da barra área: 100px fixo, sem scroll — barras se adaptam à largura disponível
  return (
    <div style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:10, padding:'14px 16px', flex:1, minWidth:0, width:'100%' }}>
      <div style={{ fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#94A3B8', marginBottom:10 }}>{title}</div>
      {visible.length === 0
        ? <div style={{ fontSize:'0.78rem', color:'#CBD5E1', textAlign:'center', padding:'16px 0' }}>Sem dados</div>
        : <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:120, overflow:'hidden' }}>
            {visible.map((d,i) => {
              const isActive = activeFilter === d.filterKey;
              return (
                <div key={i} 
                  onClick={() => clickable && onFilter(isActive ? '' : d.filterKey)}
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
                    width:'100%', marginTop:5, lineHeight:1,
                    letterSpacing:'0.02em',
                  }}>{d.label}</div>
                </div>
              );
            })}
          </div>
      }
    </div>
  );
}

function generateHTMLReport(docs, stats, year) {
  const now      = new Date().toLocaleDateString('pt-BR', { day:'2-digit', month:'long', year:'numeric' });
  const yearDocs = docs.filter(d => d.year === (year % 100));
  const statusRows = STATUSES.map(s => {
    const count = docs.filter(d => d.status === s.value).length;
    return `<tr><td>${s.value}</td><td style="text-align:center;font-weight:700;color:${s.color}">${count}</td></tr>`;
  }).join('');
  const typeRows = DOC_TYPES.map(t => {
    const count = docs.filter(d => d.type === t.value).length;
    if (!count) return '';
    return `<tr><td>${t.value}</td><td>${t.label}</td><td style="text-align:center;font-weight:700">${count}</td></tr>`;
  }).filter(Boolean).join('');
  const docRows = yearDocs.map((d, i) => {
    const sm   = STATUS_META[d.status] || {};
    const link = d.document_link ? `<a href="${d.document_link}" style="color:#0066B3;text-decoration:none">Acessar</a>` : '—';
    return `<tr style="background:${i%2===0?'#fff':'#F8FAFC'}">
      <td style="font-family:monospace;font-size:0.82rem;font-weight:700;color:#001F5B">${d.code}</td>
      <td>${d.plant||'—'}</td><td>${d.responsible}</td><td>${fmtDateBR(d.date)}</td>
      <td>${d.subject}</td>
      <td><span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:700;background:${sm.bg};color:${sm.text};border:1px solid ${sm.color}33">${d.status}</span></td>
      <td style="text-align:center">${link}</td></tr>`;
  }).join('');
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatório de Documentação — CTG Brasil ${year}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1E293B;background:#F8FAFC}.page{max-width:1200px;margin:0 auto;padding:32px 24px}.header{padding:24px 28px;background:#001F5B;color:#fff;border-radius:12px;margin-bottom:28px}.header h1{font-size:1.4rem;font-weight:700}.header .sub{font-size:0.85rem;opacity:.7;margin-top:4px}.section{margin-bottom:28px}.section h2{font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#64748B;margin-bottom:14px;padding-bottom:6px;border-bottom:2px solid #E2E8F0}.stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px}.stat-card{background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:16px;border-top:3px solid #0066B3}.stat-card .num{font-size:2rem;font-weight:700;color:#0066B3;line-height:1}.stat-card .lbl{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94A3B8;margin-bottom:6px}table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E2E8F0;font-size:.83rem}th{background:#001F5B;color:#fff;padding:10px 12px;text-align:left;font-size:.72rem;text-transform:uppercase;letter-spacing:.06em}td{padding:9px 12px;border-bottom:1px solid #F1F5F9}.tables-row{display:grid;grid-template-columns:1fr 1fr;gap:20px}.footer{text-align:center;font-size:.72rem;color:#94A3B8;margin-top:32px;padding-top:16px;border-top:1px solid #E2E8F0}@media print{body{background:#fff}.page{padding:20px}}</style>
</head><body><div class="page">
  <div class="header"><div class="sub">CTG Brasil — Engenharia de Manutenção</div><h1>Relatório de Controle de Documentação</h1><div class="sub">Gerado em ${now} · Total: ${docs.length} documentos</div></div>
  <div class="section"><h2>Resumo Geral</h2><div class="stats-grid">
    <div class="stat-card"><div class="lbl">Total Geral</div><div class="num">${docs.length}</div></div>
    <div class="stat-card" style="border-top-color:#10B981"><div class="lbl">Publicados</div><div class="num" style="color:#10B981">${docs.filter(d=>d.status==='Publicado').length}</div></div>
    <div class="stat-card" style="border-top-color:#F59E0B"><div class="lbl">Em Elaboração</div><div class="num" style="color:#F59E0B">${docs.filter(d=>d.status==='Em elaboração').length}</div></div>
    <div class="stat-card" style="border-top-color:#3B82F6"><div class="lbl">Para Aprovação</div><div class="num" style="color:#3B82F6">${docs.filter(d=>d.status==='Para aprovação').length}</div></div>
    <div class="stat-card" style="border-top-color:#EF4444"><div class="lbl">Pub. sem Link</div><div class="num" style="color:#EF4444">${stats?.published_without_link??0}</div></div>
    <div class="stat-card" style="border-top-color:#8B5CF6"><div class="lbl">Ano ${year}</div><div class="num" style="color:#8B5CF6">${yearDocs.length}</div></div>
  </div></div>
  <div class="tables-row section">
    <div><h2>Documentos por Tipo</h2><table><thead><tr><th>Sigla</th><th>Tipo</th><th>Qtd</th></tr></thead><tbody>${typeRows}</tbody></table></div>
    <div><h2>Documentos por Status</h2><table><thead><tr><th>Status</th><th>Qtd</th></tr></thead><tbody>${statusRows}</tbody></table></div>
  </div>
  <div class="section"><h2>Lista de Documentos — ${year}</h2>
    <table><thead><tr><th>Código</th><th>Usina</th><th>Responsável</th><th>Data</th><th>Título do Documento</th><th>Status</th><th>Link</th></tr></thead><tbody>${docRows}</tbody></table>
  </div>
  <div class="footer">CTG Brasil · CTG.Engenharia · Gerado em ${now}</div>
</div></body></html>`;
}

/* ─── User resolution helpers ────────────────────────────────────────────────── */
function _normName(str) {
  return (str || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
const _ALIASES = {
  'fabricio issao niiyama':       'fabricio niiyama',
  'juliano nicolielo torres':     'juliano torres',
  'rodrigo hernandes alves':      'rodrigo hernandes',
  'leonardo seiji watanabe':      'leonardo watanabe',
  'helio henrique dias':          'helio dias',
  'yuri moura santos':            'yuri moura',
  'ricardo passalacqua':          'ricardo passalaqua',
  'maurilio faria morais':        'maurilio faria',
  'julio lima casagrande':        'julio casagrande',
  'leonardo lino leoncini':       'leonardo leoncini',
  'jean rafael mendes':           'jean mendes',
  'marcos hiroshi kadota':        'marcos kadota',
  'victor henrique pedraci':      'victor pedraci',
  'hallyson izidoro dos santos':  'hallyson izidoro',
  'itamar rodrigo barros':        'itamar barros',
  'marcel chuma cerbantes':       'marcel cerbantes',
  'roberto cabral lara':          'roberto lara',
  'everton nascimento da silva':  'everton nascimento',
  'tadayuki juliano takamiya':    'juliano takamiya',
  'alexsson procopio dos santos': 'alexsson santos',
};
function _resolveUser(name, allUsers) {
  const norm = _normName(name);
  if (!norm) return null;
  let u = allUsers.find(x => _normName(x.name) === norm);
  if (u) return u;
  const alias = _ALIASES[norm];
  if (alias) u = allUsers.find(x => _normName(x.name) === alias);
  return u || null;
}

/* ─── ImportDocxModal — importar NUMERAÇÃO DE DOCUMENTOS .docx ──────────────── */
function ImportDocxModal({ open, onClose, onImported, allUsers }) {
  const { toast } = useToast();
  const inputRef  = useRef(null);
  const [file, setFile]             = useState(null);
  const [parsing, setParsing]       = useState(false);
  const [preview, setPreview]       = useState([]);
  const [unresolvedNames, setUnresolvedNames] = useState([]);
  const [userMappings, setUserMappings]       = useState({});
  const [importing, setImporting]   = useState(false);
  const [result, setResult]         = useState(null);

  useEffect(() => {
    if (!open) { setFile(null); setPreview([]); setResult(null); setUnresolvedNames([]); setUserMappings({}); }
  }, [open]);

  if (!open) return null;

  const parseCode = (raw) => {
    if (!raw) return null;
    const m = raw.trim().match(/^([A-Z]{2,5})-([A-Z]{2,4})-(\d+)-(\d+)(?:-R(\d+))?$/);
    if (!m) return null;
    return {
      type: m[1], area: m[2],
      sequence_number: parseInt(m[3], 10),
      year: parseInt(m[4], 10),
      revision: m[5] !== undefined ? parseInt(m[5], 10) : null,
      code: raw.trim(),
    };
  };

  const parseIsoDate = (raw) => {
    if (!raw) return null;
    const parts = raw.split('/');
    if (parts.length === 3) {
      const [d, mo, y] = parts;
      const fullY = y.length === 2 ? `20${y}` : y;
      return `${fullY}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    return null;
  };

  const handleFile = async (f) => {
    if (!f) return;
    setFile(f);
    setParsing(true);
    setPreview([]); setResult(null); setUnresolvedNames([]); setUserMappings({});
    try {
      const buf = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload  = () => res(r.result);
        r.onerror = rej;
        r.readAsArrayBuffer(f);
      });
      const { value: html } = await mammoth.convertToHtml({ arrayBuffer: buf });
      if (!html) { toast('Não foi possível ler o arquivo .docx.', 'error'); setParsing(false); return; }

      const doc = new DOMParser().parseFromString(html, 'text/html');
      const rows = [];

      doc.querySelectorAll('table').forEach(table => {
        const trs = [...table.querySelectorAll('tr')];
        if (trs.length < 2) return;

        // Detect column indices from header row
        const headerCells = [...trs[0].querySelectorAll('th, td')]
          .map(c => _normName(c.textContent));

        const colIdx = {
          code:        headerCells.findIndex(h => /^cod|^n[°º]/.test(h) || h.includes('codigo') || h.includes('documento')),
          responsible: headerCells.findIndex(h => /respons/.test(h)),
          date:        headerCells.findIndex(h => h === 'data' || h.startsWith('data ')),
          subject:     headerCells.findIndex(h => /assunto|titulo|descri/.test(h)),
          plant:       headerCells.findIndex(h => /usina|planta/.test(h)),
          status:      headerCells.findIndex(h => /status|situac/.test(h)),
        };

        // Fallback to positional mapping if headers not found
        const useHeaders = Object.values(colIdx).some(v => v >= 0);

        trs.forEach((tr, ti) => {
          if (ti === 0) return; // skip header
          const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
          if (cells.length < 2) return;

          const get = (key, fallback) => {
            const idx = colIdx[key];
            return (useHeaders && idx >= 0 && cells[idx]) ? cells[idx] : (cells[fallback] || '');
          };

          // Find code — try detected column first, then scan all cells
          let codeRaw = get('code', 0);
          let parsed  = parseCode(codeRaw);
          if (!parsed) {
            for (const c of cells) { parsed = parseCode(c); if (parsed) { codeRaw = c; break; } }
          }
          if (!parsed) return;

          const responsible = get('responsible', 1);
          const rawDate     = get('date', 2);
          const subject     = get('subject', 3);
          const plant       = get('plant', -1);
          const statusRaw   = get('status', -1).toLowerCase();

          let status = 'Em elaboração';
          if (/publicad/.test(statusRaw))           status = 'Publicado';
          else if (/aprova/.test(statusRaw))         status = 'Para aprovação';
          else if (/cancelad/.test(statusRaw))       status = 'Cancelado';

          rows.push({
            ...parsed,
            _originalResponsible: responsible,
            responsible,
            date: parseIsoDate(rawDate) || new Date().toISOString().slice(0, 10),
            subject,
            plant: plant || null,
            status,
          });
        });
      });

      if (rows.length === 0) { toast('Nenhuma linha válida encontrada no documento.', 'error'); setParsing(false); return; }

      // Resolve responsible names against system users
      const resolved = rows.map(row => {
        const u = _resolveUser(row._originalResponsible, allUsers || []);
        return { ...row, _resolved: !!u, responsible: u ? u.name : row._originalResponsible };
      });

      const unresolved = [...new Set(resolved.filter(r => !r._resolved && r._originalResponsible).map(r => r._originalResponsible))];
      setPreview(resolved);
      setUnresolvedNames(unresolved);
    } catch (err) {
      console.error(err);
      toast('Erro ao processar o arquivo.', 'error');
    } finally { setParsing(false); }
  };

  const handleImport = async () => {
    if (preview.length === 0) return;
    setImporting(true);
    try {
      const documents = preview.map(r => {
        let { responsible } = r;
        if (!r._resolved && userMappings[r._originalResponsible]) {
          const uid = userMappings[r._originalResponsible];
          const u = (allUsers || []).find(x => x.id === uid);
          if (u) responsible = u.name;
        }
        return {
          type: r.type, area: r.area, sequence_number: r.sequence_number,
          year: r.year, revision: r.revision, code: r.code,
          plant: r.plant || null, responsible, date: r.date,
          subject: r.subject, status: r.status,
        };
      });
      const res = await api.post('/documents/import-bulk', { documents });
      setResult(res.data);
      toast(`Importação concluída: ${res.data.created} criados, ${res.data.updated} atualizados.`, 'success');
      onImported();
    } catch (err) {
      toast(err.response?.data?.error || 'Erro ao importar.', 'error');
    } finally { setImporting(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 780, width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <span className="modal-title">📥 Importar Numeração (.docx)</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontSize: '1.1rem' }}>✕</button>
        </div>
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Instruções */}
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 14px', fontSize: '0.8rem', color: '#1D4ED8', lineHeight: 1.6 }}>
            ℹ️ Selecione o arquivo <strong>NUMERAÇÃO DE DOCUMENTOS .docx</strong>. Colunas detectadas automaticamente por cabeçalho. Responsáveis são correlacionados com os usuários do sistema.
          </div>

          {/* Drop zone */}
          {!file && (
            <div
              onClick={() => inputRef.current?.click()}
              style={{ border: '2px dashed #CBD5E1', borderRadius: 10, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', color: '#94A3B8', transition: 'border-color 0.15s' }}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#0066B3'; }}
              onDragLeave={e => { e.currentTarget.style.borderColor = '#CBD5E1'; }}
              onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#CBD5E1'; handleFile(e.dataTransfer.files[0]); }}
            >
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>📄</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>Clique ou arraste o arquivo .docx aqui</div>
              <div style={{ fontSize: '0.75rem', marginTop: 4 }}>Apenas arquivos .docx são suportados</div>
              <input ref={inputRef} type="file" accept=".docx" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])}/>
            </div>
          )}

          {/* Parsing */}
          {parsing && (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748B' }}>
              <div className="spinner" style={{ margin: '0 auto 10px' }}/> Processando arquivo...
            </div>
          )}

          {/* Unresolved users — seleção manual */}
          {preview.length > 0 && !result && unresolvedNames.length > 0 && (
            <div>
              <div style={{ background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }}>
                <div style={{ fontSize: '0.82rem', color: '#92400E', fontWeight: 700 }}>
                  ⚠️ {unresolvedNames.length} responsável(is) não encontrado(s) — selecione manualmente:
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {unresolvedNames.map(name => (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#FFFBEB', borderRadius: 8, border: '1px solid #FDE68A' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#92400E' }}>{name}</span>
                      <span style={{ fontSize: '0.68rem', color: '#B45309', marginLeft: 6 }}>
                        ({preview.filter(r => r._originalResponsible === name).length} doc{preview.filter(r => r._originalResponsible === name).length !== 1 ? 's' : ''})
                      </span>
                    </div>
                    <select
                      value={userMappings[name] || ''}
                      onChange={e => setUserMappings(prev => ({ ...prev, [name]: e.target.value ? parseInt(e.target.value) : null }))}
                      style={{ padding: '6px 10px', border: '1.5px solid #E2E8F0', borderRadius: 6, fontSize: '0.8rem', fontFamily: 'var(--font-body)', color: '#1E293B', background: '#fff', flexShrink: 0, minWidth: 200 }}
                    >
                      <option value="">— Não associar —</option>
                      {(allUsers || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview table */}
          {preview.length > 0 && !result && (
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748B', marginBottom: 8 }}>
                {preview.length} registros encontrados —
                <span style={{ color: '#10B981', marginLeft: 6 }}>✓ {preview.filter(r => r._resolved).length} correlacionados</span>
                {unresolvedNames.length > 0 && <span style={{ color: '#F59E0B', marginLeft: 6 }}>⚠ {unresolvedNames.length} sem correlação</span>}
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: 8, maxHeight: 260, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ background: '#001F5B', position: 'sticky', top: 0 }}>
                      {['Código', 'Responsável', 'Data', 'Assunto', 'Status'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#fff', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#F8FAFC', borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '7px 10px', fontFamily: 'monospace', fontWeight: 700, color: '#001F5B', whiteSpace: 'nowrap' }}>{r.code}</td>
                        <td style={{ padding: '7px 10px', color: r._resolved ? '#065F46' : '#92400E' }}>
                          {r.responsible || '—'}
                          {r._resolved && <span style={{ marginLeft: 4, fontSize: '0.65rem', color: '#10B981' }}>✓</span>}
                        </td>
                        <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{fmtDateBR(r.date)}</td>
                        <td style={{ padding: '7px 10px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.subject}</td>
                        <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', fontSize: '0.7rem', color: '#64748B' }}>{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Resultado */}
          {result && (
            <div style={{ background: '#D1FAE5', border: '1px solid #6EE7B7', borderRadius: 8, padding: '14px 16px' }}>
              <div style={{ fontWeight: 700, color: '#065F46', marginBottom: 6 }}>✅ Importação concluída</div>
              <div style={{ fontSize: '0.82rem', color: '#064E3B', display: 'flex', gap: 16 }}>
                <span>✨ <strong>{result.created}</strong> criados</span>
                <span>🔄 <strong>{result.updated}</strong> atualizados</span>
                {result.errors > 0 && <span style={{ color: '#991B1B' }}>⚠️ <strong>{result.errors}</strong> erros</span>}
              </div>
            </div>
          )}

        </div>
        <div className="modal-footer" style={{ flexShrink: 0 }}>
          <button className="btn btn-secondary" onClick={onClose}>Fechar</button>
          {preview.length > 0 && !result && (
            <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
              {importing ? 'Importando...' : `📥 Importar ${preview.length} documentos`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────────── */
export default function DocumentsPage() {
  const { user }    = useAuth();
  const { toast }   = useToast();

  const [docs, setDocs]         = useState([]);
  const [stats, setStats]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [allUsers, setAllUsers]           = useState([]);
  const [activeDelegations, setActiveDelegations] = useState([]); // delegações recebidas ativas

  // Modals
  const [docModal, setDocModal]         = useState({ open:false, doc:null });
  const [statusModal, setStatusModal]   = useState({ open:false, doc:null });
  const [revModal, setRevModal]         = useState({ open:false, doc:null });

  const [nextSeq, setNextSeq]           = useState(null);
  const [yearFilter, setYearFilter]     = useState(0);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter]     = useState('');
  const [myDocsOnly, setMyDocsOnly]     = useState(false);
  const [plantFilter, setPlantFilter]   = useState('');
  const [expandedGroup, setExpandedGroup] = useState(null); // base_code
  const [expandedDoc, setExpandedDoc]   = useState(null);   // doc.id
  const [importDocxModal, setImportDocxModal] = useState(false);

  // Column filters
  const [colFilterCode, setColFilterCode] = useState([]);
  const [colFilterPlant, setColFilterPlant] = useState([]);
  const [colFilterResponsible, setColFilterResponsible] = useState([]);
  const [colFilterDate, setColFilterDate] = useState([]);
  const [colFilterSubject, setColFilterSubject] = useState([]);
  const [colFilterStatus, setColFilterStatus] = useState([]);

  // Chart click filters
  const [chartTypeFilter, setChartTypeFilter] = useState('');
  const [chartStatusFilter, setChartStatusFilter] = useState('');
  const [chartPlantFilter, setChartPlantFilter] = useState('');

  const SUPERIOR_ROLES = ['admin','gestor','planejador','coordenador'];
  const isSuperior = SUPERIOR_ROLES.includes(user?.role);

  // isOwner: o documento É do usuário — SOMENTE se for o responsável pelo nome
  // NÃO usa created_by nem authors (criar um doc para outra pessoa não te torna dono)
  const isOwner = (doc) => {
    if (!user?.name || !doc.responsible) return false;
    return doc.responsible.trim().toLowerCase() === user.name.trim().toLowerCase();
  };

  // canAct: pode editar/status/revisão = dono OU superior OU delegado ativo
  const canAct = (doc) => {
    if (isOwner(doc)) return true;
    if (isSuperior) return true;
    // Delegação: delegator_name corresponde ao responsável do doc
    if (activeDelegations.some(d =>
      d.delegator_name?.trim().toLowerCase() === doc.responsible?.trim().toLowerCase()
    )) return true;
    return false;
  };

  // Alias para compatibilidade com usos do isAuthor existentes no JSX
  const isAuthor = canAct;

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const params = yearFilter ? `?year=${yearFilter % 100}` : '';
      const [docsRes, statsRes] = await Promise.all([
        api.get(`/documents${params}`),
        api.get(`/documents/stats${params}`),
      ]);
      setDocs(Array.isArray(docsRes.data) ? docsRes.data : []);
      setStats(statsRes.data);
    } catch { toast('Erro ao carregar documentos.', 'error'); }
    finally { setLoading(false); }
  }, [yearFilter]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);
  useEffect(() => {
    api.get('/users/for-delegation').then(r => setAllUsers(r.data || [])).catch(() => {});
    // Carregar delegações ativas recebidas: documentos dos meus delegadores
    api.get('/delegations/active-to-me')
      .then(r => setActiveDelegations(r.data || []))
      .catch(() => {});
  }, []);

  const fetchNextSeq = async () => {
    try { const r = await api.get(`/documents/next-sequence?year=${CURRENT_YEAR_SHORT}`); setNextSeq(r.data.next); } catch {}
  };

  const exportHTML = useCallback(() => {
    const html = generateHTMLReport(docs, stats, CURRENT_YEAR);
    const blob = new Blob([html], { type:'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `CTG_Documentacao_${CURRENT_YEAR}.html`;
    a.click(); URL.revokeObjectURL(a.href);
    toast('Relatório HTML exportado!', 'success');
  }, [docs, stats, toast]);

  const exportExcel = useCallback(async () => {
    try {
      const base = import.meta.env.VITE_API_URL || '/api';
      const yearParam = yearFilter ? `?year=${yearFilter % 100}` : '';
      const res = await fetch(`${base}/export/documents${yearParam}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Falha na exportação');
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const yearLabel = yearFilter || CURRENT_YEAR;
      link.download = `CTG_Documentos_${yearLabel}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast('Excel exportado com sucesso!', 'success');
    } catch (err) {
      console.error(err);
      toast('Erro ao exportar Excel.', 'error');
    }
  }, [yearFilter, toast]);

  useEffect(() => {
    window._exportDocumentsExcel = exportExcel;
    window._exportDocumentsHTML  = exportHTML;
    const onImport = () => setImportDocxModal(true);
    window.addEventListener('import-documents-docx', onImport);
    return () => {
      delete window._exportDocumentsExcel;
      delete window._exportDocumentsHTML;
      window.removeEventListener('import-documents-docx', onImport);
    };
  }, [exportExcel, exportHTML]);

  const openNew  = () => { fetchNextSeq(); setDocModal({ open:true, doc:null }); };
  const openEdit = (doc) => setDocModal({ open:true, doc });

  // Filtro "Meus docs" — filtra onde o usuário é autor (consta em doc.authors)
  const filtered = useMemo(() => {
    let data = [...docs];
    if (myDocsOnly) {
      // "Meus" = SOMENTE sou o responsável pelo nome
      data = data.filter(d => {
        if (!user?.name || !d.responsible) return false;
        return d.responsible.trim().toLowerCase() === user.name.trim().toLowerCase();
      });
    }
    if (statusFilter && data.some(d => d.status === statusFilter)) {
      data = data.filter(d => d.status === statusFilter);
    }
    if (typeFilter) {
      data = data.filter(d => d.type === typeFilter);
    }
    if (plantFilter) {
      data = data.filter(d => d.plant === plantFilter);
    }
    // Chart click filters
    if (chartTypeFilter) {
      data = data.filter(d => d.type === chartTypeFilter);
    }
    if (chartStatusFilter) {
      data = data.filter(d => d.status === chartStatusFilter);
    }
    if (chartPlantFilter) {
      data = data.filter(d => d.plant === chartPlantFilter);
    }
    // Column filters
    if (colFilterCode.length > 0) {
      data = data.filter(d => colFilterCode.includes(d.code));
    }
    if (colFilterPlant.length > 0) {
      data = data.filter(d => colFilterPlant.includes(d.plant || '—'));
    }
    if (colFilterResponsible.length > 0) {
      data = data.filter(d => colFilterResponsible.includes(d.responsible));
    }
    if (colFilterDate.length > 0) {
      data = data.filter(d => colFilterDate.includes(fmtDateBR(d.date)));
    }
    if (colFilterSubject.length > 0) {
      data = data.filter(d => colFilterSubject.includes(d.subject || '—'));
    }
    if (colFilterStatus.length > 0) {
      data = data.filter(d => colFilterStatus.includes(d.status));
    }
    const q = search.toLowerCase();
    if (q) {
      data = data.filter(d =>
        (d.code||'').toLowerCase().includes(q)
        || (d.responsible||'').toLowerCase().includes(q)
        || (d.subject||'').toLowerCase().includes(q)
        || (d.plant||'').toLowerCase().includes(q)
        || (d.authors||[]).some(a => a.name.toLowerCase().includes(q))
      );
    }
    return data;
  }, [docs, statusFilter, typeFilter, plantFilter, search, myDocsOnly, user, colFilterCode, colFilterPlant, colFilterResponsible, colFilterDate, colFilterSubject, colFilterStatus, chartTypeFilter, chartStatusFilter, chartPlantFilter]);

  // Agrupar por base_code — normalizar: CTA-PRD-002-26-R0 → CTA-PRD-002-26
  const normalizeBaseCode = (doc) => {
    if (doc.base_code) return doc.base_code;
    // Derivar base_code do code: remover sufixo -R{n}
    return (doc.code || '').replace(/-R\d+$/, '');
  };

  const groups = useMemo(() => {
    const map = new Map();
    filtered.forEach(d => {
      const key = normalizeBaseCode(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(d);
    });
    // Ordenar revisões dentro de cada grupo: sem revisão primeiro, depois R0, R1...
    map.forEach((arr, key) => {
      arr.sort((a, b) => {
        const ra = a.revision ?? -1;
        const rb = b.revision ?? -1;
        return rb - ra; // mais recente no topo
      });
    });
    return Array.from(map.entries()).map(([key, items]) => ({ key, items, latest: items[0] }));
  }, [filtered]);

  /* KPIs */
  const totalAll  = docs.length;
  const published = docs.filter(d => d.status==='Publicado').length;
  const inProg    = docs.filter(d => d.status==='Em elaboração').length;
  const pubNoLink = stats?.published_without_link ?? 0;
  const activeYear = yearFilter ? (yearFilter % 100) : CURRENT_YEAR_SHORT;
  const activeYearFull = yearFilter || CURRENT_YEAR;
  const yearDocs  = docs.filter(d => d.year === activeYear).length;
  const myDocsCount = docs.filter(d =>
    user?.name && d.responsible &&
    d.responsible.trim().toLowerCase() === user.name.trim().toLowerCase()
  ).length;

  /* Charts */
  const TYPE_COLORS = ['#0066B3','#0891B2','#10B981','#8B5CF6','#F59E0B','#EF4444','#6366F1','#EC4899','#14B8A6'];
  const typeChartData   = DOC_TYPES.map((t,i) => ({ label:t.value, value:docs.filter(d=>d.type===t.value).length, color:TYPE_COLORS[i%TYPE_COLORS.length], filterKey: t.value }));
  const statusChartData = STATUSES.map(s => ({ label:s.value, value:docs.filter(d=>d.status===s.value).length, color:s.color, filterKey: s.value }));
  const plantChartData  = ALL_PLANTS.map(p => ({ label: PLANT_SIGLAS[p] || p, fullName: p, value:docs.filter(d=>d.plant===p).length, color:'#0066B3', filterKey: p })).filter(d=>d.value>0);
  const years = [...new Set(docs.map(d=>2000+d.year))].sort((a,b)=>b-a);
  const plantsUsed = ALL_PLANTS.filter(p => docs.some(d => d.plant === p));

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16, padding:'0 2px' }}>

      {/* KPI Cards */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
        <StatCard label="Total Geral"           value={totalAll}    color="#001F5B"/>
        <StatCard label={`Ano ${activeYearFull}`} value={yearDocs}    color="#0066B3" sub={`de ${totalAll} total`}/>
        <StatCard label="Publicados"            value={published}   color="#10B981"/>
        <StatCard label="Em Elaboração"         value={inProg}      color="#F59E0B"/>
        <StatCard label="Pub. sem link"         value={pubNoLink}   color={pubNoLink>0?'#EF4444':'#94A3B8'} sub={pubNoLink>0?'Atenção':'Tudo ok'}/>
        <StatCard label="Meus documentos"       value={myDocsCount} color="#8B5CF6"/>
      </div>

      {/* Charts */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'stretch', position:'relative' }}>
        <div style={{ flex:'1 1 180px', minWidth:160, display:'flex' }}>
          <HBarChart  
            title="Documentos por Tipo"    
            data={typeChartData}
            activeFilter={chartTypeFilter}
            onFilter={(key) => {
              setChartTypeFilter(key);
              // Clear other chart filters
              if (key) {
                setChartStatusFilter('');
                setChartPlantFilter('');
              }
            }}
          />
        </div>
        <div style={{ flex:'2 1 320px', minWidth:220, display:'flex' }}>
          <VBarChart  
            title="Documentos por Usina"   
            data={plantChartData}
            activeFilter={chartPlantFilter}
            onFilter={(key) => {
              setChartPlantFilter(key);
              // Clear other chart filters
              if (key) {
                setChartTypeFilter('');
                setChartStatusFilter('');
              }
            }}
          />
        </div>
        <div style={{ flex:'1 1 180px', minWidth:160, display:'flex' }}>
          <DonutChart 
            title="Status dos Documentos"  
            data={statusChartData}
            activeFilter={chartStatusFilter}
            onFilter={(key) => {
              setChartStatusFilter(key);
              // Clear other chart filters
              if (key) {
                setChartTypeFilter('');
                setChartPlantFilter('');
              }
            }}
          />
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <button onClick={openNew} style={{
          display:'flex', alignItems:'center', gap:6, padding:'8px 16px',
          border:'none', borderRadius:8, background:'#001F5B',
          fontSize:'0.8rem', fontWeight:700, cursor:'pointer', color:'#fff', flexShrink:0,
        }}>+ Novo Documento</button>

        {/* Filtro Meus docs — destacado */}
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

        <div style={{ display:'flex', gap:6, alignItems:'center', flex:1, background:'#fff', border:'1px solid #E2E8F0', borderRadius:8, padding:'7px 12px', minWidth:0 }}>
          <span style={{ color:'#94A3B8', fontSize:'0.85rem', flexShrink:0 }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar código, responsável, título, autor..."
            style={{ flex:1, border:'none', outline:'none', fontSize:'0.82rem', fontFamily:'var(--font-body)', color:'#1E293B', background:'transparent', minWidth:0 }}/>
          {search && <button onClick={() => setSearch('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#94A3B8', flexShrink:0 }}>✕</button>}
          <Div/>
          <select value={yearFilter} onChange={e => setYearFilter(parseInt(e.target.value))} style={selStyle(!!yearFilter)}>
            <option value={0}>Todos os anos</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <Div/>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selStyle(!!typeFilter)}>
            <option value="">Todos os tipos</option>
            {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.value}</option>)}
          </select>
          <Div/>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selStyle(!!statusFilter)}>
            <option value="">Todos os status</option>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.value}</option>)}
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
              {myDocsOnly ? 'Você não é autor de nenhum documento' : 'Nenhum documento encontrado'}
            </div>
            <button onClick={openNew} style={{ marginTop:12, padding:'8px 18px', border:'none', borderRadius:8, background:'#001F5B', color:'#fff', fontSize:'0.82rem', fontWeight:700, cursor:'pointer' }}>+ Registrar Documento</button>
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead style={{ position:'sticky', top:0, zIndex:2 }}>
              <tr style={{ background:'#001F5B' }}>
                <th style={TH}>
                  <div style={{ display:'flex', alignItems:'center' }}>
                    Código
                    <ColumnFilterDropdown
                      column="Código"
                      uniqueValues={[...new Set(docs.map(d => d.code).filter(Boolean))]}
                      selectedValues={colFilterCode}
                      onChange={setColFilterCode}
                    />
                  </div>
                </th>
                <th style={TH}>
                  <div style={{ display:'flex', alignItems:'center' }}>
                    Usina
                    <ColumnFilterDropdown
                      column="Usina"
                      uniqueValues={[...new Set(docs.map(d => d.plant || '—').filter(Boolean))]}
                      selectedValues={colFilterPlant}
                      onChange={setColFilterPlant}
                    />
                  </div>
                </th>
                <th style={TH}>
                  <div style={{ display:'flex', alignItems:'center' }}>
                    Responsável
                    <ColumnFilterDropdown
                      column="Responsável"
                      uniqueValues={[...new Set(docs.map(d => d.responsible).filter(Boolean))]}
                      selectedValues={colFilterResponsible}
                      onChange={setColFilterResponsible}
                    />
                  </div>
                </th>
                <th style={TH}>
                  <div style={{ display:'flex', alignItems:'center' }}>
                    Data
                    <ColumnFilterDropdown
                      column="Data"
                      uniqueValues={[...new Set(docs.map(d => fmtDateBR(d.date)).filter(Boolean))]}
                      selectedValues={colFilterDate}
                      onChange={setColFilterDate}
                    />
                  </div>
                </th>
                <th style={TH}>
                  <div style={{ display:'flex', alignItems:'center' }}>
                    Título do Documento
                    <ColumnFilterDropdown
                      column="Título"
                      uniqueValues={[...new Set(docs.map(d => d.subject || '—').filter(Boolean))]}
                      selectedValues={colFilterSubject}
                      onChange={setColFilterSubject}
                    />
                  </div>
                </th>
                <th style={TH}>
                  <div style={{ display:'flex', alignItems:'center' }}>
                    Status
                    <ColumnFilterDropdown
                      column="Status"
                      uniqueValues={STATUSES.map(s => s.value)}
                      selectedValues={colFilterStatus}
                      onChange={setColFilterStatus}
                    />
                  </div>
                </th>
                <th style={TH}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(({ key, items, latest }) => {
                const hasRevisions = items.length > 1;
                const groupOpen    = expandedGroup === key;
                const isMine       = isOwner(latest);

                return (
                  <Fragment key={key}>
                    {/* ── Linha principal (revisão mais recente) ── */}
                    <tr
                      onClick={() => setExpandedDoc(expandedDoc===latest.id ? null : latest.id)}
                      style={{ background:'#fff', cursor:'pointer', borderBottom: expandedDoc===latest.id ? 'none' : '1px solid #F1F5F9' }}
                      onMouseEnter={e => e.currentTarget.style.background='#F0F9FF'}
                      onMouseLeave={e => e.currentTarget.style.background='#fff'}
                    >
                      <td style={TD}>
                        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                          {/* Botão de expandir revisões */}
                          {hasRevisions && (
                            <button onClick={e => { e.stopPropagation(); setExpandedGroup(groupOpen ? null : key); }}
                              title={groupOpen ? 'Recolher revisões' : `Ver ${items.length} versões deste documento`}
                              style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 9px', borderRadius:10,
                                border:`1.5px solid ${groupOpen?'#0066B3':'#CBD5E1'}`,
                                background: groupOpen?'#0066B3':'#F8FAFC',
                                color: groupOpen?'#fff':'#64748B',
                                fontSize:'0.65rem', fontWeight:700, cursor:'pointer', flexShrink:0,
                                transition:'all 0.15s',
                              }}>
                              <span style={{ fontSize:'0.6rem' }}>{groupOpen?'▲':'▼'}</span>
                              {items.length} {items.length===1?'versão':'versões'}
                            </button>
                          )}
                          <span style={{ fontFamily:'monospace', fontWeight:700, color:'#001F5B', fontSize:'0.82rem' }}>{latest.code}</span>
                          {isMine && <span style={{ fontSize:'0.6rem', background:'#F5F3FF', color:'#6D28D9', border:'1px solid #DDD6FE', borderRadius:10, padding:'1px 5px', fontWeight:700 }}>meu</span>}
                        </div>
                      </td>
                      <td style={{ ...TD, fontSize:'0.78rem', color:'#64748B' }}>{latest.plant||'—'}</td>
                      <td style={{ ...TD, fontSize:'0.82rem' }}>{latest.responsible}</td>
                      <td style={{ ...TD, fontSize:'0.82rem', whiteSpace:'nowrap' }}>{fmtDateBR(latest.date)}</td>
                      <td style={{ ...TD, fontSize:'0.82rem', maxWidth:240 }}>
                        <span style={{ display:'-webkit-box', WebkitLineClamp:1, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{latest.subject}</span>
                      </td>
                      <td style={TD}><StatusBadge status={latest.status}/></td>
                      <td style={{ ...TD }} onClick={e => e.stopPropagation()}>
                        <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                          {isAuthor(latest) && (
                            <>
                              <ActionBtn color="#8B5CF6" onClick={() => setRevModal({ open:true, doc:latest })} tooltip="Nova Revisão">🔄</ActionBtn>
                              <ActionBtn color="#0066B3" onClick={() => setStatusModal({ open:true, doc:latest })} tooltip="Alterar Status">🔖</ActionBtn>
                              <ActionBtn color="#475569" onClick={() => openEdit(latest)} tooltip="Editar Documento">✏️</ActionBtn>
                            </>
                          )}
                          {!isAuthor(latest) && isSuperior && (
                            <>
                              <ActionBtn color="#8B5CF6" onClick={() => setRevModal({ open:true, doc:latest })} tooltip="Nova Revisão">🔄</ActionBtn>
                              <ActionBtn color="#0066B3" onClick={() => setStatusModal({ open:true, doc:latest })} tooltip="Alterar Status">🔖</ActionBtn>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* ── Detalhe expandido do documento principal ── */}
                    {expandedDoc === latest.id && (
                      <tr style={{ background:'#F8FBFF', borderBottom:'1px solid #E2E8F0' }}>
                        <td colSpan={7} style={{ padding:'12px 16px' }}>
                          <DocDetail doc={latest} isAuthor={isAuthor(latest)}/>
                        </td>
                      </tr>
                    )}

                    {/* ── Revisões anteriores ── */}
                    {groupOpen && items.slice(1).map((rev, ri) => (
                      <Fragment key={rev.id}>
                        <tr
                          onClick={() => setExpandedDoc(expandedDoc===rev.id ? null : rev.id)}
                          style={{ background:'#FAFAFA', cursor:'pointer', borderBottom: expandedDoc===rev.id?'none':'1px solid #F1F5F9' }}
                          onMouseEnter={e => e.currentTarget.style.background='#F0F9FF'}
                          onMouseLeave={e => e.currentTarget.style.background='#FAFAFA'}
                        >
                          <td style={{ ...TD, paddingLeft:0 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:0 }}>
                              {/* Conector visual de árvore */}
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
                          <td style={{ ...TD, fontSize:'0.78rem', color:'#64748B' }}>{rev.responsible}</td>
                          <td style={{ ...TD, fontSize:'0.78rem', color:'#64748B', whiteSpace:'nowrap' }}>{fmtDateBR(rev.date)}</td>
                          <td style={{ ...TD, fontSize:'0.78rem', color:'#64748B', maxWidth:280 }}>
                            <span style={{ display:'-webkit-box', WebkitLineClamp:1, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{rev.subject}</span>
                          </td>
                          <td style={TD}><StatusBadge status={rev.status}/></td>
                          <td style={{ ...TD }} onClick={e => e.stopPropagation()}>
                            {isAuthor(rev) && (
                              <div style={{ display:'flex', gap:5 }}>
                                <ActionBtn color="#0066B3" onClick={() => setStatusModal({ open:true, doc:rev })} tooltip="Alterar Status">🔖</ActionBtn>
                                <ActionBtn color="#475569" onClick={() => openEdit(rev)} tooltip="Editar Documento">✏️</ActionBtn>
                              </div>
                            )}
                          </td>
                        </tr>
                        {expandedDoc === rev.id && (
                          <tr style={{ background:'#F8FBFF', borderBottom:'1px solid #E2E8F0' }}>
                            <td colSpan={7} style={{ padding:'12px 16px 12px 32px' }}>
                              <DocDetail doc={rev} isAuthor={isAuthor(rev)}/>
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
        )}
      </div>

      {/* Modals */}
      <DocModal
        open={docModal.open}
        onClose={() => setDocModal({ open:false, doc:null })}
        onSaved={fetchDocs}
        doc={docModal.doc}
        nextSeq={nextSeq}
        allUsers={allUsers}
      />
      <StatusModal
        open={statusModal.open}
        onClose={() => setStatusModal({ open:false, doc:null })}
        onSaved={fetchDocs}
        doc={statusModal.doc}
      />
      <RevisionModal
        open={revModal.open}
        onClose={() => setRevModal({ open:false, doc:null })}
        onSaved={fetchDocs}
        doc={revModal.doc}
        allUsers={allUsers}
      />
      <ImportDocxModal
        open={importDocxModal}
        onClose={() => setImportDocxModal(false)}
        onImported={fetchDocs}
        allUsers={allUsers}
      />
    </div>
  );
}

/* ─── DocDetail — painel expandido de um documento ──────────────────────────── */
function DocDetail({ doc, isAuthor }) {
  return (
    <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
      <div style={{ flex:1, minWidth:200 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:'10px 24px' }}>
          {doc.plant    && <InfoItem label="Usina"    value={doc.plant}/>}
          <InfoItem label="Tipo" value={`${doc.type} — ${TYPE_META[doc.type]?.label||''}`}/>
          <InfoItem label="Área" value={`${doc.area} — ${AREAS.find(a=>a.value===doc.area)?.label||doc.area}`}/>
          {doc.revision !== null && doc.revision !== undefined && <InfoItem label="Revisão" value={`R${doc.revision}`}/>}
          {doc.created_by_name && <InfoItem label="Criado por" value={doc.created_by_name}/>}
          {doc.authors?.length > 0 && (
            <InfoItem label="Autores" value={doc.authors.map(a=>a.name).join(', ')} full/>
          )}
          {doc.notes && <InfoItem label="Observações" value={doc.notes} full/>}
        </div>
        {doc.status === 'Publicado' && (
          <div style={{ marginTop:8 }}>
            {doc.document_link
              ? <a href={doc.document_link} target="_blank" rel="noopener noreferrer"
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
const TH = { padding:'10px 14px', textAlign:'left', fontSize:'0.68rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#fff' };
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
