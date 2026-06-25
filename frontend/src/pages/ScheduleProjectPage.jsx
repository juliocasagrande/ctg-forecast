import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../utils/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/ui/Toast.jsx';

const SETTINGS_KEY = 'ctg_schedule_settings_v1';
const DAY_MS = 86400000;
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const TASK_ROW_H = 30;
const PHASE_ROW_H = 42;
const SUMMARY_ROW_H = 42;
const PRINT_TASK_ROW_H = 20;
const PRINT_PHASE_ROW_H = 24;
const PRINT_SUMMARY_ROW_H = 26;
const PRINT_BODY_MAX_H = 1320;
const PRINT_PAGE_WIDTH = 1080;
const PRINT_TASK_WIDTH = 384;
const DEFAULT_SETTINGS = {
  showToday: true,
  shadeWeekends: true,
  workdays: [1, 2, 3, 4, 5],
  holidays: [],
  extraWorkdays: [],
};
const MAX_HIERARCHY_LEVELS = 5;
// Pastel, discreet tones per hierarchy level — applied to both macro and leaf rows alike.
const LEVEL_COLORS = [
  { bg: '#DCE8F8', fill: '#8FB8E8', text: '#1D4F8F' },
  { bg: '#DCF3EA', fill: '#79CDA8', text: '#1F7A55' },
  { bg: '#E8E2F8', fill: '#B6A0E8', text: '#5B3FA0' },
  { bg: '#FBEFD9', fill: '#E8BD6E', text: '#8A5A12' },
  { bg: '#FBE3EA', fill: '#E892AC', text: '#A13E5E' },
];
function getLevelColor(depth = 0) {
  return LEVEL_COLORS[Math.min(depth, LEVEL_COLORS.length - 1)];
}
const WEEKDAYS = [
  ['0', 'Dom'],
  ['1', 'Seg'],
  ['2', 'Ter'],
  ['3', 'Qua'],
  ['4', 'Qui'],
  ['5', 'Sex'],
  ['6', 'Sab'],
];

const demoProject = {
  id: 'demo-u3',
  name: 'Comissionamento U3',
  plant: 'UHE Garibaldi',
  description: 'Cronograma executivo de atividades de engenharia e campo.',
  activeRevisionId: 'rev-0',
  revisions: [
    {
      id: 'rev-0',
      label: 'Rev. 0',
      tasks: [
        { id: 't1', wbs: '1', name: 'Preparação', type: 'phase', start: '2026-05-25', end: '2026-05-29', progress: 45, predecessorId: '', dependencyType: 'FS', notes: '' },
        { id: 't2', wbs: '1.1', name: 'Mobilização da equipe', type: 'task', start: '2026-05-25', end: '2026-05-26', progress: 100, predecessorId: '', dependencyType: 'FS', notes: '' },
        { id: 't3', wbs: '1.2', name: 'Inspeção documental', type: 'task', start: '2026-05-27', end: '2026-05-29', progress: 35, predecessorId: 't2', dependencyType: 'FS', notes: '' },
        { id: 't4', wbs: '2', name: 'Ensaios e comissionamento', type: 'phase', start: '2026-06-01', end: '2026-06-12', progress: 18, predecessorId: 't3', dependencyType: 'FS', notes: '' },
        { id: 't5', wbs: '2.1', name: 'Teste de proteção', type: 'task', start: '2026-06-01', end: '2026-06-04', progress: 20, predecessorId: 't3', dependencyType: 'FS', notes: '' },
        { id: 't6', wbs: '2.2', name: 'Teste funcional integrado', type: 'task', start: '2026-06-05', end: '2026-06-10', progress: 0, predecessorId: 't5', dependencyType: 'FS', notes: '' },
        { id: 't7', wbs: '2.3', name: 'Pendências e aceite', type: 'task', start: '2026-06-11', end: '2026-06-12', progress: 0, predecessorId: 't6', dependencyType: 'FS', notes: '' },
      ],
    },
    { id: 'rev-1', label: 'Rev. 1', tasks: [] },
    { id: 'rev-2', label: 'Rev. 2', tasks: [] },
  ],
};

