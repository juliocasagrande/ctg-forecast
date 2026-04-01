import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../utils/api.js';
import { useToast } from '../components/ui/Toast.jsx';

/* ─── Constants ──────────────────────────────────────────────────────────────── */
const DOC_TYPES = [
  { value: 'ATA',  label: 'Atas' },
  { value: 'CTA',  label: 'Cartas' },
  { value: 'RT',   label: 'Relatório Técnico' },
  { value: 'EP',   label: 'Ensaios Preditivos' },
  { value: 'ET',   label: 'Especificação Técnica' },
  { value: 'ROP',  label: 'Rel. de Ocorrências e Perturbações' },
  { value: 'MC',   label: 'Memorial de Cálculo' },
  { value: 'ROG',  label: 'Rel. Ocorrência Grave e Indisponibilidade' },
  { value: 'RFH',  label: 'Relatório de Falha Humana' },
];

const AREAS = [
  { value: 'ENG', label: 'Eng. de Manutenção' },
  { value: 'PRD', label: 'Produção' },
  { value: 'COP', label: 'Coordenação Operação' },
];

const ALL_PLANTS = [
  'PCH Palmeiras', 'PCH Retiro', 'UHE Canoas 1', 'UHE Canoas 2',
  'UHE Capivara', 'UHE Chavantes', 'UHE Garibaldi', 'UHE Ilha Solteira',
  'UHE Jupiá', 'UHE Jurumirim', 'UHE Rosana', 'UHE Salto',
  'UHE Salto Grande', 'UHE Taquaruçu',
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

/* ─── buildCode ─────────────────────────────────────────────────────────────── */
function buildCode(type, area, seq, year, revision) {
  if (!type || !area || !seq || !year) return '';
  const seqStr = String(seq).padStart(3, '0');
  const yy     = String(year).padStart(2, '0');
  let code = `${type}-${area}-${seqStr}-${yy}`;
  if (revision !== '' && revision !== null && revision !== undefined) code += `-R${revision}`;
  return code;
}

/* ─── StatusBadge ────────────────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const m = STATUS_META[status] || { color: '#6B7280', bg: '#F3F4F6', text: '#374151' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700,
      background: m.bg, color: m.text, border: `1px solid ${m.color}33`, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
      {status}
    </span>
  );
}

/* ─── StatCard ───────────────────────────────────────────────────────────────── */
function StatCard({ label, value, sub, color = '#0066B3' }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10,
      padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 4,
      borderTop: `3px solid ${color}`, flex: '1 1 0', minWidth: 100,
    }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{sub}</div>}
    </div>
  );
}

/* ─── HBarChart ──────────────────────────────────────────────────────────────── */
function HBarChart({ data, title }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const visible = data.filter(d => d.value > 0);
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 16px', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', marginBottom: 10 }}>{title}</div>
      {visible.length === 0
        ? <div style={{ fontSize: '0.78rem', color: '#CBD5E1', textAlign: 'center', padding: '16px 0' }}>Sem dados</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {visible.map((d, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ fontSize: '0.68rem', color: '#475569', width: 34, textAlign: 'right', flexShrink: 0, fontWeight: 600 }}>{d.label}</div>
                <div style={{ flex: 1, background: '#F1F5F9', borderRadius: 4, height: 14, overflow: 'hidden' }}>
                  <div style={{ width: `${(d.value / max) * 100}%`, height: '100%', background: d.color || '#0066B3', borderRadius: 4, transition: 'width 0.4s ease' }} />
                </div>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#1E293B', width: 20, flexShrink: 0 }}>{d.value}</div>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

/* ─── VBarChart ──────────────────────────────────────────────────────────────── */
function VBarChart({ data, title }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const visible = data.filter(d => d.value > 0);
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 16px', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', marginBottom: 10 }}>{title}</div>
      {visible.length === 0
        ? <div style={{ fontSize: '0.78rem', color: '#CBD5E1', textAlign: 'center', padding: '16px 0' }}>Sem dados</div>
        : <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
            {visible.map((d, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0 }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#1E293B' }}>{d.value}</div>
                <div style={{ width: '100%', height: `${Math.max((d.value / max) * 56, 4)}px`, background: d.color || '#0066B3', borderRadius: '3px 3px 0 0', transition: 'height 0.4s ease' }} />
                <div style={{ fontSize: '0.58rem', color: '#64748B', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{d.label}</div>
              </div>
            ))}
          </div>
      }
    </div>
  );
}

