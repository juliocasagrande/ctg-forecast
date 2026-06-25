import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../utils/api.js';

const STATUS_META = {
  planejada: { label: 'Planejada', color: '#78a5de', soft: '#edf4fd', text: '#356aab' },
  em_andamento: { label: 'Em andamento', color: '#2f80d4', soft: '#e8f2fd', text: '#1c5cab' },
  bloqueada: { label: 'Atrasada', color: '#e6534d', soft: '#fdeceb', text: '#c33b35' },
  concluida: { label: 'Concluida', color: '#2f9e54', soft: '#e7f5ec', text: '#1f7a3f' },
};

const STATUS_OPTIONS = Object.keys(STATUS_META);
const MGMT_ROLES = ['admin', 'gestor', 'planejador', 'gerente'];
const DAY = 86400000;
const LEFT_WIDTH = 238;
const MONTH_WIDTH = 760;
const WEEK_WIDTH = 210;

const dateValue = value => value ? String(value).slice(0, 10) : '';
const asDate = value => value ? new Date(`${dateValue(value)}T12:00:00`) : null;
const demandStart = demand => asDate(demand.start_date) || asDate(demand.created_at) || new Date();
const demandEnd = demand => asDate(demand.due_date) || new Date(+demandStart(demand) + 30 * DAY);
const loadTone = load => Number(load) >= 100 ? '#e6534d' : Number(load) >= 85 ? '#e6a532' : '#2f9e54';
const roleLabel = role => ({ gerente: 'Gerente', gestor: 'Gestor', coordenador: 'Coordenador(a)', planejador: 'Planejador', engenheiro: 'Engenheiro(a)' })[role] || role;

function formatDate(value) {
  const date = asDate(value);
  return date ? date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Sem prazo';
}

function initials(member) {
  return member.avatar_initials?.trim()
    || member.name?.split(' ').slice(0, 2).map(word => word[0]).join('').toUpperCase()
    || '??';
}

function Avatar({ member, size = 34 }) {
  const palette = {
    gerente: ['#e4eaf6', '#16335c'],
    coordenador: ['#dcf0ea', '#15716c'],
    engenheiro: ['#dce8f8', '#2b5fa0'],
    planejador: ['#dcf0ea', '#15716c'],
  };
  const [background, color] = palette[member.role] || palette.engenheiro;
  return <span style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background, color, border: `2px solid ${color}`, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: Math.max(10, size * .33) }}>{initials(member)}</span>;
}

function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d;
}

function endOfWeek(date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  return d;
}

function overlapsRange(demand, start, end) {
  return demandStart(demand) <= end && demandEnd(demand) >= start;
}

function weeksInMonth(base = new Date()) {
  const monthStart = new Date(base.getFullYear(), base.getMonth(), 1, 12);
  const monthEnd = new Date(base.getFullYear(), base.getMonth() + 1, 0, 12);
  const weeks = [];
  let cursor = startOfWeek(monthStart);
  while (cursor <= monthEnd) {
    const start = new Date(cursor);
    const end = endOfWeek(cursor);
    weeks.push({ start, end });
    cursor = new Date(+cursor + 7 * DAY);
  }
  return weeks;
}

function activePeriod(mode, base = new Date()) {
  if (mode === 'week') return { start: startOfWeek(base), end: endOfWeek(base) };
  return { start: new Date(base.getFullYear(), base.getMonth(), 1, 12), end: new Date(base.getFullYear(), base.getMonth() + 1, 0, 12) };
}

function loadForWeek(demands, start, end) {
  return demands
    .filter(demand => demand.status !== 'concluida' && overlapsRange(demand, start, end))
    .reduce((sum, demand) => sum + Number(demand.load_percent || 0), 0);
}

function loadForMode(demands, mode, base = new Date()) {
  if (mode === 'week') {
    const period = activePeriod('week', base);
    return loadForWeek(demands, period.start, period.end);
  }
  const weeks = weeksInMonth(base);
  if (!weeks.length) return 0;
  const total = weeks.reduce((sum, week) => sum + loadForWeek(demands, week.start, week.end), 0);
  return Math.round(total / weeks.length);
}

