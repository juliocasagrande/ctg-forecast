import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../utils/api.js';
import { useToast } from '../components/ui/Toast.jsx';

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
function HBarChart({ data, title }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const visible = data.filter(d => d.value > 0);
  return (
    <div style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:10, padding:'14px 16px', flex:1, minWidth:0 }}>
      <div style={{ fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#94A3B8', marginBottom:10 }}>{title}</div>
      {visible.length === 0 ? <div style={{ fontSize:'0.78rem', color:'#CBD5E1', textAlign:'center', padding:'16px 0' }}>Sem dados</div>
        : <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            {visible.map((d,i) => (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ fontSize:'0.68rem', color:'#475569', width:34, textAlign:'right', flexShrink:0, fontWeight:600 }}>{d.label}</div>
                <div style={{ flex:1, background:'#F1F5F9', borderRadius:4, height:14, overflow:'hidden' }}>
                  <div style={{ width:`${(d.value/max)*100}%`, height:'100%', background:d.color||'#0066B3', borderRadius:4 }} />
                </div>
                <div style={{ fontSize:'0.68rem', fontWeight:700, color:'#1E293B', width:20, flexShrink:0 }}>{d.value}</div>
              </div>
            ))}
          </div>}
    </div>
  );
}
function DonutChart({ data, title }) {
  const total = data.reduce((s,d) => s+d.value, 0);
  const r=32, cx=45, cy=45, circ=2*Math.PI*r;
  let off=0;
  const slices = data.filter(d=>d.value>0).map(d => { const dash=(d.value/total)*circ; const s={...d,dash,offset:off}; off+=dash; return s; });
  return (
    <div style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:10, padding:'14px 16px', flex:1, minWidth:0 }}>
      <div style={{ fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#94A3B8', marginBottom:10 }}>{title}</div>
      {total===0 ? <div style={{ fontSize:'0.78rem', color:'#CBD5E1', textAlign:'center', padding:'16px 0' }}>Sem dados</div>
        : <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <svg width={90} height={90} viewBox="0 0 90 90" style={{ flexShrink:0 }}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F1F5F9" strokeWidth={14}/>
              {slices.map((s,i) => <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={14} strokeDasharray={`${s.dash} ${circ-s.dash}`} strokeDashoffset={-s.offset+circ/4}/>)}
              <text x={cx} y={cy+1} textAnchor="middle" dominantBaseline="middle" style={{ fontSize:'0.8rem', fontWeight:700, fill:'#1E293B' }}>{total}</text>
            </svg>
            <div style={{ display:'flex', flexDirection:'column', gap:5, flex:1, minWidth:0 }}>
              {slices.map((s,i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:s.color, flexShrink:0 }}/>
                  <span style={{ fontSize:'0.68rem', color:'#475569', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.label}</span>
                  <span style={{ fontSize:'0.68rem', fontWeight:700, color:'#1E293B', flexShrink:0 }}>{s.value}</span>
                </div>
              ))}
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
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || status === doc?.status}>
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

/* ─── Main Page ──────────────────────────────────────────────────────────────── */
export default function DocumentsPage() {
  const { user }    = useAuth();
  const { toast }   = useToast();

  const [docs, setDocs]         = useState([]);
  const [stats, setStats]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [allUsers, setAllUsers] = useState([]);

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
  const [expandedGroup, setExpandedGroup] = useState(null); // base_code
  const [expandedDoc, setExpandedDoc]   = useState(null);   // doc.id

  const SUPERIOR_ROLES = ['admin','gestor','planejador','coordenador'];
  const isSuperior = SUPERIOR_ROLES.includes(user?.role);

  const isAuthor = (doc) => {
    if (isSuperior) return true;
    if (!doc.authors) return doc.created_by === user?.id;
    return doc.authors.some(a => a.id === user?.id);
  };

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
  }, []);

  const fetchNextSeq = async () => {
    try { const r = await api.get(`/documents/next-sequence?year=${CURRENT_YEAR_SHORT}`); setNextSeq(r.data.next); } catch {}
  };

  const openNew  = () => { fetchNextSeq(); setDocModal({ open:true, doc:null }); };
  const openEdit = (doc) => setDocModal({ open:true, doc });

  // Filtro "Meus docs" — filtra onde o usuário é autor (consta em doc.authors)
  const filtered = useMemo(() => docs.filter(d => {
    if (myDocsOnly) {
      const isAuth = d.authors?.some(a => a.id === user?.id) || d.created_by === user?.id;
      if (!isAuth) return false;
    }
    if (statusFilter && d.status !== statusFilter) return false;
    if (typeFilter   && d.type   !== typeFilter)   return false;
    const q = search.toLowerCase();
    if (q) return (d.code||'').toLowerCase().includes(q)
                || (d.responsible||'').toLowerCase().includes(q)
                || (d.subject||'').toLowerCase().includes(q)
                || (d.plant||'').toLowerCase().includes(q)
                || (d.authors||[]).some(a => a.name.toLowerCase().includes(q));
    return true;
  }), [docs, statusFilter, typeFilter, search, myDocsOnly, user]);

  // Agrupar por base_code
  const groups = useMemo(() => {
    const map = new Map();
    filtered.forEach(d => {
      const key = d.base_code || d.code;
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
  const yearDocs  = docs.filter(d => d.year===CURRENT_YEAR_SHORT).length;
  const myDocsCount = docs.filter(d => d.authors?.some(a=>a.id===user?.id)||d.created_by===user?.id).length;

  /* Charts */
  const TYPE_COLORS = ['#0066B3','#0891B2','#10B981','#8B5CF6','#F59E0B','#EF4444','#6366F1','#EC4899','#14B8A6'];
  const typeChartData   = DOC_TYPES.map((t,i) => ({ label:t.value, value:docs.filter(d=>d.type===t.value).length, color:TYPE_COLORS[i%TYPE_COLORS.length] }));
  const statusChartData = STATUSES.map(s => ({ label:s.value, value:docs.filter(d=>d.status===s.value).length, color:s.color }));
  const years = [...new Set(docs.map(d=>2000+d.year))].sort((a,b)=>b-a);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16, padding:'0 2px' }}>

      {/* KPI Cards */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
        <StatCard label="Total Geral"           value={totalAll}    color="#001F5B"/>
        <StatCard label={`Ano ${CURRENT_YEAR}`} value={yearDocs}    color="#0066B3" sub={`de ${totalAll} total`}/>
        <StatCard label="Publicados"            value={published}   color="#10B981"/>
        <StatCard label="Em Elaboração"         value={inProg}      color="#F59E0B"/>
        <StatCard label="Pub. sem link"         value={pubNoLink}   color={pubNoLink>0?'#EF4444':'#94A3B8'} sub={pubNoLink>0?'Atenção':'Tudo ok'}/>
        <StatCard label="Meus documentos"       value={myDocsCount} color="#8B5CF6"/>
      </div>

      {/* Charts */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
        <HBarChart  title="Documentos por Tipo"    data={typeChartData}/>
        <DonutChart title="Status dos Documentos"  data={statusChartData}/>
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
          <span style={{ fontSize:'0.72rem', color:'#94A3B8', whiteSpace:'nowrap', flexShrink:0 }}>{groups.length} grupos / {filtered.length} docs</span>
        </div>
      </div>

      {/* Tabela agrupada */}
      <div style={{ background:'#fff', border:'1px solid #E2E8F0', borderRadius:10, overflow:'hidden' }}>
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
            <thead>
              <tr style={{ background:'#001F5B' }}>
                <th style={TH}>Código</th>
                <th style={TH}>Responsável</th>
                <th style={TH}>Data</th>
                <th style={TH}>Título do Documento</th>
                <th style={TH}>Status</th>
                <th style={TH}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(({ key, items, latest }) => {
                const hasRevisions = items.length > 1;
                const groupOpen    = expandedGroup === key;
                const isMine       = isAuthor(latest);

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
                              style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'2px 7px', borderRadius:10, border:'1.5px solid #0066B3', background: groupOpen?'#0066B3':'#EFF6FF', color: groupOpen?'#fff':'#0066B3', fontSize:'0.65rem', fontWeight:700, cursor:'pointer', flexShrink:0 }}>
                              {groupOpen ? '▲' : '▼'} {items.length} rev.
                            </button>
                          )}
                          <span style={{ fontFamily:'monospace', fontWeight:700, color:'#001F5B', fontSize:'0.82rem' }}>{latest.code}</span>
                          {isMine && <span style={{ fontSize:'0.6rem', background:'#F5F3FF', color:'#6D28D9', border:'1px solid #DDD6FE', borderRadius:10, padding:'1px 5px', fontWeight:700 }}>meu</span>}
                        </div>
                      </td>
                      <td style={{ ...TD, fontSize:'0.82rem' }}>{latest.responsible}</td>
                      <td style={{ ...TD, fontSize:'0.82rem', whiteSpace:'nowrap' }}>{new Date(latest.date).toLocaleDateString('pt-BR')}</td>
                      <td style={{ ...TD, fontSize:'0.82rem', maxWidth:280 }}>
                        <span style={{ display:'-webkit-box', WebkitLineClamp:1, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{latest.subject}</span>
                      </td>
                      <td style={TD}><StatusBadge status={latest.status}/></td>
                      <td style={{ ...TD }} onClick={e => e.stopPropagation()}>
                        <div style={{ display:'flex', gap:5, alignItems:'center' }}>
                          {isAuthor(latest) && (
                            <>
                              <ActionBtn color="#8B5CF6" onClick={() => setRevModal({ open:true, doc:latest })}>🔄</ActionBtn>
                              <ActionBtn color="#0066B3" onClick={() => setStatusModal({ open:true, doc:latest })}>🔖</ActionBtn>
                              <ActionBtn color="#475569" onClick={() => openEdit(latest)}>✏️</ActionBtn>
                            </>
                          )}
                          {!isAuthor(latest) && isSuperior && (
                            <>
                              <ActionBtn color="#8B5CF6" onClick={() => setRevModal({ open:true, doc:latest })}>🔄</ActionBtn>
                              <ActionBtn color="#0066B3" onClick={() => setStatusModal({ open:true, doc:latest })}>🔖</ActionBtn>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* ── Detalhe expandido do documento principal ── */}
                    {expandedDoc === latest.id && (
                      <tr style={{ background:'#F8FBFF', borderBottom:'1px solid #E2E8F0' }}>
                        <td colSpan={6} style={{ padding:'12px 16px' }}>
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
                          <td style={{ ...TD, paddingLeft:32 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              <span style={{ color:'#CBD5E1', fontSize:'0.7rem', marginRight:2 }}>└</span>
                              <span style={{ fontFamily:'monospace', fontWeight:600, color:'#64748B', fontSize:'0.78rem' }}>{rev.code}</span>
                              {rev.revision === null || rev.revision === undefined
                                ? <span style={{ fontSize:'0.6rem', background:'#F1F5F9', color:'#94A3B8', borderRadius:10, padding:'1px 6px' }}>original</span>
                                : <span style={{ fontSize:'0.6rem', background:'#EFF6FF', color:'#3B82F6', border:'1px solid #BFDBFE', borderRadius:10, padding:'1px 6px', fontWeight:700 }}>R{rev.revision}</span>
                              }
                            </div>
                          </td>
                          <td style={{ ...TD, fontSize:'0.78rem', color:'#64748B' }}>{rev.responsible}</td>
                          <td style={{ ...TD, fontSize:'0.78rem', color:'#64748B', whiteSpace:'nowrap' }}>{new Date(rev.date).toLocaleDateString('pt-BR')}</td>
                          <td style={{ ...TD, fontSize:'0.78rem', color:'#64748B', maxWidth:280 }}>
                            <span style={{ display:'-webkit-box', WebkitLineClamp:1, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{rev.subject}</span>
                          </td>
                          <td style={TD}><StatusBadge status={rev.status}/></td>
                          <td style={{ ...TD }} onClick={e => e.stopPropagation()}>
                            {isAuthor(rev) && (
                              <div style={{ display:'flex', gap:5 }}>
                                <ActionBtn color="#0066B3" onClick={() => setStatusModal({ open:true, doc:rev })}>🔖</ActionBtn>
                                <ActionBtn color="#475569" onClick={() => openEdit(rev)}>✏️</ActionBtn>
                              </div>
                            )}
                          </td>
                        </tr>
                        {expandedDoc === rev.id && (
                          <tr style={{ background:'#F8FBFF', borderBottom:'1px solid #E2E8F0' }}>
                            <td colSpan={6} style={{ padding:'12px 16px 12px 32px' }}>
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
    </div>
  );
}

/* ─── DocDetail — painel expandido de um documento ──────────────────────────── */
function DocDetail({ doc, isAuthor }) {
  return (
    <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
      <div style={{ flex:1, minWidth:200 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:8 }}>
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
const ActionBtn = ({ color, onClick, children }) => (
  <button onClick={onClick} style={{
    width:30, height:30, border:`1.5px solid ${color}20`, borderRadius:7,
    background:`${color}10`, color, fontSize:'0.82rem', cursor:'pointer',
    display:'flex', alignItems:'center', justifyContent:'center',
    transition:'all 0.1s', flexShrink:0,
  }}
    onMouseEnter={e => { e.currentTarget.style.background=`${color}25`; e.currentTarget.style.borderColor=color; }}
    onMouseLeave={e => { e.currentTarget.style.background=`${color}10`; e.currentTarget.style.borderColor=`${color}20`; }}
  >{children}</button>
);
function InfoItem({ label, value, full }) {
  return (
    <div style={{ gridColumn: full?'1 / -1':undefined }}>
      <div style={{ fontSize:'0.62rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'#94A3B8', marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:'0.82rem', color:'#1E293B', fontWeight:500 }}>{value}</div>
    </div>
  );
}
