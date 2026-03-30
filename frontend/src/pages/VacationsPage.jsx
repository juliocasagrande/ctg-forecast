import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useRole } from '../context/AuthContext.jsx';
import api from '../utils/api.js';

/* ─────────────────────────────────────────────
 * CONSTANTES
 * ───────────────────────────────────────────── */
const AREAS = [
  { value: 'eletrica',       label: 'Elétrica' },
  { value: 'mecanica',       label: 'Mecânica' },
  { value: 'confiabilidade', label: 'Confiabilidade' },
];

const TIMELINE_GROUPS = [
  { key: 'coordenacao',    label: 'Coordenação' },
  { key: 'eletrica',       label: 'Eng. Elétrica' },
  { key: 'mecanica',       label: 'Eng. Mecânica' },
  { key: 'confiabilidade', label: 'Eng. Confiabilidade' },
  { key: 'modernizacao',   label: 'Modernização' },
];

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const PERIOD_COLORS = [
  { bg: '#DBEAFE', border: '#3B82F6', text: '#1D4ED8' },
  { bg: '#D1FAE5', border: '#10B981', text: '#065F46' },
  { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E' },
];

const ALL_AREAS_FOR_MODAL = [
  { value: 'coordenacao',    label: 'Coordenação' },
  { value: 'eletrica',       label: 'Eng. Elétrica' },
  { value: 'mecanica',       label: 'Eng. Mecânica' },
  { value: 'confiabilidade', label: 'Eng. Confiabilidade' },
  { value: 'modernizacao',   label: 'Modernização' },
];

function fmt(date) {
  if (!date) return '';
  return new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr + 'T12:00:00') - new Date()) / 86400000);
}

function calcDays(start, end) {
  if (!start || !end) return 0;
  return Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
}

function dateToPercent(dateStr, year) {
  const d = new Date(dateStr + 'T12:00:00');
  const start = new Date(year, 0, 1);
  const end   = new Date(year, 11, 31);
  return Math.max(0, Math.min(100, ((d - start) / (end - start)) * 100));
}

function Avatar({ name, initials, size = 26 }) {
  const letters = initials || name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'var(--ctg-navy)', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.32 + 'rem', fontWeight: 700,
    }}>{letters}</span>
  );
}