function iso(date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysBetween(a, b) {
  return Math.round((b - a) / DAY_MS);
}

function formatDate(value) {
  const date = parseDate(value);
  return date ? date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-';
}

function getStatus(task) {
  const progress = Number(task.progress) || 0;
  const end = parseDate(task.end);
  if (progress >= 100) return 'done';
  if (end && end < TODAY) return 'late';
  if (progress > 0) return 'progress';
  return 'pending';
}

function makeTask(project) {
  const revision = getActiveRevision(project);
  const tasks = revision?.tasks || [];
  const index = tasks.length + 1;
  const prev = tasks[tasks.length - 1];
  const start = prev?.end ? iso(addDays(parseDate(prev.end), 1)) : iso(TODAY);
  return {
    id: `task-${Date.now()}`,
    wbs: `${index}`,
    name: 'Nova tarefa',
    type: 'task',
    start,
    end: iso(addDays(parseDate(start), 2)),
    progress: 0,
    predecessorId: prev?.id || '',
    dependencyType: 'FS',
    notes: '',
  };
}

function buildChildrenMap(tasks) {
  const map = new Map();
  tasks.forEach(task => {
    const key = task.parentId || '';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(task);
  });
  return map;
}

function subtreeIds(tasks, rootId) {
  const byParent = buildChildrenMap(tasks);
  const result = new Set();
  const visit = (id) => {
    if (result.has(id)) return;
    result.add(id);
    (byParent.get(id) || []).forEach(child => visit(child.id));
  };
  visit(rootId);
  return result;
}

// Height (in levels) of the deepest descendant under rootId, 0 if it's a leaf.
function getSubtreeHeight(tasks, rootId) {
  const byParent = buildChildrenMap(tasks);
  let max = 0;
  const visit = (id, depth, visited) => {
    if (visited.has(id)) return;
    visited.add(id);
    max = Math.max(max, depth);
    (byParent.get(id) || []).forEach(child => visit(child.id, depth + 1, visited));
  };
  visit(rootId, 0, new Set());
  return max;
}

// Would attaching movingIds (with their existing subtrees) under newParentId
// push any branch past MAX_HIERARCHY_LEVELS?
function exceedsMaxDepth(tasks, movingIds, newParentId) {
  const taskMapById = new Map(tasks.map(task => [task.id, task]));
  const baseDepth = newParentId ? getTaskDepth(newParentId, taskMapById) + 1 : 0;
  return movingIds.some(id => baseDepth + getSubtreeHeight(tasks, id) > MAX_HIERARCHY_LEVELS - 1);
}

function assignHierarchicalWbs(tasks) {
  const byParent = buildChildrenMap(tasks);
  const wbsMap = new Map();
  const visited = new Set();
  const visit = (parentKey, prefix) => {
    (byParent.get(parentKey) || []).forEach((child, index) => {
      if (visited.has(child.id)) return;
      visited.add(child.id);
      const wbs = prefix ? `${prefix}.${index + 1}` : `${index + 1}`;
      wbsMap.set(child.id, wbs);
      visit(child.id, wbs);
    });
  };
  visit('', '');
  return tasks.map(task => ({ ...task, wbs: wbsMap.get(task.id) || task.wbs }));
}

function flattenByHierarchy(tasks) {
  const byParent = buildChildrenMap(tasks);
  const visited = new Set();
  const result = [];
  const visit = (parentKey) => {
    (byParent.get(parentKey) || []).forEach(child => {
      if (visited.has(child.id)) return;
      visited.add(child.id);
      result.push(child);
      visit(child.id);
    });
  };
  visit('');
  tasks.forEach(task => {
    if (!visited.has(task.id)) {
      visited.add(task.id);
      result.push({ ...task, parentId: '' });
    }
  });
  return result;
}

// Subtrees must stay contiguous for stable drag-and-drop ordering and WBS numbering.
function normalizeTaskOrder(tasks) {
  return assignHierarchicalWbs(flattenByHierarchy(tasks));
}

function getTaskDepth(taskId, taskMapById) {
  let depth = 0;
  let current = taskMapById.get(taskId);
  const visited = new Set();
  while (current?.parentId && !visited.has(current.id)) {
    visited.add(current.id);
    const parent = taskMapById.get(current.parentId);
    if (!parent) break;
    depth += 1;
    current = parent;
  }
  return depth;
}

function derivePhaseValues(tasks, settings) {
  const withWbs = assignHierarchicalWbs(tasks);
  const taskMapById = new Map(withWbs.map(task => [task.id, task]));
  const byParent = buildChildrenMap(withWbs);
  const leafDescendants = (id, visited = new Set()) => {
    if (visited.has(id)) return [];
    visited.add(id);
    return (byParent.get(id) || []).flatMap(child => (
      child.type === 'phase' ? leafDescendants(child.id, visited) : [child]
    ));
  };

  return withWbs.map(task => {
    const depth = getTaskDepth(task.id, taskMapById);
    if (task.type !== 'phase') return { ...task, _depth: depth };
    const children = leafDescendants(task.id).filter(item => parseDate(item.start) && parseDate(item.end));
    if (!children.length) return { ...task, _depth: depth };
    const start = new Date(Math.min(...children.map(item => parseDate(item.start))));
    const end = new Date(Math.max(...children.map(item => parseDate(item.end))));
    const totalDuration = children.reduce((sum, item) => sum + taskDuration(item, settings), 0);
    const weightedProgress = children.reduce((sum, item) => sum + (Number(item.progress) || 0) * taskDuration(item, settings), 0);
    return {
      ...task,
      _depth: depth,
      start: iso(start),
      end: iso(end),
      progress: totalDuration ? Math.round(weightedProgress / totalDuration) : Number(task.progress) || 0,
    };
  });
}

function getPhaseChildren(tasks, phaseId) {
  return tasks.filter(task => task.parentId === phaseId);
}

function findParentPhase(tasks, selectedId) {
  const selected = tasks.find(task => task.id === selectedId);
  if (selected?.type === 'phase') return selected;
  if (selected?.parentId) {
    const parent = tasks.find(task => task.id === selected.parentId);
    if (parent) return parent;
  }
  return [...tasks].reverse().find(task => task.type === 'phase') || null;
}

function lastDescendantIndex(tasks, rootId) {
  const ids = subtreeIds(tasks, rootId);
  let last = tasks.findIndex(task => task.id === rootId);
  tasks.forEach((task, index) => {
    if (ids.has(task.id) && index > last) last = index;
  });
  return last;
}

// Migrates projects saved before the parentId field existed, preserving the old
// single-level "nearest preceding phase" grouping as the initial hierarchy.
function migrateLegacyHierarchy(tasks) {
  if (!tasks.length || tasks.every(task => task.parentId !== undefined)) return tasks;
  let currentPhaseId = '';
  return tasks.map(task => {
    if (task.parentId !== undefined) return task;
    if (task.type === 'phase') {
      currentPhaseId = task.id;
      return { ...task, parentId: '' };
    }
    return { ...task, parentId: currentPhaseId };
  });
}

function makeRevision(id, label, tasks = []) {
  return { id, label, tasks };
}

function normalizeProject(project) {
  const sourceTasks = Array.isArray(project.tasks) ? project.tasks : [];
  const revisions = Array.isArray(project.revisions) && project.revisions.length
    ? project.revisions
    : [makeRevision('rev-0', project.revision || 'Rev. 0', sourceTasks)];
  const normalized = revisions.map(revision => ({
    ...revision,
    tasks: normalizeTaskOrder(migrateLegacyHierarchy(revision.tasks || [])),
  }));
  for (let index = normalized.length; index < 3; index++) {
    normalized.push(makeRevision(`rev-${index}`, `Rev. ${index}`, []));
  }
  return {
    ...project,
    revisions: normalized,
    activeRevisionId: project.activeRevisionId || normalized[0].id,
    tasks: undefined,
    revision: undefined,
  };
}

function getActiveRevision(project) {
  if (!project) return null;
  return project.revisions.find(revision => revision.id === project.activeRevisionId) || project.revisions[0];
}

function rowHeight(task) {
  return task.type === 'phase' ? PHASE_ROW_H : TASK_ROW_H;
}

function printRowHeight(task) {
  return task.type === 'phase' ? PRINT_PHASE_ROW_H : PRINT_TASK_ROW_H;
}

function rowTop(tasks, index) {
  return tasks.slice(0, index).reduce((sum, task) => sum + rowHeight(task), 0);
}

function getWorkdays(settings = DEFAULT_SETTINGS) {
  if (Array.isArray(settings.workdays) && settings.workdays.length) {
    return settings.workdays.map(Number).filter(day => day >= 0 && day <= 6);
  }
  return settings.weekendsAsWorkdays ? [0, 1, 2, 3, 4, 5, 6] : DEFAULT_SETTINGS.workdays;
}

function normalizeHolidays(holidays = []) {
  return Array.isArray(holidays)
    ? holidays
        .map(item => (typeof item === 'string' ? { date: item, name: '' } : item))
        .filter(item => item?.date)
    : [];
}

function normalizeExtraWorkdays(extraWorkdays = []) {
  return Array.isArray(extraWorkdays)
    ? extraWorkdays
        .map(item => (typeof item === 'string' ? { date: item, name: '' } : item))
        .filter(item => item?.date)
    : [];
}

function isHoliday(date, settings = DEFAULT_SETTINGS) {
  const day = iso(date);
  return normalizeHolidays(settings.holidays).some(item => item.date === day);
}

function isExtraWorkday(date, settings = DEFAULT_SETTINGS) {
  const day = iso(date);
  return normalizeExtraWorkdays(settings.extraWorkdays).some(item => item.date === day);
}

function isWorkday(date, settings = DEFAULT_SETTINGS) {
  if (isHoliday(date, settings)) return false;
  return getWorkdays(settings).includes(date.getDay()) || isExtraWorkday(date, settings);
}

function taskDuration(task, settings = DEFAULT_SETTINGS) {
  const start = parseDate(task.start);
  const end = parseDate(task.end);
  if (!start || !end) return 1;
  let total = 0;
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    if (isWorkday(cursor, settings)) total += 1;
  }
  return Math.max(1, total);
}

function getInitialSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}


function getCriticalPath(tasks, settings) {
  const taskList = tasks.filter(task => task.type !== 'phase');
  const taskMap = new Map(taskList.map(task => [task.id, task]));
  const memo = new Map();

  const resolve = (task, visiting = new Set()) => {
    if (memo.has(task.id)) return memo.get(task.id);
    // predecessorId can form a cycle (e.g. manually picked in the modal) — without
    // this guard the recursion below blows the call stack.
    if (visiting.has(task.id)) return { duration: 0, path: [] };
    visiting.add(task.id);
    const taskIndex = taskList.findIndex(item => item.id === task.id);
    const fallbackPredecessor = taskIndex > 0 ? taskList[taskIndex - 1] : null;
    const predecessor = task.predecessorId !== task.id ? (taskMap.get(task.predecessorId) || fallbackPredecessor) : null;
    const base = predecessor ? resolve(predecessor, visiting) : { duration: 0, path: [] };
    const result = {
      duration: base.duration + taskDuration(task, settings),
      path: [...base.path, task.id],
    };
    memo.set(task.id, result);
    return result;
  };

  let best = { duration: 0, path: [] };
  taskList.forEach(task => {
    const result = resolve(task);
    const taskEnd = parseDate(task.end);
    const bestEnd = best.path.length ? parseDate(taskMap.get(best.path.at(-1))?.end) : null;
    if (
      result.duration > best.duration ||
      (result.duration === best.duration && taskEnd && (!bestEnd || taskEnd > bestEnd))
    ) {
      best = result;
    }
  });
  return new Set(best.path);
}