/* ─── DonutChart ─────────────────────────────────────────────────────────────── */
function DonutChart({ data, title }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = 32, cx = 45, cy = 45, circumference = 2 * Math.PI * r;
  let offset = 0;
  const slices = data.filter(d => d.value > 0).map(d => {
    const dash  = (d.value / total) * circumference;
    const slice = { ...d, dash, offset };
    offset += dash;
    return slice;
  });
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 16px', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8', marginBottom: 10 }}>{title}</div>
      {total === 0
        ? <div style={{ fontSize: '0.78rem', color: '#CBD5E1', textAlign: 'center', padding: '16px 0' }}>Sem dados</div>
        : <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <svg width={90} height={90} viewBox="0 0 90 90" style={{ flexShrink: 0 }}>
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F1F5F9" strokeWidth={14} />
              {slices.map((s, i) => (
                <circle key={i} cx={cx} cy={cy} r={r} fill="none"
                  stroke={s.color} strokeWidth={14}
                  strokeDasharray={`${s.dash} ${circumference - s.dash}`}
                  strokeDashoffset={-s.offset + circumference / 4}
                />
              ))}
              <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle"
                style={{ fontSize: '0.8rem', fontWeight: 700, fill: '#1E293B' }}>{total}</text>
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1, minWidth: 0 }}>
              {slices.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.68rem', color: '#475569', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                  <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#1E293B', flexShrink: 0 }}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>
      }
    </div>
  );
}