/* ─── TIMELINE ─── */
function VacationTimeline({ periodsByUser, allMembers, year }) {
  const today    = new Date();
  const todayPct = dateToPercent(today.toISOString().slice(0, 10), year);
  const isCurrentYear = today.getFullYear() === year;

  const grouped = {};
  for (const g of TIMELINE_GROUPS) grouped[g.key] = [];
  for (const m of allMembers) {
    const key = m.area || 'eletrica';
    if (grouped[key]) grouped[key].push(m);
    else grouped['eletrica'].push(m);
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 640 }}>
        {/* Cabeçalho meses */}
        <div style={{ display: 'flex', marginLeft: 172, borderBottom: '1px solid var(--border)' }}>
          {MONTHS.map((m, i) => (
            <div key={i} style={{
              flex: 1, textAlign: 'center', fontSize: '0.68rem', fontWeight: 600,
              color: 'var(--text-secondary)', padding: '4px 0',
              borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
            }}>{m}</div>
          ))}
        </div>

        {allMembers.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px 0', fontSize: '0.82rem' }}>
            Nenhum colaborador encontrado
          </p>
        )}

        {TIMELINE_GROUPS.map(group => {
          const gMembers = grouped[group.key];
          if (!gMembers?.length) return null;
          return (
            <div key={group.key}>
              {/* Label do grupo */}
              <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,31,91,0.04)', borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)' }}>
                <div style={{ width: 172, flexShrink: 0, padding: '4px 10px', fontSize: '0.62rem', fontWeight: 700, color: 'var(--ctg-navy)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {group.label}
                </div>
                <div style={{ flex: 1, position: 'relative', height: 22 }}>
                  {MONTHS.map((_, i) => (
                    <div key={i} style={{ position: 'absolute', left: `${(i/12)*100}%`, top: 0, bottom: 0, width: 1, background: 'var(--border)', opacity: 0.4 }} />
                  ))}
                  {isCurrentYear && (
                    <div style={{ position: 'absolute', left: `${todayPct}%`, top: 0, bottom: 0, width: 1.5, background: '#EF4444', opacity: 0.4 }} />
                  )}
                </div>
              </div>

              {/* Linhas por pessoa */}
              {gMembers.map(member => {
                const userPeriods = periodsByUser[member.id] || [];
                return (
                  <div key={member.id} style={{ display: 'flex', alignItems: 'center', minHeight: 34, borderBottom: '1px solid var(--border)' }}>
                    <div style={{ width: 172, flexShrink: 0, padding: '0 10px 0 8px', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden' }}>
                      <Avatar name={member.name} initials={member.avatar_initials} size={24} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {member.name.split(' ')[0]}
                      </span>
                    </div>
                    <div style={{ flex: 1, position: 'relative', height: 34, display: 'flex', alignItems: 'center' }}>
                      {MONTHS.map((_, i) => (
                        <div key={i} style={{ position: 'absolute', left: `${(i/12)*100}%`, top: 0, bottom: 0, width: 1, background: 'var(--border)', opacity: 0.4 }} />
                      ))}
                      {isCurrentYear && (
                        <div style={{ position: 'absolute', left: `${todayPct}%`, top: 0, bottom: 0, width: 1.5, background: '#EF4444', zIndex: 3 }} />
                      )}
                      {userPeriods.map(p => {
                        const left  = dateToPercent(p.start_date, year);
                        const right = dateToPercent(p.end_date,   year);
                        const width = Math.max(right - left, 0.8);
                        const c = PERIOD_COLORS[(p.period_number - 1) % 3];
                        return (
                          <div key={p.id}
                            title={`${p.period_number}º período: ${fmt(p.start_date)} – ${fmt(p.end_date)} (${p.days}d)`}
                            style={{
                              position: 'absolute', left: `${left}%`, width: `${width}%`,
                              height: 20, borderRadius: 4,
                              background: c.bg, border: `1.5px solid ${c.border}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.6rem', fontWeight: 700, color: c.text,
                              overflow: 'hidden', zIndex: 2, cursor: 'default',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                            }}>
                            {width > 4 ? `${p.days}d` : ''}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── MODAL ─── */
function PeriodModal({ period, userId, area, year, members, canEditOthers, onSave, onClose }) {
  const [form, setForm] = useState({
    user_id:        period?.user_id        ?? userId,
    area:           period?.area           ?? area,
    period_number:  period?.period_number  ?? 1,
    start_date:     period?.start_date?.slice(0, 10) ?? '',
    end_date:       period?.end_date?.slice(0, 10)   ?? '',
    adp_registered: period?.adp_registered ?? false,
    notes:          period?.notes          ?? '',
    year:           period?.year           ?? year,
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const days = calcDays(form.start_date, form.end_date);

  async function handleSubmit() {
    if (!form.start_date || !form.end_date) return setError('Preencha as datas');
    if (days <= 0) return setError('Data de fim deve ser após o início');
    setSaving(true); setError('');
    try {
      await onSave(period?.id ? 'put' : 'post', period?.id ?? null, form);
      onClose();
    } catch (e) { setError(e.response?.data?.error || 'Erro ao salvar'); }
    finally { setSaving(false); }
  }

  const inp = { padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: '0.82rem', background: 'var(--bg-card)', color: 'var(--text-primary)', width: '100%', outline: 'none' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 14, width: 420, maxWidth: '95vw', boxShadow: 'var(--shadow-lg)', padding: '22px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--ctg-navy)' }}>
            {period?.id ? 'Editar período' : 'Novo período de férias'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--text-secondary)' }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {canEditOthers && (
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>COLABORADOR</label>
              <select value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: parseInt(e.target.value) }))} style={inp}>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>ÁREA</label>
            <select value={form.area} onChange={e => setForm(f => ({ ...f, area: e.target.value }))} style={inp}>
              {ALL_AREAS_FOR_MODAL.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>PERÍODO</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[1,2,3].map(n => (
                <button key={n} onClick={() => setForm(f => ({ ...f, period_number: n }))} style={{
                  flex: 1, padding: '7px 0', borderRadius: 7, cursor: 'pointer',
                  border: `1.5px solid ${form.period_number === n ? PERIOD_COLORS[n-1].border : 'var(--border)'}`,
                  background: form.period_number === n ? PERIOD_COLORS[n-1].bg : 'transparent',
                  color: form.period_number === n ? PERIOD_COLORS[n-1].text : 'var(--text-secondary)',
                  fontWeight: 600, fontSize: '0.8rem',
                }}>{n}º</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>INÍCIO</label>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={inp} />
            </div>
            <div>
              <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>FIM</label>
              <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} style={inp} />
            </div>
          </div>

          {days > 0 && (
            <div style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              <strong style={{ color: 'var(--ctg-blue)', fontSize: '1rem' }}>{days}</strong> dias corridos
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
            <input type="checkbox" checked={form.adp_registered}
              onChange={e => setForm(f => ({ ...f, adp_registered: e.target.checked }))}
              style={{ width: 16, height: 16, accentColor: 'var(--ctg-blue)', cursor: 'pointer' }} />
            Registrado no ADP
          </label>

          <div>
            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>OBSERVAÇÕES (opcional)</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2} style={{ ...inp, resize: 'vertical' }} placeholder="Ex: férias parceladas, viagem..." />
          </div>

          {error && <div style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 7, padding: '8px 12px', fontSize: '0.78rem' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button onClick={onClose} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Cancelar</button>
            <button onClick={handleSubmit} disabled={saving} style={{ flex: 2, padding: '9px 0', borderRadius: 8, border: 'none', background: saving ? '#93C5FD' : 'var(--ctg-blue)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: 700 }}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── PÁGINA ─── */
export default function VacationsPage() {
  const { user } = useAuth();
  const { isEngenheiro } = useRole();
  const role = user?.role;
  const canEditOthers = role === 'admin' || role === 'gestor' || role === 'coordenador' || role === 'gerente';

  const [year,       setYear]       = useState(new Date().getFullYear());
  const [area,       setArea]       = useState('eletrica');
  const [periods,    setPeriods]    = useState([]);
  const [members,    setMembers]    = useState([]);
  const [allMembers, setAllMembers] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [modal,      setModal]      = useState(null);
  const [deleting,   setDeleting]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, mAreaRes, mAllRes] = await Promise.all([
        api.get(`/vacations?year=${year}`),
        api.get(`/vacations/members?area=${area}`),
        api.get('/vacations/members'),
      ]);
      setPeriods(pRes.data);
      setMembers(mAreaRes.data);
      setAllMembers(mAllRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [year, area]);

  useEffect(() => { load(); }, [load]);

  async function handleSave(method, id, form) {
    if (method === 'post') await api.post('/vacations', { ...form, year });
    else await api.put(`/vacations/${id}`, { ...form, year });
    load();
  }

  async function handleDelete(id) {
    setDeleting(id);
    try { await api.delete(`/vacations/${id}`); load(); }
    finally { setDeleting(null); }
  }

  const periodsByUser = {};
  for (const p of periods) {
    if (!periodsByUser[p.user_id]) periodsByUser[p.user_id] = [];
    periodsByUser[p.user_id].push(p);
  }

  const areaMembers  = members.filter(m => m.area === area);
  const areaPeriods  = periods.filter(p => areaMembers.some(m => m.id === p.user_id));
  const withVacation = new Set(areaPeriods.map(p => p.user_id)).size;
  const adpOk        = areaPeriods.filter(p => p.adp_registered).length;
  const totalDays    = areaPeriods.reduce((s, p) => s + (p.days || 0), 0);

  const listRows = areaMembers
    .map(m => ({ member: m, periods: (periodsByUser[m.id] || []).sort((a,b) => a.period_number - b.period_number) }))
    .sort((a, b) => a.member.name.localeCompare(b.member.name));

  const areaBtn = val => ({
    padding: '5px 12px', borderRadius: 20, cursor: 'pointer',
    border: '1px solid var(--border)', fontSize: '0.75rem', fontWeight: 600,
    background: area === val ? 'var(--ctg-navy)' : 'var(--bg-card)',
    color: area === val ? '#fff' : 'var(--text-secondary)',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10, overflow: 'hidden' }}>

      {/* ── Linha de controles ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'nowrap', overflowX: 'auto' }}>
        {(isEngenheiro ? [] : AREAS).map(a => (
          <button key={a.value} onClick={() => setArea(a.value)} style={areaBtn(a.value)}>{a.label}</button>
        ))}

        <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '3px 6px', flexShrink: 0 }}>
          <button onClick={() => setYear(y => y - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1rem', padding: '0 2px' }}>‹</button>
          <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--ctg-navy)', minWidth: 38, textAlign: 'center' }}>{year}</span>
          <button onClick={() => setYear(y => y + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1rem', padding: '0 2px' }}>›</button>
        </div>

        {(canEditOthers || isEngenheiro) && (
          <button onClick={() => setModal({ period: null })} style={{
            marginLeft: 'auto', padding: '6px 14px', borderRadius: 8, border: 'none',
            background: 'var(--ctg-blue)', color: '#fff', fontWeight: 700, fontSize: '0.8rem',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            <svg viewBox="0 0 16 16" fill="currentColor" width="13" height="13"><path fillRule="evenodd" d="M8 2a1 1 0 011 1v4h4a1 1 0 110 2H9v4a1 1 0 11-2 0V9H3a1 1 0 110-2h4V3a1 1 0 011-1z"/></svg>
            Novo período
          </button>
        )}
      </div>

      {/* ── KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, flexShrink: 0 }}>
        {[
          { label: 'Colaboradores',      val: areaMembers.length, sub: AREAS.find(a => a.value === area)?.label },
          { label: 'Com férias marcadas', val: withVacation, sub: `${areaMembers.length - withVacation} sem registro` },
          { label: 'Registrados no ADP',  val: adpOk, sub: `de ${areaPeriods.length} períodos` },
          { label: 'Total de dias',       val: totalDays, sub: `em ${areaPeriods.length} períodos` },
        ].map(c => (
          <div key={c.label} className="stat-card" style={{ padding: '10px 14px' }}>
            <div className="stat-label" style={{ fontSize: '0.68rem' }}>{c.label}</div>
            <div className="stat-value" style={{ fontSize: '1.3rem', color: 'var(--ctg-navy)' }}>{c.val}</div>
            <div className="stat-sub">{c.sub}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>

          {/* ── Timeline geral ── */}
          <div className="card" style={{ flexShrink: 0 }}>
            <div style={{ padding: '6px 14px 4px', background: 'var(--ctg-navy)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: '#fff', fontSize: '0.76rem', fontWeight: 600, letterSpacing: '0.04em' }}>
                Timeline Geral — {year}
              </span>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {PERIOD_COLORS.map((c, i) => (
                  <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', color: 'rgba(255,255,255,0.75)' }}>
                    <span style={{ width: 12, height: 10, borderRadius: 2, background: c.bg, border: `1.5px solid ${c.border}`, display: 'inline-block' }} />
                    {i+1}º período
                  </span>
                ))}
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', color: 'rgba(255,255,255,0.75)' }}>
                  <span style={{ width: 2, height: 10, background: '#EF4444', display: 'inline-block', borderRadius: 1 }} />
                  Hoje
                </span>
              </div>
            </div>
            <div style={{ padding: '8px 14px 12px' }}>
              <VacationTimeline periodsByUser={periodsByUser} allMembers={allMembers} year={year} />
            </div>
          </div>

          {/* ── Lista da área selecionada ── */}
          <div className="card" style={{ flexShrink: 0 }}>
            <div style={{ padding: '6px 14px 4px', background: '#1E3A6E', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0' }}>
              <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.76rem', fontWeight: 600, letterSpacing: '0.04em' }}>
                Períodos — {AREAS.find(a => a.value === area)?.label}
              </span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  {['Colaborador','1º Período','2º Período','3º Período','Total','Próx. férias',''].map(h => (
                    <th key={h} style={{ background: 'var(--ctg-navy)', color: '#fff', padding: '7px 12px', textAlign: 'left', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em', position: 'sticky', top: 0, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listRows.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>Nenhum colaborador nesta área</td></tr>
                ) : listRows.map(({ member, periods: mp }, i) => {
                  const p1 = mp.find(p => p.period_number === 1);
                  const p2 = mp.find(p => p.period_number === 2);
                  const p3 = mp.find(p => p.period_number === 3);
                  const total = mp.reduce((s, p) => s + (p.days||0), 0);
                  const next = [...mp].sort((a,b) => new Date(a.start_date)-new Date(b.start_date)).find(p => daysUntil(p.start_date) > 0);
                  const daysLeft = next ? daysUntil(next.start_date) : null;
                  const canEdit = canEditOthers || member.id === user.id;

                  function PeriodCell({ p, num }) {
                    if (!p) return (
                      <td style={{ padding: '7px 12px' }}>
                        {canEdit
                          ? <button onClick={() => setModal({ period: { period_number: num, user_id: member.id, area }, userId: member.id })}
                              style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                              + Adicionar
                            </button>
                          : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                      </td>
                    );
                    const c = PERIOD_COLORS[num-1];
                    return (
                      <td style={{ padding: '7px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, borderRadius: 5, padding: '2px 7px', fontSize: '0.72rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {fmt(p.start_date)} – {fmt(p.end_date)}
                          </span>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{p.days}d</span>
                          {p.adp_registered && <span style={{ fontSize: '0.6rem', background: '#D1FAE5', color: '#065F46', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>ADP</span>}
                          {canEdit && <>
                            <button onClick={() => setModal({ period: p, userId: member.id })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ctg-blue)', padding: '0 2px', fontSize: '0.7rem' }}>✎</button>
                            <button onClick={() => handleDelete(p.id)} disabled={deleting === p.id} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: '0 2px', fontSize: '0.7rem' }}>✕</button>
                          </>}
                        </div>
                      </td>
                    );
                  }

                  return (
                    <tr key={member.id} style={{ background: i%2 ? '#F8FAFC' : 'var(--bg-card)', borderBottom: '1px solid #E2E8F0' }}>
                      <td style={{ padding: '7px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <Avatar name={member.name} initials={member.avatar_initials} size={28} />
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{member.name}</span>
                        </div>
                      </td>
                      <PeriodCell p={p1} num={1} />
                      <PeriodCell p={p2} num={2} />
                      <PeriodCell p={p3} num={3} />
                      <td style={{ padding: '7px 12px', fontVariantNumeric: 'tabular-nums' }}>
                        {total > 0 ? <span style={{ color: 'var(--ctg-blue)', fontWeight: 500 }}>{total}d</span> : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                      </td>
                      <td style={{ padding: '7px 12px' }}>
                        {daysLeft !== null
                          ? <span style={{ background: daysLeft<=30?'#FEE2E2':daysLeft<=90?'#FEF3C7':'#EFF6FF', color: daysLeft<=30?'#991B1B':daysLeft<=90?'#92400E':'#1D4ED8', borderRadius: 8, padding: '2px 8px', fontSize: '0.72rem', fontWeight: 700 }}>
                              {daysLeft<=0?'Em férias':`${daysLeft}d`}
                            </span>
                          : <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>—</span>}
                      </td>
                      <td style={{ padding: '7px 12px' }}>
                        {canEdit && mp.length < 3 && (
                          <button onClick={() => setModal({ period: { period_number: mp.length+1, user_id: member.id, area }, userId: member.id })}
                            style={{ background: 'rgba(0,112,184,0.08)', border: '1px solid rgba(0,112,184,0.2)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', color: 'var(--ctg-blue)', fontSize: '0.68rem', fontWeight: 600 }}>
                            + período
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {modal && (
        <PeriodModal
          period={modal.period?.id ? modal.period : (modal.period?.period_number ? modal.period : null)}
          userId={modal.userId ?? user.id}
          area={area}
          year={year}
          members={allMembers}
          canEditOthers={canEditOthers}
          onSave={handleSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}