function TaskModal({ task, tasks, onClose, onSave }) {
  const [draft, setDraft] = useState(task);
  useEffect(() => {
    setDraft(task);
  }, [task]);
  if (!task) return null;

  const set = (field, value) => setDraft(prev => ({ ...(prev || task || {}), [field]: value }));
  const startDate = parseDate(draft?.start);
  const endDate = parseDate(draft?.end);
  const duration = startDate && endDate ? Math.max(1, daysBetween(startDate, endDate) + 1) : 1;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal schedule-modal" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Editar atividade</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="schedule-form-grid">
            <label className="form-group">
              <span className="form-label">WBS</span>
              <input className="form-input" value={draft?.wbs || ''} onChange={e => set('wbs', e.target.value)} />
            </label>
            <label className="form-group">
              <span className="form-label">Tipo</span>
              <select className="form-select" value={draft?.type || 'task'} onChange={e => set('type', e.target.value)}>
                <option value="task">Atividade</option>
                <option value="phase">Atividade Macro</option>
                <option value="milestone">Marco</option>
              </select>
            </label>
          </div>
          <label className="form-group">
            <span className="form-label">Nome</span>
            <input className="form-input" value={draft?.name || ''} onChange={e => set('name', e.target.value)} />
          </label>
          <label className="form-group">
            <span className="form-label">Atividade macro pai</span>
            <select className="form-select" value={draft?.parentId || ''} onChange={e => set('parentId', e.target.value)}>
              <option value="">Nível superior (sem pai)</option>
              {tasks
                .filter(item => item.type === 'phase' && item.id !== draft?.id && !subtreeIds(tasks, draft?.id || '').has(item.id))
                .filter(item => !exceedsMaxDepth(tasks, [draft?.id || ''], item.id))
                .map(item => (
                  <option key={item.id} value={item.id}>{item.wbs} - {item.name}</option>
                ))}
            </select>
          </label>
          <div className="schedule-form-grid">
            <label className="form-group">
              <span className="form-label">Início</span>
              <input className="form-input" type="date" value={draft?.start || ''} onChange={e => set('start', e.target.value)} />
            </label>
            <label className="form-group">
              <span className="form-label">Término</span>
              <input className="form-input" type="date" value={draft?.end || ''} onChange={e => set('end', e.target.value)} />
            </label>
            <label className="form-group">
              <span className="form-label">Duração</span>
              <input className="form-input" value={`${duration} dia${duration === 1 ? '' : 's'}`} disabled />
            </label>
          </div>
          <div className="schedule-form-grid">
            <label className="form-group">
              <span className="form-label">Progresso (%)</span>
              <input className="form-input" type="number" min="0" max="100" value={draft?.progress ?? 0} onChange={e => set('progress', e.target.value)} />
            </label>
            <label className="form-group">
              <span className="form-label">Predecessora</span>
              <select className="form-select" value={draft?.predecessorId || ''} onChange={e => set('predecessorId', e.target.value)}>
                <option value="">Sem vínculo</option>
                {tasks.filter(item => item.id !== draft?.id).map(item => (
                  <option key={item.id} value={item.id}>{item.wbs} - {item.name}</option>
                ))}
              </select>
            </label>
            <label className="form-group">
              <span className="form-label">Relação</span>
              <select className="form-select" value={draft?.dependencyType || 'FS'} onChange={e => set('dependencyType', e.target.value)}>
                <option value="FS">Fim-Início</option>
                <option value="SS">Início-Início</option>
                <option value="FF">Fim-Fim</option>
              </select>
            </label>
          </div>
          <label className="form-group">
            <span className="form-label">Notas</span>
            <textarea className="form-textarea" value={draft?.notes || ''} onChange={e => set('notes', e.target.value)} />
          </label>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => draft && onSave({ ...draft, progress: Math.max(0, Math.min(100, Number(draft.progress) || 0)) })}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