function timelineRange(demands) {
  const now = new Date();
  const dates = demands.flatMap(demand => [demandStart(demand), demandEnd(demand)]).filter(Boolean);
  // Piso minimo de navegacao: sempre permite arrastar alguns meses para tras/frente
  // do mes atual, mesmo sem demandas cadastradas nesse intervalo.
  const floorMin = +new Date(now.getFullYear(), now.getMonth() - 2, 1, 12);
  const floorMax = +new Date(now.getFullYear(), now.getMonth() + 3, 0, 12);
  const min = Math.min(floorMin, ...dates.map(Number));
  const max = Math.max(floorMax, ...dates.map(Number));
  return {
    start: new Date(new Date(min).getFullYear(), new Date(min).getMonth(), 1, 12),
    end: new Date(new Date(max).getFullYear(), new Date(max).getMonth() + 1, 0, 12),
  };
}

function DemandDrawer({ demand, member, members, canPickMember, onSave, onDelete, onClose }) {
  const [form, setForm] = useState({
    user_id: demand?.user_id ?? member?.id ?? members[0]?.id,
    title: demand?.title ?? '',
    description: demand?.description ?? '',
    status: demand?.status ?? 'planejada',
    priority: demand?.priority ?? 'media',
    load_percent: demand?.load_percent != null ? Number(demand.load_percent) : 35,
    start_date: dateValue(demand?.start_date) || new Date().toISOString().slice(0, 10),
    due_date: dateValue(demand?.due_date),
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const busy = saving || deleting;
  const selectedMember = members.find(person => Number(person.id) === Number(form.user_id)) || member || members[0];
  const input = { width: '100%', height: 38, padding: '0 11px', border: '1px solid #dde3ec', borderRadius: 8, font: 'inherit', fontSize: '.82rem', color: '#16335c', background: '#fff', outline: 'none' };
  const label = { display: 'block', marginBottom: 6, fontSize: '.6rem', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 800, color: '#6b7a90' };
  const set = (key, value) => setForm(old => ({ ...old, [key]: value }));

  async function submit() {
    if (!form.title.trim()) return setError('Informe o nome da demanda.');
    if (!form.start_date || !form.due_date) return setError('Informe inicio e fim da demanda.');
    if (form.start_date > form.due_date) return setError('O inicio deve ser anterior ao fim.');
    setSaving(true);
    setError('');
    try {
      await onSave(demand?.id ? 'put' : 'post', demand?.id, { ...form, title: form.title.trim(), load_percent: Number(form.load_percent) });
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Nao foi possivel salvar a demanda.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    setError('');
    try {
      await onDelete(demand.id);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Nao foi possivel excluir.');
    } finally {
      setDeleting(false);
    }
  }

  return <>
    <div style={{ position: 'fixed', inset: 0, zIndex: 399, background: 'rgba(16,28,60,.22)' }} onClick={onClose} />
    <aside style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 400, maxWidth: '100vw', background: '#fff', boxShadow: '-4px 0 28px rgba(0,0,0,.16)', zIndex: 400, display: 'flex', flexDirection: 'column' }} onClick={event => event.stopPropagation()}>
      <div style={{ background: 'linear-gradient(100deg,#0c3470,#1c5cab)', padding: '18px 20px 16px', color: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '.62rem', opacity: .55, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase' }}>{demand?.id ? 'Demanda' : 'Nova demanda'}</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, marginTop: 4, lineHeight: 1.28 }}>{demand?.id ? form.title || 'Editar demanda' : 'Adicionar ao cronograma'}</div>
            {selectedMember && <div style={{ fontSize: '.75rem', color: 'rgba(255,255,255,.72)', marginTop: 5 }}>{selectedMember.name}</div>}
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ border: 0, borderRadius: 8, width: 32, height: 32, background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 20, cursor: 'pointer' }}>x</button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <span style={{ background: STATUS_META[form.status]?.color || STATUS_META.planejada.color, color: '#fff', borderRadius: 6, padding: '4px 9px', fontSize: '.7rem', fontWeight: 800 }}>{STATUS_META[form.status]?.label || 'Planejada'}</span>
          <span style={{ background: 'rgba(255,255,255,.18)', color: '#fff', borderRadius: 6, padding: '4px 9px', fontSize: '.7rem', fontWeight: 800 }}>{form.load_percent}% carga semanal</span>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'grid', gap: 14 }}>
        {canPickMember && <div><label style={label}>Responsavel</label><select value={form.user_id} onChange={e => set('user_id', Number(e.target.value))} style={input}>{members.map(person => <option key={person.id} value={person.id}>{person.name} - {roleLabel(person.role)}</option>)}</select></div>}
        <div><label style={label}>Nome da demanda</label><input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Ex: Relatorio de Progresso Q3" style={input} /></div>
        <div><label style={label}>Descricao <span style={{ fontWeight: 500 }}>(opcional)</span></label><textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Contexto ou detalhes da demanda" rows={3} style={{ ...input, height: 'auto', padding: 11, resize: 'vertical' }} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><div><label style={label}>Inicio</label><input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} style={input} /></div><div><label style={label}>Fim</label><input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} style={input} /></div></div>
        <div><label style={label}>Carga semanal alocada - <span style={{ color: '#16335c', fontSize: '.82rem' }}>{form.load_percent}%</span></label><input type="range" min="0" max="100" step="5" value={form.load_percent} onChange={e => set('load_percent', e.target.value)} style={{ width: '100%', accentColor: '#1c5cab' }} /><div style={{ height: 7, borderRadius: 5, background: '#e4e8f0', overflow: 'hidden', marginTop: 5 }}><div style={{ width: `${form.load_percent}%`, height: '100%', background: loadTone(form.load_percent) }} /></div></div>
        <div><label style={label}>Alterar status</label><div style={{ display: 'grid', gap: 8 }}>{STATUS_OPTIONS.map(key => { const status = STATUS_META[key]; const active = form.status === key; return <button key={key} type="button" onClick={() => set('status', key)} style={{ border: `2px solid ${active ? status.color : '#e4e8f0'}`, borderRadius: 9, padding: '9px 12px', font: 'inherit', fontSize: '.78rem', fontWeight: 800, color: active ? status.text : '#6b7a90', background: active ? status.soft : '#fafbfd', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}><span style={{ width: 10, height: 10, borderRadius: 3, background: status.color, flexShrink: 0 }} />{status.label}{active && <span style={{ marginLeft: 'auto', fontSize: '.66rem', color: status.text }}>Atual</span>}</button>; })}</div></div>
        {error && <div style={{ borderRadius: 8, padding: '9px 12px', background: '#fdeceb', color: '#b52f2b', fontSize: '.82rem' }}>{error}</div>}
      </div>
      <div style={{ padding: '14px 20px 20px', display: 'flex', gap: 8, borderTop: '1px solid #e6edf5', flexShrink: 0 }}>{demand?.id && <button className="btn btn-danger" onClick={remove} disabled={busy} style={{ marginRight: 'auto' }}>{deleting ? 'Excluindo...' : 'Excluir'}</button>}<button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancelar</button><button onClick={submit} disabled={busy} style={{ border: 0, borderRadius: 9, padding: '0 16px', height: 38, background: busy ? '#b9c6da' : '#1c5cab', color: '#fff', font: 'inherit', fontWeight: 800, cursor: busy ? 'default' : 'pointer' }}>{saving ? 'Salvando...' : demand?.id ? 'Salvar ajustes' : 'Adicionar demanda'}</button></div>
    </aside>
  </>;
}