/* ─── Field wrapper ──────────────────────────────────────────────────────────── */
const fieldStyle = {
  padding: '7px 10px', border: '1.5px solid #E2E8F0', borderRadius: 6,
  fontSize: '0.85rem', fontFamily: 'var(--font-body)', color: '#1E293B',
  background: '#fff', outline: 'none', width: '100%', boxSizing: 'border-box',
};
function Field({ label, required, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B' }}>
        {label}{required && <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

/* ─── DocModal ───────────────────────────────────────────────────────────────── */
function DocModal({ open, onClose, onSaved, doc, nextSeq }) {
  const toast  = useToast();
  const isEdit = !!doc;
  const [users, setUsers] = useState([]);

  const initForm = () => ({
    type:            doc?.type           || '',
    area:            doc?.area           || 'ENG',
    sequence_number: doc?.sequence_number ?? nextSeq ?? '',
    year:            doc?.year           ?? CURRENT_YEAR_SHORT,
    revision:        doc?.revision       ?? '',
    plant:           doc?.plant          || '',
    responsible:     doc?.responsible    || '',
    date:            doc?.date ? doc.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
    subject:         doc?.subject        || '',
    status:          doc?.status         || 'Em elaboração',
    document_link:   doc?.document_link  || '',
    notes:           doc?.notes          || '',
  });

  const [form, setForm]     = useState(initForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setForm(initForm()); }, [open, doc, nextSeq]);
  useEffect(() => {
    if (!open) return;
    api.get('/users/for-delegation').then(r => setUsers(r.data)).catch(() => {});
  }, [open]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const preview = buildCode(form.type, form.area, form.sequence_number, form.year, form.revision);

  const handleSubmit = async () => {
    if (!form.type || !form.area || !form.responsible || !form.date || !form.subject || !form.status) {
      toast('Preencha todos os campos obrigatórios.', 'error'); return;
    }
    setSaving(true);
    try {
      if (isEdit) { await api.put(`/documents/${doc.id}`, form); toast('Documento atualizado!', 'success'); }
      else        { await api.post('/documents', form);           toast('Documento registrado!', 'success'); }
      onSaved(); onClose();
    } catch (err) { toast(err.response?.data?.error || 'Erro ao salvar.', 'error'); }
    finally { setSaving(false); }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal"
        style={{ maxWidth: 700, width: '95vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>

        <div className="modal-header" style={{ flexShrink: 0 }}>
          <span className="modal-title">{isEdit ? '✏️ Editar Documento' : '📄 Novo Documento'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontSize: '1.1rem' }}>✕</button>
        </div>

        <div className="modal-body" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Code preview */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: '#94A3B8', whiteSpace: 'nowrap' }}>Código gerado:</span>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '1rem', color: preview ? '#001F5B' : '#CBD5E1' }}>
              {preview || 'Preencha os campos abaixo'}
            </span>
          </div>

          {/* Tipo + Área */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Tipo de Documento" required>
              <select value={form.type} onChange={e => set('type', e.target.value)} style={fieldStyle}>
                <option value="">— Selecionar —</option>
                {DOC_TYPES.map(o => <option key={o.value} value={o.value}>{o.value} — {o.label}</option>)}
              </select>
            </Field>
            <Field label="Área" required>
              <select value={form.area} onChange={e => set('area', e.target.value)} style={fieldStyle}>
                {AREAS.map(o => <option key={o.value} value={o.value}>{o.value} — {o.label}</option>)}
              </select>
            </Field>
          </div>

          {/* Nº (readonly) + Ano + Revisão */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Field label="Nº Sequencial">
              <input value={form.sequence_number} readOnly
                style={{ ...fieldStyle, background: '#F8FAFC', color: '#64748B', cursor: 'not-allowed' }}
                title="Preenchido automaticamente" />
            </Field>
            <Field label="Ano (2 dígitos)" required>
              <input type="number" value={form.year} onChange={e => set('year', e.target.value)} min={0} max={99} style={fieldStyle} />
            </Field>
            <Field label="Revisão">
              <input type="number" value={form.revision} onChange={e => set('revision', e.target.value)} min={0} placeholder="Sem rev." style={fieldStyle} />
            </Field>
          </div>

          {/* Usina + Responsável + Data */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Field label="Usina">
              <select value={form.plant} onChange={e => set('plant', e.target.value)} style={fieldStyle}>
                <option value="">— Selecionar —</option>
                {ALL_PLANTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Responsável" required>
              <select value={form.responsible} onChange={e => set('responsible', e.target.value)} style={fieldStyle}>
                <option value="">— Selecionar —</option>
                {users.map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
              </select>
            </Field>
            <Field label="Data" required>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={fieldStyle} />
            </Field>
          </div>

          {/* Assunto */}
          <Field label="Título do Documento" required>
            <textarea value={form.subject} onChange={e => set('subject', e.target.value)}
              rows={2} style={{ ...fieldStyle, resize: 'vertical' }} />
          </Field>

          {/* Status */}
          <Field label="Status" required>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STATUSES.map(s => (
                <label key={s.value} style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                  border: `1.5px solid ${form.status === s.value ? s.color : '#E2E8F0'}`,
                  borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem',
                  background: form.status === s.value ? s.bg : '#fff',
                  color: form.status === s.value ? s.text : '#64748B',
                  fontWeight: form.status === s.value ? 700 : 400,
                  transition: 'all 0.12s', userSelect: 'none',
                }}>
                  <input type="radio" name="doc_status" value={s.value} checked={form.status === s.value}
                    onChange={() => set('status', s.value)} style={{ display: 'none' }} />
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  {s.value}
                </label>
              ))}
            </div>
          </Field>

          {/* Link — só quando Publicado */}
          {form.status === 'Publicado' && (
            <Field label="Link do Documento">
              <input type="text" value={form.document_link} onChange={e => set('document_link', e.target.value)}
                placeholder="https://... ou \\servidor\pasta\arquivo"
                style={{ ...fieldStyle, border: '1.5px solid #10B981', background: '#F0FDF4' }} />
            </Field>
          )}

          {/* Observações */}
          <Field label="Observações">
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={2} placeholder="Informações adicionais..."
              style={{ ...fieldStyle, resize: 'vertical' }} />
          </Field>
        </div>

        <div className="modal-footer" style={{ flexShrink: 0 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Salvando...' : isEdit ? '💾 Salvar Alterações' : '📄 Registrar Documento'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── HTML Report ────────────────────────────────────────────────────────────── */
function generateHTMLReport(docs, stats, year) {
  const now      = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
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
      <td>${d.responsible}</td><td>${new Date(d.date).toLocaleDateString('pt-BR')}</td>
      <td>${d.subject}</td>
      <td><span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:700;background:${sm.bg};color:${sm.text};border:1px solid ${sm.color}33">${d.status}</span></td>
      <td style="text-align:center">${link}</td></tr>`;
  }).join('');
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatório de Documentação — CTG Brasil ${year}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1E293B;background:#F8FAFC}.page{max-width:1100px;margin:0 auto;padding:32px 24px}.header{padding:24px 28px;background:#001F5B;color:#fff;border-radius:12px;margin-bottom:28px}.header h1{font-size:1.4rem;font-weight:700}.header .sub{font-size:0.85rem;opacity:.7;margin-top:4px}.section{margin-bottom:28px}.section h2{font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#64748B;margin-bottom:14px;padding-bottom:6px;border-bottom:2px solid #E2E8F0}.stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px}.stat-card{background:#fff;border:1px solid #E2E8F0;border-radius:10px;padding:16px;border-top:3px solid #0066B3}.stat-card .num{font-size:2rem;font-weight:700;color:#0066B3;line-height:1}.stat-card .lbl{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94A3B8;margin-bottom:6px}table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;border:1px solid #E2E8F0;font-size:.83rem}th{background:#001F5B;color:#fff;padding:10px 12px;text-align:left;font-size:.72rem;text-transform:uppercase;letter-spacing:.06em}td{padding:9px 12px;border-bottom:1px solid #F1F5F9}.tables-row{display:grid;grid-template-columns:1fr 1fr;gap:20px}.footer{text-align:center;font-size:.72rem;color:#94A3B8;margin-top:32px;padding-top:16px;border-top:1px solid #E2E8F0}@media print{body{background:#fff}.page{padding:20px}}</style>
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
    <table><thead><tr><th>Código</th><th>Responsável</th><th>Data</th><th>Título do Documento</th><th>Status</th><th>Link</th></tr></thead><tbody>${docRows}</tbody></table>
  </div>
  <div class="footer">CTG Brasil · CTG.Engenharia · Gerado em ${now}</div>
</div></body></html>`;
}

/* ─── Main Page ──────────────────────────────────────────────────────────────── */
export default function DocumentsPage() {
  const { user } = useAuth();
  const toast    = useToast();

  const [docs, setDocs]         = useState([]);
  const [stats, setStats]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editDoc, setEditDoc]   = useState(null);
  const [nextSeq, setNextSeq]   = useState(null);
  const [yearFilter, setYearFilter]     = useState(0);
  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter]     = useState('');
  const [expandedId, setExpandedId]     = useState(null);

  const SUPERIOR_ROLES = ['admin', 'gestor', 'planejador', 'coordenador'];
  const isSuperior   = SUPERIOR_ROLES.includes(user?.role);
  const canCreate    = !!user;
  const canEditDoc   = (doc) => isSuperior || doc?.created_by === user?.id;
  const canDeleteDoc = (doc) => isSuperior || doc?.created_by === user?.id;

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const params = yearFilter ? `?year=${yearFilter % 100}` : '';
      const [docsRes, statsRes] = await Promise.all([
        api.get(`/documents${params}`),
        api.get(`/documents/stats${params}`),
      ]);
      setDocs(docsRes.data);
      setStats(statsRes.data);
    } catch { toast('Erro ao carregar documentos.', 'error'); }
    finally { setLoading(false); }
  }, [yearFilter]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const fetchNextSeq = async () => {
    try {
      const r = await api.get(`/documents/next-sequence?year=${CURRENT_YEAR_SHORT}`);
      setNextSeq(r.data.next);
    } catch {}
  };

  const openNew  = () => { fetchNextSeq(); setEditDoc(null); setModalOpen(true); };
  const openEdit = (doc) => { setEditDoc(doc); setModalOpen(true); };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Excluir documento "${doc.code}"?`)) return;
    try { await api.delete(`/documents/${doc.id}`); toast('Documento excluído.', 'success'); fetchDocs(); }
    catch { toast('Erro ao excluir.', 'error'); }
  };

  const exportHTML = () => {
    const html = generateHTMLReport(docs, stats, CURRENT_YEAR);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `CTG_Documentacao_${CURRENT_YEAR}.html`;
    a.click(); URL.revokeObjectURL(a.href);
    toast('Relatório exportado!', 'success');
  };

  const filtered = useMemo(() => docs.filter(d => {
    if (statusFilter && d.status !== statusFilter) return false;
    if (typeFilter   && d.type   !== typeFilter)   return false;
    const q = search.toLowerCase();
    if (q) return d.code.toLowerCase().includes(q) || d.responsible.toLowerCase().includes(q) || d.subject.toLowerCase().includes(q) || (d.plant||'').toLowerCase().includes(q);
    return true;
  }), [docs, statusFilter, typeFilter, search]);

  /* ── KPI values ── */
  const totalAll  = docs.length;
  const published = docs.filter(d => d.status === 'Publicado').length;
  const inProg    = docs.filter(d => d.status === 'Em elaboração').length;
  const pubNoLink = stats?.published_without_link ?? 0;
  const yearDocs  = docs.filter(d => d.year === CURRENT_YEAR_SHORT).length;

  /* ── Chart data ── */
  const TYPE_COLORS = ['#0066B3','#0891B2','#10B981','#8B5CF6','#F59E0B','#EF4444','#6366F1','#EC4899','#14B8A6'];
  const typeChartData   = DOC_TYPES.map((t, i) => ({ label: t.value, value: docs.filter(d => d.type === t.value).length, color: TYPE_COLORS[i % TYPE_COLORS.length] }));
  const plantChartData  = ALL_PLANTS.map(p => ({ label: p.replace('UHE ','').replace('PCH ',''), value: docs.filter(d => d.plant === p).length, color: '#0066B3' })).filter(d => d.value > 0);
  const statusChartData = STATUSES.map(s => ({ label: s.value, value: docs.filter(d => d.status === s.value).length, color: s.color }));

  const years = [...new Set(docs.map(d => 2000 + d.year))].sort((a, b) => b - a);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 2px' }}>

      {/* ── KPI Cards — full width, auto-fill ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <StatCard label="Total Geral"           value={totalAll}  color="#001F5B" />
        <StatCard label={`Ano ${CURRENT_YEAR}`} value={yearDocs}  color="#0066B3" sub={`de ${totalAll} total`} />
        <StatCard label="Publicados"            value={published} color="#10B981" />
        <StatCard label="Em Elaboração"         value={inProg}    color="#F59E0B" />
        <StatCard label="Pub. sem link"         value={pubNoLink} color={pubNoLink > 0 ? '#EF4444' : '#94A3B8'} sub={pubNoLink > 0 ? 'Atenção necessária' : 'Tudo ok'} />
      </div>

      {/* ── Charts row ── */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <HBarChart  title="Documentos por Tipo"  data={typeChartData} />
        <VBarChart  title="Documentos por Usina" data={plantChartData} />
        <DonutChart title="Status dos Documentos" data={statusChartData} />
      </div>

      {/* ── Filter bar row: [+ Novo] [search/filters…] [Exportar] ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>

        {canCreate && (
          <button onClick={openNew} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            border: 'none', borderRadius: 8, background: '#001F5B',
            fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', color: '#fff', flexShrink: 0,
          }}>+ Novo Documento</button>
        )}

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 8, padding: '7px 12px', minWidth: 0 }}>
          <span style={{ color: '#94A3B8', fontSize: '0.85rem', flexShrink: 0 }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar código, responsável, assunto..."
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: '0.82rem', fontFamily: 'var(--font-body)', color: '#1E293B', background: 'transparent', minWidth: 0 }} />
          {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', flexShrink: 0 }}>✕</button>}
          <Div />
          <select value={yearFilter} onChange={e => setYearFilter(parseInt(e.target.value))} style={selStyle(!!yearFilter)}>
            <option value={0}>Todos os anos</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <Div />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selStyle(!!typeFilter)}>
            <option value="">Todos os tipos</option>
            {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.value}</option>)}
          </select>
          <Div />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selStyle(!!statusFilter)}>
            <option value="">Todos os status</option>
            {STATUSES.map(s => <option key={s.value} value={s.value}>{s.value}</option>)}
          </select>
          <Div />
          <span style={{ fontSize: '0.72rem', color: '#94A3B8', whiteSpace: 'nowrap', flexShrink: 0 }}>{filtered.length}/{docs.length}</span>
        </div>

        <button onClick={exportHTML} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
          border: '1.5px solid #CBD5E1', borderRadius: 8, background: '#fff',
          fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', color: '#475569', flexShrink: 0,
        }}>📊 Exportar HTML</button>
      </div>

      {/* ── Table ── */}
      <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: '#94A3B8' }}>
            <div className="spinner" style={{ margin: '0 auto 12px' }} />Carregando documentos...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: '2rem', marginBottom: 10 }}>📄</div>
            <div style={{ fontSize: '0.9rem', color: '#64748B', fontWeight: 600 }}>Nenhum documento encontrado</div>
            {canCreate && <button onClick={openNew} style={{ marginTop: 12, padding: '8px 18px', border: 'none', borderRadius: 8, background: '#001F5B', color: '#fff', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}>+ Registrar Documento</button>}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#001F5B' }}>
                <th style={TH}>Código</th><th style={TH}>Responsável</th><th style={TH}>Data</th>
                <th style={TH}>Título do Documento</th><th style={TH}>Status</th><th style={{ ...TH, width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc, i) => {
                const expanded = expandedId === doc.id;
                const rowBg    = i % 2 === 0 ? '#fff' : '#F8FAFC';
                return (
                  <Fragment key={doc.id}>
                    <tr
                      onClick={() => setExpandedId(expanded ? null : doc.id)}
                      style={{ background: rowBg, cursor: 'pointer', borderBottom: expanded ? 'none' : '1px solid #F1F5F9' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F0F9FF'}
                      onMouseLeave={e => e.currentTarget.style.background = rowBg}
                    >
                      <td style={TD}><span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#001F5B', fontSize: '0.82rem' }}>{doc.code}</span></td>
                      <td style={{ ...TD, fontSize: '0.82rem' }}>{doc.responsible}</td>
                      <td style={{ ...TD, fontSize: '0.82rem', whiteSpace: 'nowrap' }}>{new Date(doc.date).toLocaleDateString('pt-BR')}</td>
                      <td style={{ ...TD, fontSize: '0.82rem', maxWidth: 320 }}>
                        <span style={{ display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{doc.subject}</span>
                      </td>
                      <td style={TD}><StatusBadge status={doc.status} /></td>
                      <td style={{ ...TD, textAlign: 'right' }}><span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>{expanded ? '▲' : '▼'}</span></td>
                    </tr>
                    {expanded && (
                      <tr style={{ background: '#F0F9FF', borderBottom: '1px solid #E2E8F0' }}>
                        <td colSpan={6} style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1, minWidth: 240 }}>
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                                {doc.plant && <InfoItem label="Usina" value={doc.plant} />}
                                <InfoItem label="Tipo" value={`${doc.type} — ${TYPE_META[doc.type]?.label || ''}`} />
                                <InfoItem label="Área" value={`${doc.area} — ${AREAS.find(a => a.value === doc.area)?.label || doc.area}`} />
                                {doc.revision !== null && doc.revision !== undefined && <InfoItem label="Revisão" value={`R${doc.revision}`} />}
                                {doc.notes && <InfoItem label="Observações" value={doc.notes} full />}
                              </div>
                              {doc.status === 'Publicado' && (
                                <div style={{ marginTop: 10 }}>
                                  {doc.document_link
                                    ? <a href={doc.document_link} target="_blank" rel="noopener noreferrer"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.8rem', color: '#0066B3', fontWeight: 600, textDecoration: 'none' }}>
                                        🔗 Acessar documento
                                      </a>
                                    : <span style={{ fontSize: '0.78rem', color: '#EF4444', fontWeight: 600 }}>⚠ Publicado sem link cadastrado</span>
                                  }
                                </div>
                              )}
                            </div>
                            {(canEditDoc(doc) || canDeleteDoc(doc)) && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                                {canEditDoc(doc) && (
                                  <button onClick={e => { e.stopPropagation(); openEdit(doc); }}
                                    style={{ padding: '6px 14px', border: '1.5px solid #0066B3', borderRadius: 6, background: '#fff', color: '#0066B3', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
                                    ✏️ Editar
                                  </button>
                                )}
                                {canDeleteDoc(doc) && (
                                  <button onClick={e => { e.stopPropagation(); handleDelete(doc); }}
                                    style={{ padding: '6px 14px', border: '1.5px solid #EF4444', borderRadius: 6, background: '#fff', color: '#EF4444', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
                                    🗑 Excluir
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <DocModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditDoc(null); }}
        onSaved={fetchDocs}
        doc={editDoc}
        nextSeq={nextSeq}
      />
    </div>
  );
}

/* ─── Style helpers ──────────────────────────────────────────────────────────── */
const TH = { padding: '10px 14px', textAlign: 'left', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#fff' };
const TD = { padding: '10px 14px', verticalAlign: 'middle' };
const Div = () => <div style={{ width: 1, height: 18, background: '#E2E8F0', flexShrink: 0 }} />;
const selStyle = (active) => ({ border: 'none', outline: 'none', fontSize: '0.78rem', fontFamily: 'var(--font-body)', color: active ? '#001F5B' : '#94A3B8', fontWeight: active ? 700 : 400, cursor: 'pointer', background: 'transparent', flexShrink: 0 });

function InfoItem({ label, value, full }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: '0.82rem', color: '#1E293B', fontWeight: 500 }}>{value}</div>
    </div>
  );
}