function ScheduleSettingsModal({ open, settings, onChange, onClose }) {
  const [holidayDraft, setHolidayDraft] = useState({ date: '', name: '' });
  const [extraWorkdayDraft, setExtraWorkdayDraft] = useState({ date: '', name: '' });
  if (!open) return null;
  const set = (field, value) => onChange({ ...settings, [field]: value });
  const workdays = getWorkdays(settings);
  const holidays = normalizeHolidays(settings.holidays);
  const extraWorkdays = normalizeExtraWorkdays(settings.extraWorkdays);
  const toggleWorkday = (day) => {
    const next = workdays.includes(day)
      ? workdays.filter(item => item !== day)
      : [...workdays, day].sort((a, b) => a - b);
    if (next.length) set('workdays', next);
  };
  const addHoliday = () => {
    if (!holidayDraft.date || holidays.some(item => item.date === holidayDraft.date)) return;
    onChange({
      ...settings,
      holidays: [...holidays, { date: holidayDraft.date, name: holidayDraft.name.trim() }],
      extraWorkdays: extraWorkdays.filter(item => item.date !== holidayDraft.date),
    });
    setHolidayDraft({ date: '', name: '' });
  };
  const removeHoliday = (date) => set('holidays', holidays.filter(item => item.date !== date));
  const addExtraWorkday = () => {
    if (!extraWorkdayDraft.date || extraWorkdays.some(item => item.date === extraWorkdayDraft.date)) return;
    onChange({
      ...settings,
      extraWorkdays: [...extraWorkdays, { date: extraWorkdayDraft.date, name: extraWorkdayDraft.name.trim() }],
      holidays: holidays.filter(item => item.date !== extraWorkdayDraft.date),
    });
    setExtraWorkdayDraft({ date: '', name: '' });
  };
  const removeExtraWorkday = (date) => set('extraWorkdays', extraWorkdays.filter(item => item.date !== date));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal schedule-settings-modal" onClick={event => event.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Configurações do cronograma</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <section className="schedule-settings-section">
            <div>
              <strong>Dias úteis</strong>
              <small>Selecione quais dias entram no cálculo de duração.</small>
            </div>
            <div className="schedule-workday-grid">
              {WEEKDAYS.map(([value, label]) => {
                const day = Number(value);
                return (
                  <button
                    key={value}
                    type="button"
                    className={`schedule-workday-btn ${workdays.includes(day) ? 'active' : ''}`}
                    onClick={() => toggleWorkday(day)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </section>
          <section className="schedule-settings-section">
            <div>
              <strong>Feriados</strong>
              <small>Dias cadastrados não entram no cálculo do cronograma.</small>
            </div>
            <div className="schedule-holiday-form">
              <input
                className="form-input"
                type="date"
                value={holidayDraft.date}
                onChange={event => setHolidayDraft(prev => ({ ...prev, date: event.target.value }))}
              />
              <input
                className="form-input"
                placeholder="Nome do feriado"
                value={holidayDraft.name}
                onChange={event => setHolidayDraft(prev => ({ ...prev, name: event.target.value }))}
              />
              <button className="btn btn-secondary" type="button" onClick={addHoliday}>Adicionar</button>
            </div>
            {holidays.length > 0 && (
              <div className="schedule-holiday-list">
                {holidays.map(item => (
                  <span key={item.date} className="schedule-holiday-item">
                    {formatDate(item.date)} {item.name ? `- ${item.name}` : ''}
                    <button type="button" onClick={() => removeHoliday(item.date)}>×</button>
                  </span>
                ))}
              </div>
            )}
          </section>
          <section className="schedule-settings-section">
            <div>
              <strong>Dias úteis extras</strong>
              <small>Inclua datas específicas de trabalho sem alterar a regra semanal.</small>
            </div>
            <div className="schedule-holiday-form">
              <input
                className="form-input"
                type="date"
                value={extraWorkdayDraft.date}
                onChange={event => setExtraWorkdayDraft(prev => ({ ...prev, date: event.target.value }))}
              />
              <input
                className="form-input"
                placeholder="Nome do dia trabalhado"
                value={extraWorkdayDraft.name}
                onChange={event => setExtraWorkdayDraft(prev => ({ ...prev, name: event.target.value }))}
              />
              <button className="btn btn-secondary" type="button" onClick={addExtraWorkday}>Adicionar</button>
            </div>
            {extraWorkdays.length > 0 && (
              <div className="schedule-holiday-list">
                {extraWorkdays.map(item => (
                  <span key={item.date} className="schedule-extra-workday-item">
                    {formatDate(item.date)} {item.name ? `- ${item.name}` : ''}
                    <button type="button" onClick={() => removeExtraWorkday(item.date)}>×</button>
                  </span>
                ))}
              </div>
            )}
          </section>
          <label className="schedule-settings-option">
            <input
              type="checkbox"
              checked={settings.showToday}
              onChange={event => set('showToday', event.target.checked)}
            />
            <span>
              <strong>Destacar o dia atual</strong>
              <small>Mantém a coluna de hoje realçada no Gantt.</small>
            </span>
          </label>
          <label className="schedule-settings-option">
            <input
              type="checkbox"
              checked={settings.shadeWeekends}
              onChange={event => set('shadeWeekends', event.target.checked)}
            />
            <span>
              <strong>Sombrear dias não úteis</strong>
              <small>Pinta dias fora da seleção e feriados para facilitar a leitura.</small>
            </span>
          </label>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={onClose}>Concluir</button>
        </div>
      </div>
    </div>
  );
}

export default function ScheduleProjectPage() {
  const { user } = useAuth();
  const { confirm, warning } = useToast();
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [lastSelectedId, setLastSelectedId] = useState('');
  const [undoStack, setUndoStack] = useState([]);
  const [editingTask, setEditingTask] = useState(null);
  const [zoom, setZoom] = useState('day');
  const [showCriticalPath, setShowCriticalPath] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scheduleSettings, setScheduleSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [loadingError, setLoadingError] = useState('');
  const [saveState, setSaveState] = useState('idle');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const nameInputRef = useRef(null);
  const ganttScrollRef = useRef(null);
  const ganttDragRef = useRef({ active: false, moved: false, captured: false, startX: 0, scrollLeft: 0, pointerId: null });

  const project = projects.find(item => item.id === projectId) || projects[0];
  const activeRevision = getActiveRevision(project);
  const rawTasks = activeRevision?.tasks || [];
  const tasks = useMemo(() => derivePhaseValues(rawTasks, scheduleSettings), [rawTasks, scheduleSettings]);
  const bodyHeight = SUMMARY_ROW_H + tasks.reduce((sum, task) => sum + rowHeight(task), 0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        setLoadingError('');
        const [projectsRes, settingsRes] = await Promise.all([
          api.get('/schedule-projects'),
          api.get('/schedule-projects/settings/me'),
        ]);

        const remoteProjects = (projectsRes.data || []).map(normalizeProject);

        if (!alive) return;
        setProjects(remoteProjects);
        setProjectId(remoteProjects[0]?.id || '');
        setScheduleSettings({ ...DEFAULT_SETTINGS, ...(settingsRes.data || {}) });
        setLoaded(true);
      } catch (err) {
        if (!alive) return;
        setLoadingError(err.response?.data?.error || 'Erro ao carregar cronogramas');
        setProjects([normalizeProject(demoProject)]);
        setProjectId(demoProject.id);
        setLoaded(true);
      }
    };
    load();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!loaded || !project) return;
    const timer = setTimeout(async () => {
      try {
        setSaveState('saving');
        await api.put(`/schedule-projects/${encodeURIComponent(project.id)}`, project);
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [loaded, project]);

  useEffect(() => {
    window._scheduleCreateProject = createProject;
    window._schedulePrint = () => window.print();
    window._scheduleDeleteProject = deleteProject;
    return () => {
      delete window._scheduleCreateProject;
      delete window._schedulePrint;
      delete window._scheduleDeleteProject;
    };
  }, [project]);

  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(async () => {
      try {
        await api.put('/schedule-projects/settings/me', scheduleSettings);
      } catch {}
    }, 500);
    return () => clearTimeout(timer);
  }, [loaded, scheduleSettings]);

  const range = useMemo(() => {
    const dated = tasks.filter(task => parseDate(task.start) && parseDate(task.end));
    if (!dated.length) return { start: addDays(TODAY, -2), end: addDays(TODAY, 30) };
    const starts = dated.map(task => parseDate(task.start));
    const ends = dated.map(task => parseDate(task.end));
    return {
      start: addDays(new Date(Math.min(...starts)), -2),
      end: addDays(new Date(Math.max(...ends)), 4),
    };
  }, [tasks]);

  const colWidth = zoom === 'month' ? 12 : zoom === 'week' ? 20 : 28;
  const days = Math.max(1, daysBetween(range.start, range.end) + 1);
  const dayList = Array.from({ length: days }, (_, index) => addDays(range.start, index));
  const totalWidth = days * colWidth;
  const summary = useMemo(() => {
    const datedTasks = tasks.filter(task => parseDate(task.start) && parseDate(task.end));
    if (!datedTasks.length) return { start: null, end: null, progress: 0, duration: 0 };
    const start = new Date(Math.min(...datedTasks.map(task => parseDate(task.start))));
    const end = new Date(Math.max(...datedTasks.map(task => parseDate(task.end))));
    const progressTasks = tasks.filter(task => task.type !== 'phase' && parseDate(task.start) && parseDate(task.end));
    const totalDuration = progressTasks.reduce((sum, task) => sum + taskDuration(task, scheduleSettings), 0);
    const weightedProgress = progressTasks.reduce((sum, task) => sum + (Number(task.progress) || 0) * taskDuration(task, scheduleSettings), 0);
    return {
      start: iso(start),
      end: iso(end),
      duration: taskDuration({ start: iso(start), end: iso(end) }, scheduleSettings),
      calendarDuration: daysBetween(start, end) + 1,
      progress: totalDuration ? Math.round(weightedProgress / totalDuration) : 0,
    };
  }, [tasks, scheduleSettings]);

  const criticalPathIds = useMemo(
    () => getCriticalPath(tasks, scheduleSettings),
    [tasks, scheduleSettings]
  );

  const dayClass = (day) => {
    const classes = [];
    const holiday = isHoliday(day, scheduleSettings);
    const extraWorkday = isExtraWorkday(day, scheduleSettings);
    if (scheduleSettings.shadeWeekends && !isWorkday(day, scheduleSettings)) classes.push('nonworkday');
    if (holiday) classes.push('holiday');
    if (extraWorkday) classes.push('extra-workday');
    if (scheduleSettings.showToday && iso(day) === iso(TODAY)) classes.push('today');
    return classes.join(' ');
  };

  const updateProject = (updater) => {
    setProjects(prev => prev.map(item => item.id === project.id ? updater(item) : item));
  };

  const updateRevision = (updater) => {
    setUndoStack(prev => [...prev.slice(-19), rawTasks.map(task => ({ ...task }))]);
    updateProject(item => ({
      ...item,
      revisions: item.revisions.map(revision =>
        revision.id === activeRevision.id ? updater(revision) : revision
      ),
    }));
  };

  const restoreTasks = (nextTasks) => {
    updateProject(item => ({
      ...item,
      revisions: item.revisions.map(revision =>
        revision.id === activeRevision.id ? { ...revision, tasks: nextTasks } : revision
      ),
    }));
  };

  const undoLast = () => {
    setUndoStack(prev => {
      const previousTasks = prev[prev.length - 1];
      if (!previousTasks) return prev;
      restoreTasks(previousTasks);
      setSelectedId('');
      setSelectedIds([]);
      return prev.slice(0, -1);
    });
  };

  const addTask = (type = 'task') => {
    const sourceTasks = activeRevision?.tasks || [];
    let parentPhase = type === 'task' ? findParentPhase(sourceTasks, selectedId) : null;
    if (parentPhase) {
      const taskMapById = new Map(sourceTasks.map(item => [item.id, item]));
      if (getTaskDepth(parentPhase.id, taskMapById) + 1 > MAX_HIERARCHY_LEVELS - 1) {
        warning(`Limite de ${MAX_HIERARCHY_LEVELS} níveis de hierarquia atingido.`);
        parentPhase = null;
      }
    }
    const siblingTasks = parentPhase ? getPhaseChildren(sourceTasks, parentPhase.id) : sourceTasks.filter(item => !item.parentId);
    const prev = siblingTasks[siblingTasks.length - 1] || sourceTasks[sourceTasks.length - 1];
    const start = prev?.end ? iso(addDays(parseDate(prev.end), 1)) : iso(TODAY);
    const task = {
      id: `task-${Date.now()}`,
      wbs: '',
      name: type === 'phase' ? 'Nova atividade macro' : 'Nova atividade',
      type,
      start,
      end: iso(addDays(parseDate(start), 2)),
      progress: 0,
      predecessorId: prev?.id || '',
      dependencyType: 'FS',
      notes: '',
      parentId: parentPhase ? parentPhase.id : '',
    };
    updateRevision(revision => {
      if (!parentPhase) return { ...revision, tasks: normalizeTaskOrder([...revision.tasks, task]) };
      const insertAt = lastDescendantIndex(revision.tasks, parentPhase.id) + 1;
      const nextTasks = [...revision.tasks];
      nextTasks.splice(insertAt, 0, task);
      return { ...revision, tasks: normalizeTaskOrder(nextTasks) };
    });
    setSelectedId(task.id);
    setSelectedIds([task.id]);
    setLastSelectedId(task.id);
    setEditingTask(task);
  };

  const selectTask = (taskId, event) => {
    if (event?.shiftKey && lastSelectedId) {
      const start = tasks.findIndex(task => task.id === lastSelectedId);
      const end = tasks.findIndex(task => task.id === taskId);
      if (start >= 0 && end >= 0) {
        const [from, to] = start < end ? [start, end] : [end, start];
        const ids = tasks.slice(from, to + 1).map(task => task.id);
        setSelectedIds(ids);
        setSelectedId(taskId);
        return;
      }
    }
    if (event?.ctrlKey || event?.metaKey) {
      setSelectedIds(prev => {
        const next = prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId];
        setSelectedId(next.at(-1) || '');
        return next;
      });
      setLastSelectedId(taskId);
      return;
    }
    setSelectedId(taskId);
    setSelectedIds([taskId]);
    setLastSelectedId(taskId);
  };

  // Click-and-drag panning of the Gantt timeline, mirroring WorkloadPage's Timeline.
  const handleGanttPointerDown = (event) => {
    if (event.button !== 0) return;
    const node = ganttScrollRef.current;
    if (!node) return;
    ganttDragRef.current = { active: true, moved: false, captured: false, startX: event.clientX, scrollLeft: node.scrollLeft, pointerId: event.pointerId };
  };

  const handleGanttPointerMove = (event) => {
    const drag = ganttDragRef.current;
    const node = ganttScrollRef.current;
    if (!drag.active || !node) return;
    const dx = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) > 3) {
      drag.moved = true;
      if (!drag.captured) {
        node.setPointerCapture?.(drag.pointerId);
        drag.captured = true;
      }
    }
    if (!drag.moved) return;
    node.scrollLeft = drag.scrollLeft - dx;
  };

  const stopGanttDrag = () => {
    const node = ganttScrollRef.current;
    const drag = ganttDragRef.current;
    if (node && drag.captured && drag.pointerId != null) node.releasePointerCapture?.(drag.pointerId);
    const moved = drag.moved;
    drag.active = false;
    drag.captured = false;
    window.setTimeout(() => { ganttDragRef.current.moved = false; }, moved ? 80 : 0);
  };

  const handleGanttRowClick = (taskId, event) => {
    if (ganttDragRef.current.moved) return;
    selectTask(taskId, event);
  };

  const handleGanttRowDoubleClick = (task) => {
    if (ganttDragRef.current.moved) return;
    setEditingTask(task);
  };

  const normalizeTaskOrder = (items) => {
    let topLevel = 0;
    let child = 0;
    let currentPhase = null;
    return items.map(item => {
      if (item.type === 'phase') {
        topLevel += 1;
        child = 0;
        const next = { ...item, wbs: String(topLevel) };
        currentPhase = next;
        return next;
      }
      if (currentPhase) {
        child += 1;
        return { ...item, wbs: `${currentPhase.wbs}.${child}` };
      }
      topLevel += 1;
      return { ...item, wbs: String(topLevel) };
    });
  };

  // Dropping near the top/bottom edge of a row reorders as a sibling at that row's level.
  const moveTasksTo = (targetId, position) => {
    const movingIds = selectedIds.length ? selectedIds : (selectedId ? [selectedId] : []);
    if (!targetId || !movingIds.length || movingIds.includes(targetId)) return;
    updateRevision(revision => {
      const target = revision.tasks.find(task => task.id === targetId);
      if (!target) return revision;
      const wouldCycle = movingIds.some(id => subtreeIds(revision.tasks, id).has(targetId));
      if (wouldCycle) return revision;
      const newParentId = target.parentId || '';
      if (exceedsMaxDepth(revision.tasks, movingIds, newParentId)) {
        warning(`Limite de ${MAX_HIERARCHY_LEVELS} níveis de hierarquia atingido.`);
        return revision;
      }
      const movingSet = new Set(movingIds);
      const moving = revision.tasks
        .filter(task => movingSet.has(task.id))
        .map(task => ({ ...task, parentId: newParentId }));
      const remaining = revision.tasks.filter(task => !movingSet.has(task.id));
      const targetIndex = remaining.findIndex(task => task.id === targetId);
      if (targetIndex < 0) return revision;
      const insertAt = position === 'before' ? targetIndex : targetIndex + 1;
      return { ...revision, tasks: normalizeTaskOrder([...remaining.slice(0, insertAt), ...moving, ...remaining.slice(insertAt)]) };
    });
  };

  // Dropping in the middle of a row nests the selection inside it, turning the
  // target into a macro (phase). Nested macros keep their own type/children,
  // so this supports arbitrary levels of hierarchy.
  const aggregateTasksInto = (targetId) => {
    const movingIds = selectedIds.length ? selectedIds : (selectedId ? [selectedId] : []);
    if (!targetId || !movingIds.length || movingIds.includes(targetId)) return;
    updateRevision(revision => {
      const target = revision.tasks.find(task => task.id === targetId);
      if (!target) return revision;
      const wouldCycle = movingIds.some(id => subtreeIds(revision.tasks, id).has(targetId));
      if (wouldCycle) return revision;
      if (exceedsMaxDepth(revision.tasks, movingIds, targetId)) {
        warning(`Limite de ${MAX_HIERARCHY_LEVELS} níveis de hierarquia atingido.`);
        return revision;
      }
      const movingSet = new Set(movingIds);
      const nextTasks = revision.tasks.map(task => {
        if (task.id === targetId) return { ...task, type: 'phase' };
        if (movingSet.has(task.id)) return { ...task, parentId: targetId };
        return task;
      });
      return { ...revision, tasks: normalizeTaskOrder(nextTasks) };
    });
  };

  const handleTaskDragStart = (taskId, event) => {
    if (!selectedIds.includes(taskId)) selectTask(taskId, event);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', taskId);
  };

  const handleTaskDrop = (targetId, event) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const offset = event.clientY - rect.top;
    if (offset < rect.height * 0.3) moveTasksTo(targetId, 'before');
    else if (offset > rect.height * 0.7) moveTasksTo(targetId, 'after');
    else aggregateTasksInto(targetId);
  };

  const saveTask = (task) => {
    updateRevision(revision => {
      const wouldCycle = task.parentId && subtreeIds(revision.tasks, task.id).has(task.parentId);
      const wouldExceedDepth = task.parentId && exceedsMaxDepth(revision.tasks, [task.id], task.parentId);
      if (wouldExceedDepth) warning(`Limite de ${MAX_HIERARCHY_LEVELS} níveis de hierarquia atingido.`);
      const safeTask = (wouldCycle || wouldExceedDepth) ? { ...task, parentId: '' } : task;
      const nextTasks = revision.tasks.map(existing => existing.id === safeTask.id ? safeTask : existing);
      return { ...revision, tasks: normalizeTaskOrder(nextTasks) };
    });
    setEditingTask(null);
  };

  const deleteTask = (taskId) => {
    if (!taskId) return;
    const deleteIds = selectedIds.length && selectedIds.includes(taskId) ? selectedIds : [taskId];
    const deleteSet = new Set(deleteIds);
    updateRevision(revision => {
      // Children of a deleted phase are promoted to its parent instead of vanishing.
      const promotedParentOf = new Map(deleteIds.map(id => [id, revision.tasks.find(task => task.id === id)?.parentId || '']));
      const nextTasks = revision.tasks
        .filter(task => !deleteSet.has(task.id))
        .map(task => {
          let next = task;
          if (deleteSet.has(next.predecessorId)) next = { ...next, predecessorId: '' };
          if (deleteSet.has(next.parentId)) next = { ...next, parentId: promotedParentOf.get(next.parentId) || '' };
          return next;
        });
      return { ...revision, tasks: normalizeTaskOrder(nextTasks) };
    });
    setSelectedId('');
    setSelectedIds([]);
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = event.target?.tagName?.toLowerCase();
      if (['input', 'select', 'textarea'].includes(tag) || event.target?.isContentEditable) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !editingTask && !settingsOpen) {
        event.preventDefault();
        undoLast();
        return;
      }
      if (event.key !== 'Delete' || !selectedId || editingTask || settingsOpen) return;
      event.preventDefault();
      deleteTask(selectedId);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId, selectedIds, editingTask, settingsOpen, undoStack, rawTasks]);

  const importRevision = async (sourceRevisionId) => {
    if (!sourceRevisionId || sourceRevisionId === activeRevision.id) return;
    const source = project.revisions.find(revision => revision.id === sourceRevisionId);
    if (!source) return;
    if (tasks.length > 0 && !await confirm({
      title: 'Substituir tarefas',
      message: `Substituir as tarefas da ${activeRevision.label} pela base da ${source.label}?`,
      confirmLabel: 'Substituir',
      variant: 'warning',
    })) return;

    const copiedTasks = source.tasks.map(task => ({ ...task }));
    updateRevision(revision => ({ ...revision, tasks: copiedTasks }));
    setSelectedId('');
    setSelectedIds([]);
  };

  const createProject = () => {
    const next = {
      id: `project-${Date.now()}`,
      name: 'Novo cronograma',
      plant: '',
      description: '',
      activeRevisionId: 'rev-0',
      revisions: [
        makeRevision('rev-0', 'Rev. 0', []),
        makeRevision('rev-1', 'Rev. 1', []),
        makeRevision('rev-2', 'Rev. 2', []),
      ],
    };
    setProjects(prev => [...prev, next]);
    setProjectId(next.id);
    setSelectedId('');
    setSelectedIds([]);
    setUndoStack([]);
  };

  const deleteProject = async () => {
    if (!project) return;
    if (!await confirm({
      title: 'Excluir cronograma',
      message: `Excluir o cronograma "${project.name}" e todas as suas revisoes?`,
      confirmLabel: 'Excluir',
    })) return;
    try {
      const res = await api.delete(`/schedule-projects/${encodeURIComponent(project.id)}`);
      const remoteProjects = (res.data || []).map(normalizeProject);
      setProjects(remoteProjects);
      setProjectId(remoteProjects[0]?.id || '');
      setSelectedId('');
      setSelectedIds([]);
      setUndoStack([]);
    } catch (err) {
      setLoadingError(err.response?.data?.error || 'Erro ao excluir cronograma');
    }
  };

  const monthCells = [];
  dayList.forEach(day => {
    const key = `${day.getFullYear()}-${day.getMonth()}`;
    const last = monthCells[monthCells.length - 1];
    if (last?.key === key) last.count += 1;
    else monthCells.push({ key, count: 1, label: day.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) });
  });
  const printAvailableGanttWidth = PRINT_PAGE_WIDTH - PRINT_TASK_WIDTH;
  const printColWidth = Math.max(8, Math.min(colWidth, Math.floor(printAvailableGanttWidth / Math.max(dayList.length, 1))));
  const printTotalWidth = dayList.length * printColWidth;
  const printRows = [{ kind: 'summary' }, ...tasks.map(task => ({ kind: 'task', task }))];
  const printPages = [];
  let currentPrintPage = [];
  let currentPrintHeight = 0;
  printRows.forEach(row => {
    const rowH = row.kind === 'summary' ? PRINT_SUMMARY_ROW_H : printRowHeight(row.task);
    if (currentPrintPage.length && currentPrintHeight + rowH > PRINT_BODY_MAX_H) {
      printPages.push(currentPrintPage);
      currentPrintPage = [];
      currentPrintHeight = 0;
    }
    currentPrintPage.push(row);
    currentPrintHeight += rowH;
  });
  if (currentPrintPage.length) {
    printPages.push(currentPrintPage);
  }

  const dependencyLines = tasks.flatMap((task, rowIndex) => {
    const predecessor = tasks.find(item => item.id === task.predecessorId);
    if (!predecessor) return [];
    const fromDate = task.dependencyType === 'SS' ? predecessor.start : predecessor.end;
    const toDate = task.dependencyType === 'FF' ? task.end : task.start;
    const from = parseDate(fromDate);
    const to = parseDate(toDate);
    if (!from || !to) return [];
    const predecessorRow = tasks.findIndex(item => item.id === predecessor.id);
    const x1 = Math.max(0, daysBetween(range.start, from) * colWidth + colWidth / 2);
    const x2 = Math.max(0, daysBetween(range.start, to) * colWidth + colWidth / 2);
    const y1 = SUMMARY_ROW_H + rowTop(tasks, predecessorRow) + rowHeight(predecessor) / 2;
    const y2 = SUMMARY_ROW_H + rowTop(tasks, rowIndex) + rowHeight(task) / 2;
    return [{ id: `${predecessor.id}-${task.id}`, x1, x2, y1, y2 }];
  });

  const getPrintDependencyLines = (pageRows) => {
    let top = 0;
    const visibleRows = new Map();
    pageRows.forEach(row => {
      if (row.kind === 'summary') {
        top += PRINT_SUMMARY_ROW_H;
        return;
      }
      visibleRows.set(row.task.id, { task: row.task, top });
      top += printRowHeight(row.task);
    });
    return pageRows.flatMap(row => {
      if (row.kind !== 'task') return [];
      const task = row.task;
      const predecessorRow = visibleRows.get(task.predecessorId);
      const currentRow = visibleRows.get(task.id);
      if (!predecessorRow || !currentRow) return [];
      const fromDate = task.dependencyType === 'SS' ? predecessorRow.task.start : predecessorRow.task.end;
      const toDate = task.dependencyType === 'FF' ? task.end : task.start;
      const from = parseDate(fromDate);
      const to = parseDate(toDate);
      if (!from || !to) return [];
      return [{
        id: `print-${predecessorRow.task.id}-${task.id}`,
        x1: Math.max(0, daysBetween(range.start, from) * printColWidth + printColWidth / 2),
        x2: Math.max(0, daysBetween(range.start, to) * printColWidth + printColWidth / 2),
        y1: predecessorRow.top + printRowHeight(predecessorRow.task) / 2,
        y2: currentRow.top + printRowHeight(task) / 2,
      }];
    });
  };

  const stats = {
    total: tasks.filter(task => task.type !== 'phase').length,
    done: tasks.filter(task => task.type !== 'phase' && Number(task.progress) >= 100).length,
    late: tasks.filter(task => getStatus(task) === 'late').length,
    links: tasks.filter(task => task.predecessorId).length,
  };
  const generatedBy = user?.name || user?.email || 'Usuário não identificado';

  const startEditingName = () => {
    setNameDraft(project.name || '');
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 0);
  };
  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed) updateProject(item => ({ ...item, name: trimmed }));
    setEditingName(false);
  };

  if (!project) return <div className="schedule-page" />;

  return (
    <div className="schedule-page">
      <div className="schedule-summary no-print">
        <div className="schedule-info-main">
          <div className="schedule-summary-fields">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {editingName ? (
                <input
                  ref={nameInputRef}
                  className="schedule-project-name-select"
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
                  style={{ minWidth: 200 }}
                />
              ) : (
                <select className="schedule-project-name-select" value={project.id} onChange={e => { setProjectId(e.target.value); setSelectedId(''); setSelectedIds([]); setUndoStack([]); }}>
                  {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              )}
              <button
                onClick={editingName ? commitName : startEditingName}
                title="Renomear cronograma"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '3px 4px', color: '#94A3B8', display: 'flex', alignItems: 'center', borderRadius: 4, flexShrink: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = '#0b5cab'}
                onMouseLeave={e => e.currentTarget.style.color = '#94A3B8'}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                </svg>
              </button>
            </div>
            <div className="schedule-project-meta">
              <span className="schedule-meta-chip schedule-meta-chip-usina">
                <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11" style={{flexShrink:0}}>
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/>
                </svg>
                <input value={project.plant || ''} placeholder="Usina" onChange={e => updateProject(item => ({ ...item, plant: e.target.value }))} />
              </span>
              <span className="schedule-meta-chip">
                <input value={project.description || ''} placeholder="Descrição" onChange={e => updateProject(item => ({ ...item, description: e.target.value }))} />
              </span>
              <div className="schedule-revision-row">
                <div className="schedule-revision-tabs">
                  {project.revisions.map(revision => (
                    <button
                      key={revision.id}
                      className={revision.id === activeRevision.id ? 'active' : ''}
                      onClick={() => { setSelectedId(''); setSelectedIds([]); setUndoStack([]); updateProject(item => ({ ...item, activeRevisionId: revision.id })); }}
                    >
                      {revision.label}
                    </button>
                  ))}
                </div>
                <select
                  className="schedule-revision-import"
                  value=""
                  onChange={event => importRevision(event.target.value)}
                >
                  <option value="">Importar de...</option>
                  {project.revisions
                    .filter(revision => revision.id !== activeRevision.id)
                    .map(revision => (
                      <option key={revision.id} value={revision.id}>
                        {revision.label} ({revision.tasks.length} atividade{revision.tasks.length === 1 ? '' : 's'})
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>
        </div>
        <div className="schedule-stat-strip">
          <span>
            <svg className="schedule-stat-icon" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 4a1 1 0 000 2h14a1 1 0 100-2H3zm0 4a1 1 0 000 2h14a1 1 0 100-2H3zm0 4a1 1 0 000 2h8a1 1 0 100-2H3z" clipRule="evenodd"/></svg>
            <strong>{stats.total}</strong>Atividades
          </span>
          <span>
            <svg className="schedule-stat-icon" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
            <strong>{stats.done}</strong>Concluídas
          </span>
          <span>
            <svg className="schedule-stat-icon" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd"/></svg>
            <strong>{stats.late}</strong>Atrasadas
          </span>
          <span>
            <svg className="schedule-stat-icon" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd"/></svg>
            <strong>{stats.links}</strong>Vínculos
          </span>
        </div>
      </div>

      <div className="schedule-toolbar no-print">
        <div className="schedule-toolbar-group schedule-toolbar-actions" aria-label="Criar itens">
          <button className="btn btn-primary" onClick={() => addTask('phase')}>
            <span aria-hidden="true">+</span> Ativ. Macro
          </button>
          <button className="btn btn-primary" onClick={() => addTask('task')}>
            <span aria-hidden="true">+</span> Atividade
          </button>
        </div>
        <div className="schedule-toolbar-group">
          <div className="tabs schedule-zoom-tabs" aria-label="Escala do Gantt">
            {[
              ['day', 'Dia'],
              ['week', 'Semana'],
              ['month', 'Mês'],
            ].map(([id, label]) => (
              <button key={id} className={`tab-btn ${zoom === id ? 'active' : ''}`} onClick={() => setZoom(id)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="schedule-toolbar-group">
          <button className="schedule-settings-btn" onClick={() => setSettingsOpen(true)}>
            <span aria-hidden="true">⚙</span> Configurações
          </button>
          <label className="schedule-critical-toggle">
            <input
              type="checkbox"
              checked={showCriticalPath}
              onChange={event => setShowCriticalPath(event.target.checked)}
            />
            Caminho crítico
          </label>
        </div>
        <div className="schedule-toolbar-spacer" />
        <div className="schedule-toolbar-group schedule-legend">
          <span className="done" /> Concluída
          <span className="progress" /> Em andamento
          <span className="pending" /> Planejada
          <span className="late" /> Atrasada
        </div>
      </div>

      <div className="schedule-print-header">
        <div>
          <h1>{project.name}</h1>
          <p>{project.plant || 'CTG Brasil'} · {project.description || 'Cronograma de projeto'}</p>
        </div>
      </div>

      <div className="schedule-workspace">
        <div className="schedule-task-pane">
          <div className="schedule-grid schedule-header-row">
            <span>WBS</span><span>Atividade</span><span>Início</span><span>Término</span><span>%</span><span>Relação</span>
          </div>
          <div className="schedule-task-rows">
            {tasks.length === 0 && (
              <div className="empty-state schedule-empty">
                <h3>Nenhuma atividade cadastrada</h3>
                <p>Use os botões de atividade macro e atividade para montar o cronograma.</p>
              </div>
            )}
            <div className="schedule-grid schedule-task-row summary" style={{ height: SUMMARY_ROW_H }}>
              <span>-</span>
              <span className="schedule-task-name">Resumo do cronograma</span>
              <span>{formatDate(summary.start)}</span>
              <span>{formatDate(summary.end)}</span>
              <span><b className={`schedule-progress ${summary.progress >= 100 ? 'done' : summary.progress > 0 ? 'progress' : 'pending'}`}>{summary.progress}%</b></span>
              <span>{summary.duration ? `${summary.duration}d` : '-'}</span>
            </div>
            {tasks.map(task => {
              const predecessor = tasks.find(item => item.id === task.predecessorId);
              const status = getStatus(task);
              return (
                <button
                  key={task.id}
                  className={`schedule-grid schedule-task-row ${task.type} ${showCriticalPath && criticalPathIds.has(task.id) ? 'critical' : ''} ${selectedIds.includes(task.id) ? 'selected' : ''}`}
                  style={{ height: rowHeight(task) }}
                  draggable
                  onClick={event => selectTask(task.id, event)}
                  onDoubleClick={() => setEditingTask(task)}
                  onDragStart={event => handleTaskDragStart(task.id, event)}
                  onDragOver={event => event.preventDefault()}
                  onDrop={event => handleTaskDrop(task.id, event)}
                >
                  <span>{task.wbs}</span>
                  <span className="schedule-task-name" style={{ paddingLeft: (task._depth || 0) * 14 }}>
                    <i style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 2, marginRight: 6, background: getLevelColor(task._depth).fill, flexShrink: 0 }} />
                    {task.name}
                  </span>
                  <span>{formatDate(task.start)}</span>
                  <span>{formatDate(task.end)}</span>
                  <span><b className={`schedule-progress ${status}`}>{task.progress || 0}%</b></span>
                  <span className="schedule-link-cell">{predecessor ? `${predecessor.wbs} ${task.dependencyType}` : '-'}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="schedule-gantt-pane">
          <div
            className="schedule-gantt-scroll"
            ref={ganttScrollRef}
            onPointerDown={handleGanttPointerDown}
            onPointerMove={handleGanttPointerMove}
            onPointerUp={stopGanttDrag}
            onPointerCancel={stopGanttDrag}
            style={{ cursor: 'grab', userSelect: ganttDragRef.current.active ? 'none' : 'auto' }}
          >
            <div className="schedule-gantt-inner" style={{ width: totalWidth }}>
              <div className="schedule-gantt-months">
                {monthCells.map(cell => (
                  <div key={cell.key} style={{ width: cell.count * colWidth }}>{cell.label}</div>
                ))}
              </div>
              <div className="schedule-gantt-days">
                {dayList.map(day => (
                  <div key={iso(day)} className={dayClass(day)} style={{ width: colWidth }}>
                    {colWidth >= 20 ? day.getDate() : ''}
                  </div>
                ))}
              </div>
              <div className="schedule-gantt-body" style={{ height: bodyHeight }}>
                <svg className="schedule-dependency-layer" width={totalWidth} height={Math.max(1, bodyHeight)}>
                  <defs>
                    <marker id="scheduleArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                      <path d="M0,0 L8,4 L0,8 Z" fill="#64748B" />
                    </marker>
                  </defs>
                {dependencyLines.map(line => (
                    <path key={line.id} d={`M${line.x1} ${line.y1} L${line.x1 + 10} ${line.y1} L${line.x1 + 10} ${line.y2} L${line.x2} ${line.y2}`} markerEnd="url(#scheduleArrow)" />
                  ))}
                </svg>
                <div className="schedule-gantt-row summary" style={{ height: SUMMARY_ROW_H }}>
                  {dayList.map(day => (
                    <span key={iso(day)} className={dayClass(day)} style={{ width: colWidth }} />
                  ))}
                  {summary.start && summary.end && (
                    <div className="schedule-bar summary progress" style={{
                      left: daysBetween(range.start, parseDate(summary.start)) * colWidth,
                      width: Math.max(colWidth, (summary.calendarDuration || 1) * colWidth),
                    }}>
                      <i style={{ width: `${summary.progress}%` }} />
                      <em>{summary.progress}%</em>
                    </div>
                  )}
                </div>
                {tasks.map(task => {
                  const start = parseDate(task.start);
                  const end = parseDate(task.end);
                  const left = start ? daysBetween(range.start, start) * colWidth : 0;
                  const width = start && end ? Math.max(colWidth, (daysBetween(start, end) + 1) * colWidth) : colWidth;
                  const status = getStatus(task);
                  const levelColor = getLevelColor(task._depth);
                  const isCritical = showCriticalPath && criticalPathIds.has(task.id);
                  const barShadow = [status === 'late' ? 'inset 3px 0 0 0 #DC2626' : '', isCritical ? '0 0 0 3px rgba(245,158,11,.35)' : '', '0 1px 2px rgba(0,31,91,.15)'].filter(Boolean).join(', ');
                  return (
                    <div
                      key={task.id}
                      className={`schedule-gantt-row ${task.type} ${selectedIds.includes(task.id) ? 'selected' : ''}`}
                      style={{ height: rowHeight(task) }}
                      onClick={event => handleGanttRowClick(task.id, event)}
                      onDoubleClick={() => handleGanttRowDoubleClick(task)}
                      onDragOver={event => event.preventDefault()}
                      onDrop={event => handleTaskDrop(task.id, event)}
                    >
                      {dayList.map(day => (
                        <span key={iso(day)} className={dayClass(day)} style={{ width: colWidth }} />
                      ))}
                      {start && end && (
                        <div className={`schedule-bar ${task.type} ${isCritical ? 'critical' : ''}`} style={{ left, width, backgroundColor: levelColor.bg, boxShadow: barShadow }}>
                          <i style={{ width: `${task.progress || 0}%`, backgroundColor: levelColor.fill }} />
                          <em style={{ color: levelColor.text, textShadow: 'none' }}>{task.type === 'phase' ? task.name : `${task.progress || 0}%`}</em>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="schedule-print-pages">
        {printPages.map((pageRows, pageIndex) => {
          const pageHeight = pageRows.reduce((sum, row) => sum + (row.kind === 'summary' ? PRINT_SUMMARY_ROW_H : printRowHeight(row.task)), 0);
          const printDependencyLines = getPrintDependencyLines(pageRows);
          return (
            <section className="schedule-print-page" key={`print-page-${pageIndex}`}>
              <div className="schedule-print-header">
                <div>
                  <h1>{project.name}</h1>
                  <p>{project.plant || 'CTG Brasil'} · {project.description || 'Cronograma de projeto'}</p>
                </div>
              </div>
              <div className="schedule-workspace schedule-print-workspace" style={{ gridTemplateColumns: `${PRINT_TASK_WIDTH}px ${printTotalWidth}px` }}>
                  <div className="schedule-task-pane">
                  <div className="schedule-grid schedule-header-row schedule-print-grid">
                    <span>WBS</span><span>Atividade</span><span>Início</span><span>Término</span><span>%</span>
                  </div>
                  <div className="schedule-task-rows">
                    {pageRows.map(row => {
                      if (row.kind === 'summary') {
                        return (
                          <div key="print-summary" className="schedule-grid schedule-task-row summary schedule-print-grid" style={{ height: PRINT_SUMMARY_ROW_H }}>
                            <span>-</span>
                            <span className="schedule-task-name">Resumo do cronograma</span>
                            <span>{formatDate(summary.start)}</span>
                            <span>{formatDate(summary.end)}</span>
                            <span><b className={`schedule-progress ${summary.progress >= 100 ? 'done' : summary.progress > 0 ? 'progress' : 'pending'}`}>{summary.progress}%</b></span>
                          </div>
                        );
                      }
                      const task = row.task;
                      const status = getStatus(task);
                      return (
                        <div
                          key={`print-task-${task.id}`}
                          className={`schedule-grid schedule-task-row schedule-print-grid ${task.type} ${showCriticalPath && criticalPathIds.has(task.id) ? 'critical' : ''}`}
                          style={{ height: printRowHeight(task) }}
                        >
                          <span>{task.wbs}</span>
                          <span className="schedule-task-name" style={{ paddingLeft: (task._depth || 0) * 14 }}>
                    <i style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 2, marginRight: 6, background: getLevelColor(task._depth).fill, flexShrink: 0 }} />
                    {task.name}
                  </span>
                          <span>{formatDate(task.start)}</span>
                          <span>{formatDate(task.end)}</span>
                          <span><b className={`schedule-progress ${status}`}>{task.progress || 0}%</b></span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="schedule-gantt-pane">
                  <div className="schedule-gantt-scroll">
                    <div className="schedule-gantt-inner" style={{ width: printTotalWidth }}>
                      <div className="schedule-gantt-months">
                        {monthCells.map(cell => (
                          <div key={`print-month-${pageIndex}-${cell.key}`} style={{ width: cell.count * printColWidth }}>{cell.label}</div>
                        ))}
                      </div>
                      <div className="schedule-gantt-days">
                        {dayList.map(day => (
                          <div key={`print-day-${pageIndex}-${iso(day)}`} className={dayClass(day)} style={{ width: printColWidth }}>
                            {printColWidth >= 10 ? day.getDate() : ''}
                          </div>
                        ))}
                      </div>
                      <div className="schedule-gantt-body" style={{ height: pageHeight }}>
                        <svg className="schedule-dependency-layer" width={printTotalWidth} height={Math.max(1, pageHeight)}>
                          <defs>
                            <marker id={`schedulePrintArrow-${pageIndex}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                              <path d="M0,0 L8,4 L0,8 Z" fill="#64748B" />
                            </marker>
                          </defs>
                          {printDependencyLines.map(line => (
                            <path key={line.id} d={`M${line.x1} ${line.y1} L${line.x1 + 10} ${line.y1} L${line.x1 + 10} ${line.y2} L${line.x2} ${line.y2}`} markerEnd={`url(#schedulePrintArrow-${pageIndex})`} />
                          ))}
                        </svg>
                        {pageRows.map(row => {
                          if (row.kind === 'summary') {
                            return (
                              <div key="print-gantt-summary" className="schedule-gantt-row summary" style={{ height: PRINT_SUMMARY_ROW_H }}>
                                {dayList.map(day => (
                                  <span key={`print-summary-day-${iso(day)}`} className={dayClass(day)} style={{ width: printColWidth }} />
                                ))}
                                {summary.start && summary.end && (
                                  <div className="schedule-bar summary progress" style={{
                                    left: daysBetween(range.start, parseDate(summary.start)) * printColWidth,
                                    width: Math.max(printColWidth, (daysBetween(parseDate(summary.start), parseDate(summary.end)) + 1) * printColWidth),
                                  }}>
                                    <i style={{ width: `${summary.progress}%` }} />
                                    <em>{summary.progress}%</em>
                                  </div>
                                )}
                              </div>
                            );
                          }
                          const task = row.task;
                          const start = parseDate(task.start);
                          const end = parseDate(task.end);
                          const left = start ? daysBetween(range.start, start) * printColWidth : 0;
                          const width = start && end ? Math.max(printColWidth, (daysBetween(start, end) + 1) * printColWidth) : printColWidth;
                          const status = getStatus(task);
                          const levelColor = getLevelColor(task._depth);
                          const isCritical = showCriticalPath && criticalPathIds.has(task.id);
                          const barShadow = [status === 'late' ? 'inset 3px 0 0 0 #DC2626' : '', isCritical ? '0 0 0 3px rgba(245,158,11,.35)' : '', '0 1px 2px rgba(0,31,91,.15)'].filter(Boolean).join(', ');
                          return (
                            <div key={`print-gantt-${task.id}`} className={`schedule-gantt-row ${task.type}`} style={{ height: printRowHeight(task) }}>
                              {dayList.map(day => (
                                <span key={`print-task-day-${task.id}-${iso(day)}`} className={dayClass(day)} style={{ width: printColWidth }} />
                              ))}
                              {start && end && (
                                <div className={`schedule-bar ${task.type} ${isCritical ? 'critical' : ''}`} style={{ left, width, backgroundColor: levelColor.bg, boxShadow: barShadow }}>
                                  <i style={{ width: `${task.progress || 0}%`, backgroundColor: levelColor.fill }} />
                                  <em style={{ color: levelColor.text, textShadow: 'none' }}>{task.type === 'phase' ? task.name : `${task.progress || 0}%`}</em>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="schedule-print-footer">
                <div className="schedule-print-brand">
                  <strong>CTG.Engenharia</strong>
                  <small>Responsável: {generatedBy} · {activeRevision?.label || 'Rev. 0'} · Gerado em {TODAY.toLocaleDateString('pt-BR')}</small>
                </div>
                <span className="schedule-print-page-number">Página {pageIndex + 1} de {printPages.length}</span>
              </div>
            </section>
          );
        })}
      </div>

      {editingTask && <TaskModal task={editingTask} tasks={tasks} onClose={() => setEditingTask(null)} onSave={saveTask} />}
      <ScheduleSettingsModal
        open={settingsOpen}
        settings={scheduleSettings}
        onChange={setScheduleSettings}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
