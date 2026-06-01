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

function isChildWbs(childWbs = '', parentWbs = '') {
  return parentWbs && String(childWbs).startsWith(`${parentWbs}.`);
}

function wbsParts(wbs = '') {
  return String(wbs).split('.').map(part => Number(part)).filter(Number.isFinite);
}

function compareWbs(a = '', b = '') {
  const left = wbsParts(a);
  const right = wbsParts(b);
  const max = Math.max(left.length, right.length);
  for (let index = 0; index < max; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) return diff;
  }
  return String(a).localeCompare(String(b));
}

function derivePhaseValues(tasks, settings) {
  let currentPhase = null;
  let childIndex = 0;
  const arranged = tasks.map(task => {
    if (task.type === 'phase') {
      currentPhase = task;
      childIndex = 0;
      return task;
    }
    if (!currentPhase) return task;
    childIndex += 1;
    return {
      ...task,
      wbs: isChildWbs(task.wbs, currentPhase.wbs) ? task.wbs : `${currentPhase.wbs}.${childIndex}`,
      _parentPhaseId: currentPhase.id,
    };
  });

  return arranged.map(task => {
    if (task.type !== 'phase') return task;
    const children = arranged.filter(item => item._parentPhaseId === task.id && parseDate(item.start) && parseDate(item.end));
    if (!children.length) return task;
    const start = new Date(Math.min(...children.map(item => parseDate(item.start))));
    const end = new Date(Math.max(...children.map(item => parseDate(item.end))));
    const totalDuration = children.reduce((sum, item) => sum + taskDuration(item, settings), 0);
    const weightedProgress = children.reduce((sum, item) => sum + (Number(item.progress) || 0) * taskDuration(item, settings), 0);
    return {
      ...task,
      start: iso(start),
      end: iso(end),
      progress: totalDuration ? Math.round(weightedProgress / totalDuration) : Number(task.progress) || 0,
    };
  });
}

function getPhaseChildrenByPosition(tasks, phaseId) {
  const phaseIndex = tasks.findIndex(task => task.id === phaseId);
  if (phaseIndex < 0) return [];
  const children = [];
  for (let index = phaseIndex + 1; index < tasks.length; index += 1) {
    if (tasks[index].type === 'phase') break;
    children.push(tasks[index]);
  }
  return children;
}

function findParentPhase(tasks, selectedId) {
  const selected = tasks.find(task => task.id === selectedId);
  if (selected?.type === 'phase') return selected;
  if (selected) {
    const candidates = tasks
      .filter(task => task.type === 'phase' && isChildWbs(selected.wbs, task.wbs))
      .sort((a, b) => String(b.wbs).length - String(a.wbs).length);
    if (candidates[0]) return candidates[0];
  }
  return [...tasks].reverse().find(task => task.type === 'phase') || null;
}

function nextTopLevelWbs(tasks) {
  const max = tasks
    .filter(task => !String(task.wbs).includes('.'))
    .reduce((highest, task) => Math.max(highest, Number(task.wbs) || 0), 0);
  return String(max + 1);
}

function nextChildWbs(tasks, parentWbs) {
  const max = tasks
    .filter(task => isChildWbs(task.wbs, parentWbs) && String(task.wbs).split('.').length === String(parentWbs).split('.').length + 1)
    .reduce((highest, task) => Math.max(highest, Number(String(task.wbs).split('.').at(-1)) || 0), 0);
  return `${parentWbs}.${max + 1}`;
}

function makeRevision(id, label, tasks = []) {
  return { id, label, tasks };
}