function Timeline({ groups, range, today, expanded, onExpand, onEdit, canManage, onNew, loadMode }) {
  const scrollerRef = useRef(null);
  const dragRef = useRef({ active: false, moved: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0, pointerId: null });
  const [viewportWidth, setViewportWidth] = useState(0);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width) setViewportWidth(width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const columns = useMemo(() => {
    const list = [];
    if (loadMode === 'week') {
      let cursor = startOfWeek(range.start);
      while (cursor <= range.end) {
        const start = new Date(cursor);
        const end = endOfWeek(cursor);
        list.push({ start, end, label: `${start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`, sub: `${end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}` });
        cursor = new Date(+cursor + 7 * DAY);
      }
      return list;
    }
    const cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1, 12);
    while (cursor <= range.end) {
      const start = new Date(cursor);
      const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 12);
      list.push({ start, end, label: cursor.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase(), sub: String(cursor.getFullYear()) });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return list;
  }, [loadMode, range]);

  const baseWidth = loadMode === 'week' ? WEEK_WIDTH : MONTH_WIDTH;
  const colWidth = columns.length && viewportWidth ? Math.max(baseWidth, (viewportWidth - LEFT_WIDTH) / columns.length) : baseWidth;
  const totalWidth = colWidth * columns.length;
  const rangeStart = columns[0]?.start || range.start;
  const rangeEnd = columns[columns.length - 1]?.end || range.end;
  const px = date => Math.max(0, Math.min(totalWidth, (+date - +rangeStart) / (+rangeEnd - +rangeStart) * totalWidth));
  const todayLeft = px(today);

  useEffect(() => {
    const node = scrollerRef.current;
    if (!node || !columns.length) return;
    const current = loadMode === 'week' ? startOfWeek(new Date()) : new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12);
    const left = px(current);
    node.scrollLeft = Math.max(0, left - 12);
  }, [columns, loadMode, colWidth]);

  function handleWheel(event) {
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey) {
      event.currentTarget.scrollLeft += event.deltaX || event.deltaY;
      event.preventDefault();
    }
  }

  function handlePointerDown(event) {
    if (event.button !== 0) return;
    const node = scrollerRef.current;
    if (!node) return;
    dragRef.current = { active: true, moved: false, captured: false, startX: event.clientX, startY: event.clientY, scrollLeft: node.scrollLeft, scrollTop: node.scrollTop, pointerId: event.pointerId };
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    const node = scrollerRef.current;
    if (!drag.active || !node) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      drag.moved = true;
      if (!drag.captured) {
        node.setPointerCapture?.(drag.pointerId);
        drag.captured = true;
      }
    }
    if (!drag.moved) return;
    node.scrollLeft = drag.scrollLeft - dx;
    node.scrollTop = drag.scrollTop - dy;
  }

  function stopDrag() {
    const node = scrollerRef.current;
    if (node && dragRef.current.captured && dragRef.current.pointerId != null) node.releasePointerCapture?.(dragRef.current.pointerId);
    const moved = dragRef.current.moved;
    dragRef.current.active = false;
    dragRef.current.captured = false;
    window.setTimeout(() => { dragRef.current.moved = false; }, moved ? 80 : 0);
  }

  function handleDemandClick(event, demand) {
    if (dragRef.current.moved) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onEdit(demand);
  }

  return <div ref={scrollerRef} onWheel={handleWheel} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={stopDrag} onPointerCancel={stopDrag} style={{ flex: 1, overflow: 'auto', minHeight: 0, border: '1px solid #dfe6ef', background: '#fff', overscrollBehavior: 'contain', cursor: 'grab', userSelect: dragRef.current.active ? 'none' : 'auto' }}>
    <div style={{ minWidth: LEFT_WIDTH + totalWidth, width: LEFT_WIDTH + totalWidth }}>
      <div style={{ display: 'flex', height: 38, position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '2px solid #e2e8f1', boxShadow: '0 2px 8px rgba(0,0,0,.05)' }}>
        <div style={{ width: LEFT_WIDTH, flexShrink: 0, padding: '0 14px', display: 'flex', alignItems: 'center', borderRight: '1px solid #e0e7ef', fontSize: '.6rem', letterSpacing: '.08em', color: '#8592a7', fontWeight: 800, position: 'sticky', left: 0, zIndex: 11, background: '#fff' }}>COLABORADOR / CARGA</div>
        <div style={{ width: totalWidth, position: 'relative', height: '100%' }}>
          {columns.map((col, index) => {
            const left = index * colWidth;
            return <div key={`${col.label}-${col.sub}-${index}`} style={{ position: 'absolute', left, width: colWidth, height: '100%', borderRight: '1px solid #eef1f5', display: 'grid', placeItems: 'center', alignContent: 'center' }}><b style={{ fontSize: '.64rem', color: '#718098' }}>{col.label}</b><span style={{ fontSize: '.56rem', color: '#a8b3c3' }}>{col.sub}</span></div>;
          })}
          <div style={{ position: 'absolute', left: todayLeft, top: 0, bottom: 0, width: 2, background: 'rgba(230,83,77,.6)' }}><span style={{ position: 'absolute', left: -15, background: '#e6534d', color: '#fff', padding: '2px 5px', fontSize: '.52rem', fontWeight: 800, borderRadius: '0 0 4px 4px' }}>HOJE</span></div>
        </div>
      </div>
      {groups.map(group => <div key={group.key}>
        <div style={{ display: 'flex', height: 30, background: group.tint, borderBottom: '1px solid #dce5ed' }}><div style={{ width: LEFT_WIDTH, padding: '0 14px', display: 'flex', alignItems: 'center', gap: 7, borderLeft: `3px solid ${group.color}`, borderRight: '1px solid #dce5ed', fontSize: '.62rem', fontWeight: 800, letterSpacing: '.08em', color: group.color, position: 'sticky', left: 0, zIndex: 6, background: group.tint }}>{group.label.toUpperCase()} <span style={{ opacity: .55 }}>({group.people.length})</span></div><div style={{ paddingLeft: 14, display: 'flex', alignItems: 'center', fontSize: '.7rem', color: '#6f7f96' }}>Carga media: <b style={{ color: loadTone(group.average), marginLeft: 4 }}>{group.average}%</b></div></div>
        {group.people.map(({ member, demands, totalLoad }) => {
          const isOpen = expanded[member.id];
          const rowHeight = isOpen ? Math.max(54, 16 + demands.length * 24) : 54;
          return <div key={member.id} style={{ height: rowHeight, display: 'flex', borderBottom: '1px solid #edf1f5' }}>
            <button onClick={() => onExpand(member.id)} style={{ width: LEFT_WIDTH, flexShrink: 0, border: 0, borderLeft: `4px solid ${loadTone(totalLoad)}`, borderRight: '1px solid #e0e7ef', background: '#fff', textAlign: 'left', padding: '0 12px', display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontFamily: 'inherit', position: 'sticky', left: 0, zIndex: 5 }}><Avatar member={member} /><span style={{ minWidth: 0, flex: 1 }}><b style={{ display: 'block', color: '#16335c', fontSize: '.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name}</b><span style={{ fontSize: '.63rem', color: '#8290a4' }}>{roleLabel(member.role)}</span></span><span style={{ textAlign: 'right', color: loadTone(totalLoad), fontWeight: 800, fontSize: '.8rem' }}>{totalLoad}%<i style={{ display: 'block', height: 4, width: 34, marginTop: 4, borderRadius: 4, background: '#e5e9f0', overflow: 'hidden' }}><i style={{ display: 'block', width: `${Math.min(100, totalLoad)}%`, height: '100%', background: loadTone(totalLoad) }} /></i></span></button>
            <div style={{ width: totalWidth, position: 'relative', backgroundImage: 'linear-gradient(to right, transparent calc(100% - 1px), #eef1f5 calc(100% - 1px))', backgroundSize: `${colWidth}px 100%` }}>
              <div style={{ position: 'absolute', left: todayLeft, top: 0, bottom: 0, width: 2, background: 'rgba(230,83,77,.25)' }} />
              {demands.map((demand, index) => {
                const start = demandStart(demand);
                const due = demandEnd(demand);
                const left = px(start);
                const width = Math.max(8, px(due) - left);
                const status = STATUS_META[demand.status] || STATUS_META.planejada;
                const height = isOpen ? 20 : Math.max(18, Math.round(38 * Number(demand.load_percent || 0) / 100));
                return <button key={demand.id} title={`${demand.title} - ${demand.load_percent}% - ${formatDate(demand.start_date)} a ${formatDate(demand.due_date)}`} onClick={event => handleDemandClick(event, demand)} disabled={!canManage(member)} style={{ position: 'absolute', left, width, top: isOpen ? 8 + index * 24 : (54 - height) / 2, height, border: 0, borderRadius: 5, padding: '0 7px', background: status.color, color: '#fff', WebkitTextFillColor: '#fff', textAlign: 'left', font: 'inherit', fontSize: '.62rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: canManage(member) ? 'pointer' : 'default', opacity: demand.status === 'concluida' ? .72 : 1 }}><span style={{ display: 'block', width: '100%', color: '#fff', WebkitTextFillColor: '#fff', textShadow: '0 1px 1px rgba(0,0,0,.24)', pointerEvents: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: `${height}px` }}>{demand.title}</span></button>;
              })}
              {canManage(member) && <button onClick={() => onNew(member)} title="Adicionar demanda" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', width: 24, height: 24, border: '1px dashed #aab5c5', borderRadius: 6, background: '#fff', color: '#64748b', fontSize: 17, cursor: 'pointer' }}>+</button>}
            </div>
          </div>;
        })}
      </div>)}
    </div>
  </div>;
}

export default function WorkloadPage() {
  const { user } = useAuth();
  const viewRole = user?._managerAccessOverride ? user.role : (user?._originalRole || user?.role);
  const canManageOthers = MGMT_ROLES.includes(viewRole) || viewRole === 'coordenador';
  const [demands, setDemands] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState({});
  const [loadMode, setLoadMode] = useState('month');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [workload, people] = await Promise.all([api.get('/workload'), api.get('/workload/members')]);
      setDemands(workload.data);
      setMembers(people.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const canManage = member => member && (MGMT_ROLES.includes(viewRole) || viewRole === 'coordenador'
    ? (viewRole !== 'coordenador' || member.id === user?.id || (member.role === 'engenheiro' && member.area === (user?.area || 'eletrica')))
    : member.id === user?.id);

  const save = async (method, id, payload) => {
    if (method === 'post') await api.post('/workload', payload);
    else await api.put(`/workload/${id}`, payload);
    await load();
  };
  const remove = async id => { await api.delete(`/workload/${id}`); await load(); };
  const query = search.trim().toLowerCase();
  const people = members.filter(member => !query || member.name.toLowerCase().includes(query) || roleLabel(member.role).toLowerCase().includes(query));
  const visibleDemands = demands.filter(demand => !statusFilter || demand.status === statusFilter);
  const byUser = visibleDemands.reduce((map, demand) => ({ ...map, [demand.user_id]: [...(map[demand.user_id] || []), demand] }), {});
  const personLoad = member => loadForMode(demands.filter(demand => demand.user_id === member.id), loadMode);
  const roleGroups = [['gerente', 'Gerentes', '#16335c', '#edf2f9'], ['gestor', 'Gestores', '#16335c', '#edf2f9'], ['planejador', 'Planejadores', '#15716c', '#ebf7f3'], ['coordenador', 'Coordenador(a)s', '#15716c', '#ebf7f3'], ['engenheiro', 'Engenheiro(a)s', '#2b5fa0', '#edf3fc']].map(([key, label, color, tint]) => {
    const groupPeople = people.filter(person => person.role === key).map(member => {
      const personDemands = byUser[member.id] || [];
      return { member, demands: personDemands, totalLoad: personLoad(member) };
    });
    return { key, label, color, tint, people: groupPeople, average: groupPeople.length ? Math.round(groupPeople.reduce((sum, person) => sum + person.totalLoad, 0) / groupPeople.length) : 0 };
  }).filter(group => group.people.length);

  const allLoads = members.map(personLoad);
  const range = useMemo(() => timelineRange(visibleDemands), [visibleDemands]);
  const statusButtons = [{ key: '', label: 'Todos' }, ...STATUS_OPTIONS.map(key => ({ key, label: STATUS_META[key].label }))];
  const openNew = member => setModal({ demand: null, member: member || (canManageOthers ? null : members.find(m => m.id === user?.id)) });

  return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f4f6fa', margin: '-24px', minHeight: 'calc(100% + 48px)' }}>
    <div style={{ height: 58, padding: '0 22px', background: 'linear-gradient(105deg,#15716c,#35ad78)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
      <div style={{ padding: 3, borderRadius: 8, background: 'rgba(255,255,255,.16)', display: 'flex', gap: 2 }}><button onClick={() => setLoadMode('week')} style={{ border: 0, borderRadius: 6, background: loadMode === 'week' ? '#fff' : 'transparent', color: loadMode === 'week' ? '#15716c' : '#fff', padding: '5px 10px', font: 'inherit', fontSize: '.72rem', fontWeight: 800, cursor: 'pointer' }}>Semanal</button><button onClick={() => setLoadMode('month')} style={{ border: 0, borderRadius: 6, background: loadMode === 'month' ? '#fff' : 'transparent', color: loadMode === 'month' ? '#15716c' : '#fff', padding: '5px 10px', font: 'inherit', fontSize: '.72rem', fontWeight: 800, cursor: 'pointer' }}>Mensal</button></div>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar colaborador..." className="workload-search" style={{ height: 32, width: 190, padding: '0 10px', border: '1px solid rgba(255,255,255,.32)', borderRadius: 8, background: 'rgba(255,255,255,.14)', color: '#fff', font: 'inherit', fontSize: '.75rem', outline: 'none' }} />
      {statusButtons.map(option => { const meta = option.key ? STATUS_META[option.key] : null; const active = statusFilter === option.key; return <button key={option.key} onClick={() => setStatusFilter(option.key)} style={{ border: active && meta ? `1px solid ${meta.color}` : 0, borderRadius: 6, padding: '5px 10px', background: active ? (meta ? meta.color : 'rgba(255,255,255,.92)') : (meta ? meta.soft : 'rgba(255,255,255,.14)'), color: active ? (meta ? '#fff' : '#16335c') : (meta ? meta.text : '#fff'), font: 'inherit', fontSize: '.7rem', fontWeight: 800, cursor: 'pointer' }}>{option.label}</button>; })}
      <button onClick={() => openNew()} style={{ marginLeft: 'auto', height: 32, padding: '0 14px', border: '1px solid rgba(255,255,255,.36)', borderRadius: 8, background: 'rgba(255,255,255,.16)', color: '#fff', font: 'inherit', fontSize: '.78rem', fontWeight: 800, cursor: 'pointer' }}>+ Nova Demanda</button>
    </div>
    <div style={{ padding: '5px 22px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', background: '#f8fafc', borderBottom: '1px solid #e0e7ef', fontSize: '.68rem', color: '#718098', flexShrink: 0 }}><b style={{ fontSize: '.58rem', letterSpacing: '.08em' }}>STATUS:</b>{STATUS_OPTIONS.map(key => <span key={key}><i style={{ display: 'inline-block', width: 8, height: 8, marginRight: 5, borderRadius: 2, background: STATUS_META[key].color }} />{STATUS_META[key].label}</span>)}<span style={{ borderLeft: '1px solid #dbe3eb', paddingLeft: 12 }}>Carga exibida: <b>{loadMode === 'week' ? 'soma da semana atual' : 'media semanal do mes atual'}</b></span><span style={{ marginLeft: 'auto', color: '#97a4b5' }}>Use a barra horizontal, trackpad ou Shift + roda para navegar no tempo</span></div>
    {loading ? <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div> : roleGroups.length ? <Timeline groups={roleGroups} range={range} today={new Date()} expanded={expanded} onExpand={id => setExpanded(current => ({ ...current, [id]: !current[id] }))} onEdit={demand => setModal({ demand, member: members.find(member => member.id === demand.user_id) })} canManage={canManage} onNew={openNew} loadMode={loadMode} /> : <div className="card" style={{ margin: 20, padding: 30, textAlign: 'center', color: 'var(--text-secondary)' }}>Nenhum colaborador ou demanda encontrado.</div>}
    {modal && <DemandDrawer demand={modal.demand} member={modal.member} members={canManageOthers ? members : members.filter(member => member.id === user?.id)} canPickMember={canManageOthers} onSave={save} onDelete={remove} onClose={() => setModal(null)} />}
  </div>;
}