function normalizeProject(project) {
  const sourceTasks = Array.isArray(project.tasks) ? project.tasks : [];
  const revisions = Array.isArray(project.revisions) && project.revisions.length
    ? project.revisions
    : [makeRevision('rev-0', project.revision || 'Rev. 0', sourceTasks)];
  const normalized = [...revisions];
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

  const resolve = (task) => {
    if (memo.has(task.id)) return memo.get(task.id);
    const taskIndex = taskList.findIndex(item => item.id === task.id);
    const fallbackPredecessor = taskIndex > 0 ? taskList[taskIndex - 1] : null;
    const predecessor = taskMap.get(task.predecessorId) || fallbackPredecessor;
    const base = predecessor ? resolve(predecessor) : { duration: 0, path: [] };
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
  const { confirm } = useToast();
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
    const parentPhase = type === 'task' ? findParentPhase(sourceTasks, selectedId) : null;
    const siblingTasks = parentPhase ? getPhaseChildrenByPosition(sourceTasks, parentPhase.id) : sourceTasks;
    const prev = siblingTasks[siblingTasks.length - 1] || sourceTasks[sourceTasks.length - 1];
    const start = prev?.end ? iso(addDays(parseDate(prev.end), 1)) : iso(TODAY);
    const task = {
      id: `task-${Date.now()}`,
      wbs: type === 'phase' ? nextTopLevelWbs(sourceTasks) : (parentPhase ? `${parentPhase.wbs}.${siblingTasks.length + 1}` : nextTopLevelWbs(sourceTasks)),
      name: type === 'phase' ? 'Nova atividade macro' : 'Nova atividade',
      type,
      start,
      end: iso(addDays(parseDate(start), 2)),
      progress: 0,
      predecessorId: prev?.id || '',
      dependencyType: 'FS',
      notes: '',
    };
    updateRevision(revision => {
      if (!parentPhase || type === 'phase') return { ...revision, tasks: [...revision.tasks, task] };
      const lastChildIndex = revision.tasks.reduce(
        (last, item, index) => (isChildWbs(item.wbs, parentPhase.wbs) ? index : last),
        revision.tasks.findIndex(item => item.id === parentPhase.id)
      );
      const nextTasks = [...revision.tasks];
      nextTasks.splice(lastChildIndex + 1, 0, task);
      return { ...revision, tasks: nextTasks };
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

  const moveTasksTo = (targetId, position) => {
    const movingIds = selectedIds.length ? selectedIds : (selectedId ? [selectedId] : []);
    if (!targetId || !movingIds.length || movingIds.includes(targetId)) return;
    updateRevision(revision => {
      const movingSet = new Set(movingIds);
      const moving = revision.tasks.filter(task => movingSet.has(task.id));
      const remaining = revision.tasks.filter(task => !movingSet.has(task.id));
      const targetIndex = remaining.findIndex(task => task.id === targetId);
      if (targetIndex < 0) return revision;
      const insertAt = position === 'before' ? targetIndex : targetIndex + 1;
      return { ...revision, tasks: normalizeTaskOrder([...remaining.slice(0, insertAt), ...moving, ...remaining.slice(insertAt)]) };
    });
  };

  const aggregateTasksInto = (targetId) => {
    const movingIds = selectedIds.length ? selectedIds : (selectedId ? [selectedId] : []);
    if (!targetId || !movingIds.length || movingIds.includes(targetId)) return;
    updateRevision(revision => {
      const movingSet = new Set(movingIds);
      const moving = revision.tasks.filter(task => movingSet.has(task.id)).map(task => ({ ...task, type: 'task' }));
      const remaining = revision.tasks.filter(task => !movingSet.has(task.id));
      const targetIndex = remaining.findIndex(task => task.id === targetId);
      if (targetIndex < 0) return revision;
      const target = remaining[targetIndex];
      const nextTarget = { ...target, type: 'phase', predecessorId: '', dependencyType: 'FS' };
      const arranged = [
        ...remaining.slice(0, targetIndex),
        nextTarget,
        ...moving,
        ...remaining.slice(targetIndex + 1),
      ];
      return { ...revision, tasks: normalizeTaskOrder(arranged) };
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
    updateRevision(revision => ({
      ...revision,
      tasks: revision.tasks.map(existing => existing.id === task.id ? task : existing),
    }));
    setEditingTask(null);
  };

  const deleteTask = (taskId) => {
    if (!taskId) return;
    const deleteIds = selectedIds.length && selectedIds.includes(taskId) ? selectedIds : [taskId];
    const deleteSet = new Set(deleteIds);
    updateRevision(revision => ({
      ...revision,
      tasks: revision.tasks
        .filter(task => !deleteSet.has(task.id))
        .map(task => deleteSet.has(task.predecessorId) ? { ...task, predecessorId: '' } : task),
    }));
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
                  <span className="schedule-task-name">{task.name}</span>
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
          <div className="schedule-gantt-scroll">
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
                  return (
                    <div
                      key={task.id}
                      className={`schedule-gantt-row ${task.type} ${selectedIds.includes(task.id) ? 'selected' : ''}`}
                      style={{ height: rowHeight(task) }}
                      onClick={event => selectTask(task.id, event)}
                      onDoubleClick={() => setEditingTask(task)}
                      onDragOver={event => event.preventDefault()}
                      onDrop={event => handleTaskDrop(task.id, event)}
                    >
                      {dayList.map(day => (
                        <span key={iso(day)} className={dayClass(day)} style={{ width: colWidth }} />
                      ))}
                      {start && end && (
                        <div className={`schedule-bar ${task.type} ${status} ${showCriticalPath && criticalPathIds.has(task.id) ? 'critical' : ''}`} style={{ left, width }}>
                          <i style={{ width: `${task.progress || 0}%` }} />
                          <em>{task.type === 'phase' ? task.name : `${task.progress || 0}%`}</em>
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
                          <span className="schedule-task-name">{task.name}</span>
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
                          return (
                            <div key={`print-gantt-${task.id}`} className={`schedule-gantt-row ${task.type}`} style={{ height: printRowHeight(task) }}>
                              {dayList.map(day => (
                                <span key={`print-task-day-${task.id}-${iso(day)}`} className={dayClass(day)} style={{ width: printColWidth }} />
                              ))}
                              {start && end && (
                                <div className={`schedule-bar ${task.type} ${status} ${showCriticalPath && criticalPathIds.has(task.id) ? 'critical' : ''}`} style={{ left, width }}>
                                  <i style={{ width: `${task.progress || 0}%` }} />
                                  <em>{task.type === 'phase' ? task.name : `${task.progress || 0}%`}</em>
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
