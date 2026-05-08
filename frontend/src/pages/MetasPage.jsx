import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../utils/api.js';

const AREAS = [
  { value: 'eletrica', label: 'Eng. Eletrica' },
  { value: 'mecanica', label: 'Eng. Mecanica' },
  { value: 'confiabilidade', label: 'Eng. Confiabilidade' },
  { value: 'modernizacao', label: 'Modernizacao' },
];

const STATUS = [
  { value: 'Não iniciado', color: '#64748B', bg: '#F1F5F9', text: '#334155' },
  { value: 'Em andamento', color: '#F59E0B', bg: '#FEF3C7', text: '#92400E' },
  { value: 'Concluida', color: '#10B981', bg: '#D1FAE5', text: '#065F46' },
  { value: 'Cancelada', color: '#EF4444', bg: '#FEE2E2', text: '#991B1B' },
];

const TABLE_TONES = {
  personal: { header: '#002A67', sub: '#123E7A', row: '#F8FBFF', alt: '#EEF6FF' },
  collective: { header: '#075985', sub: '#0E7490', row: '#F0FDFA', alt: '#DDF8F3' },
  subordinate: { header: '#334155', sub: '#475569', row: '#F8FAFC', alt: '#EEF2F7' },
};

const KPI_OPTIONS = [
  'Milestone',
  '%Achievement',
  'Availability HPPs',
  'Date',
  'Executed Stages',
  'Forced Outages',
  'Procurement & Contract Management',
];

const EVIDENCE_LAYOUTS = [
  { value: 'single', label: 'Imagem unica', slots: 1 },
  { value: 'grid-2x2', label: '2 linhas x 2 colunas', slots: 4 },
  { value: 'two-columns', label: '2 colunas iguais', slots: 2 },
  { value: 'main-left', label: 'Grande esquerda + 2 direita', slots: 3 },
  { value: 'main-right', label: '2 esquerda + grande direita', slots: 3 },
  { value: 'two-rows', label: '2 linhas largas', slots: 2 },
];

function escapeHTML(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function areaLabel(area) {
  return AREAS.find(a => a.value === area)?.label || area || '-';
}

function fmtNumber(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function achievementPercent(meta) {
  const achieved = Number(meta?.achieved_value || 0);
  if (!Number.isFinite(achieved)) return null;
  return achieved;
}

function fmtPercent(v) {
  if (v === null || v === undefined || v === '') return '-';
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function assignedWeightMap(meta) {
  const raw = meta?.assigned_weights;
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function metaWeight(meta, memberId) {
  const map = assignedWeightMap(meta);
  const personal = memberId != null ? Number(map[String(memberId)] ?? map[Number(memberId)]) : NaN;
  const n = Number.isFinite(personal) && personal > 0 ? personal : Number(meta?.weight);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function weightedAchievement(metas, memberId) {
  const rows = metas
    .map(m => ({ weight: metaWeight(m, memberId), achievement: achievementPercent(m) }))
    .filter(r => r.weight > 0 && Number.isFinite(r.achievement));
  const totalWeight = rows.reduce((sum, r) => sum + r.weight, 0);
  if (totalWeight <= 0) return null;
  return rows.reduce((sum, r) => sum + r.weight * r.achievement, 0) / totalWeight;
}

function healthColor(value) {
  const n = Number(value) || 0;
  if (n >= 90) return '#10B981';
  if (n >= 70) return '#F59E0B';
  return '#EF4444';
}

function evidenceImages(meta) {
  const raw = meta?.evidence_images;
  if (Array.isArray(raw)) return raw.slice(0, 4);
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(0, 4);
    } catch {
      return [raw];
    }
  }
  return meta?.evidence_image ? [meta.evidence_image] : [];
}

function evidenceFits(meta) {
  const raw = meta?.evidence_fits;
  let fits = [];
  if (Array.isArray(raw)) fits = raw;
  else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) fits = parsed;
    } catch {
      fits = [];
    }
  }
  return Array.from({ length: 4 }, (_, i) => fits[i] === 'cover' ? 'cover' : 'contain');
}

function withMemberWeight(meta, member) {
  if (!meta?.is_general || !member?.id) return meta;
  return { ...meta, weight: metaWeight(meta, member.id) };
}

function evidenceLayout(meta) {
  return EVIDENCE_LAYOUTS.some(l => l.value === meta?.evidence_layout)
    ? meta.evidence_layout
    : 'grid-2x2';
}

function evidenceSlotCount(layout) {
  return EVIDENCE_LAYOUTS.find(l => l.value === layout)?.slots || 4;
}

function escapeLayoutClass(layout) {
  return `layout-${String(layout || 'grid-2x2').replace(/[^a-z0-9-]/gi, '')}`;
}

function layoutGridStyle(layout) {
  if (layout === 'single') return { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' };
  if (layout === 'two-columns') return { gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: '1fr' };
  if (layout === 'main-left' || layout === 'main-right') return { gridTemplateColumns: layout === 'main-left' ? '1.45fr 1fr' : '1fr 1.45fr', gridTemplateRows: 'repeat(2, 1fr)' };
  if (layout === 'two-rows') return { gridTemplateColumns: '1fr', gridTemplateRows: 'repeat(2, 1fr)' };
  return { gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: 'repeat(2, 1fr)' };
}

function layoutSlotStyle(layout, index) {
  if (layout === 'main-left' && index === 0) return { gridRow: '1 / span 2' };
  if (layout === 'main-right') {
    if (index === 0) return { gridColumn: 2, gridRow: '1 / span 2' };
    if (index === 1) return { gridColumn: 1, gridRow: 1 };
    if (index === 2) return { gridColumn: 1, gridRow: 2 };
  }
  return {};
}

function visibleEvidenceImages(meta) {
  const layout = evidenceLayout(meta);
  const count = evidenceSlotCount(layout);
  const images = evidenceImages(meta).slice(0, count);
  return Array.from({ length: count }, (_, i) => images[i] || null);
}

function visibleEvidenceFits(meta) {
  const layout = evidenceLayout(meta);
  const count = evidenceSlotCount(layout);
  const fits = evidenceFits(meta).slice(0, count);
  return Array.from({ length: count }, (_, i) => fits[i] === 'cover' ? 'cover' : 'contain');
}

function Avatar({ name, initials, size = 26 }) {
  const letters = initials?.trim()
    ? initials.trim().slice(0, 3)
    : (name?.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '??');
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'var(--ctg-navy)', color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.36) + 'px', fontWeight: 700, lineHeight: 1,
    }}>{letters}</span>
  );
}

function StatusBadge({ status }) {
  const s = STATUS.find(x => x.value === status) || STATUS[0];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 700,
      background: s.bg, color: s.text, border: `1px solid ${s.color}33`, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
      {status}
    </span>
  );
}

const STATUS_EN = { 'Não iniciado': 'Not Started', 'Em andamento': 'In Progress', 'Concluida': 'Completed', 'Cancelada': 'Cancelled' };

function buildGoalsHTML({ member, metas, year }) {
  const now = new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' });
  const averageAchievement = weightedAchievement(metas, member?.id);
  const metasWithEvidence = metas.filter(m => visibleEvidenceImages(m).some(Boolean)).length;
  const achievedMetas = metas.filter(m => (achievementPercent(m) || 0) >= 100).length;
  const totalColor = '#10B981';
  const achievedRate = metas.length ? (achievedMetas / metas.length) * 100 : 0;
  const sparkline = color => `
    <svg class="sparkline" viewBox="0 0 70 28" aria-hidden="true">
      <path d="M4 21 C14 18 17 14 25 16 S37 20 44 13 S56 8 66 10" stroke="${color}" />
    </svg>
  `;
  const summaryCard = (label, value, color) => `
    <div class="card summary-card" style="--accent:${color};--accent-soft:${color}0A;--accent-glow:${color}12">
      <span class="summary-glow summary-glow-a"></span>
      <span class="summary-glow summary-glow-b"></span>
      <div>
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
      ${sparkline(color)}
    </div>
  `;
  const summaryRows = metas.map(m => {
    const achievement = achievementPercent(m);
    const weight = metaWeight(m, member?.id);
    return `
      <tr class="${m.is_general ? 'summary-collective' : 'summary-individual'}">
        <td><span class="type-badge ${m.is_general ? 'badge-collective' : 'badge-individual'}">${m.is_general ? 'Collective' : 'Individual'}</span></td>
        <td>${escapeHTML(m.description)}</td>
        <td>${weight ? fmtPercent(weight * 100) : '-'}</td>
        <td>${fmtPercent(m.achieved_value)}</td>
        <td>${weight && Number.isFinite(achievement) ? fmtPercent(weight * achievement) : '-'}</td>
      </tr>
    `;
  }).join('');
  const rows = metas.map(m => {
    const progress = Math.min(120, achievementPercent(m) || 0);
    const evidenceLink = m.evidence_link ? escapeHTML(m.evidence_link) : '';
    const images = visibleEvidenceImages(m);
    const fits = visibleEvidenceFits(m);
    const imageCells = images.map((src, idx) => `
      <div class="evidence-cell">
        ${src ? `<img class="fit-${fits[idx] || 'contain'}" src="${escapeHTML(src)}" alt="Evidence image ${idx + 1} of goal ${escapeHTML(m.meta_number)}">` : '<div class="missing">Image not uploaded</div>'}
      </div>
    `).join('');
    return `
      <section class="goal-page">
        <div class="goal">
          <div class="goal-head">
            <div>
              <div class="goal-kicker">${m.is_general ? 'Collective Goal' : 'Individual Goal'} ${escapeHTML(m.meta_number)}</div>
              <h2>${escapeHTML(m.description)}</h2>
            </div>
            <span class="status">${escapeHTML(STATUS_EN[m.status] || m.status)}</span>
          </div>
          <div class="meta-grid">
            <div><span>KPI</span><strong>${escapeHTML(m.kpi || '-')}</strong></div>
            <div><span>Weight</span><strong>${metaWeight(m, member?.id) ? `${fmtNumber(metaWeight(m, member?.id) * 100)}%` : '-'}</strong></div>
            <div><span>Achieved</span><strong>${fmtPercent(m.achieved_value)}</strong></div>
          </div>
          ${m.detailed ? `<div class="detail-block"><div class="section-label">Goal Description</div><p class="detail">${escapeHTML(m.detailed)}</p></div>` : ''}
          <div class="targets">
            <div><span>80%</span>${escapeHTML(m.target_80 || '-')}</div>
            <div><span>100%</span>${escapeHTML(m.target_100 || '-')}</div>
            <div><span>120%</span>${escapeHTML(m.target_120 || '-')}</div>
          </div>
          <div class="progress"><span style="width:${progress}%"></span></div>
          ${m.notes ? `<div class="notes">${escapeHTML(m.notes)}</div>` : ''}
          <figure class="evidence-layout ${escapeLayoutClass(evidenceLayout(m))} image-count-${images.length}">
            ${images.some(Boolean) ? imageCells : '<div class="missing">Evidence not uploaded</div>'}
            <figcaption>${evidenceLink ? `<a href="${evidenceLink}" target="_blank" rel="noopener">Open evidence on SharePoint</a>` : `Evidence link not provided — Goal ${escapeHTML(m.meta_number)}`}</figcaption>
          </figure>
        </div>
      </section>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Goals Report - ${escapeHTML(member.name)} - ${year}</title>
<style>
@page{size:A4 portrait;margin:0}
*{box-sizing:border-box}html,body{margin:0;padding:0}body{background:#F8FAFC;color:#1E293B;font-family:'Segoe UI',Arial,sans-serif;font-size:13px}
.header{background:linear-gradient(135deg,#001F5B,#0070B8);color:white;padding:30px 40px 24px}
.brand{font-size:21px;font-weight:800}.brand span{color:#00AEEF}.title{font-size:26px;font-weight:800;margin-top:8px}.sub{opacity:.82;margin-top:6px}.meta{display:flex;gap:20px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.18);font-size:11px;opacity:.75}
.content{max-width:980px;margin:0 auto;padding:26px 34px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px}
.card{background:white;border-radius:10px;padding:14px 16px;box-shadow:0 1px 5px rgba(0,0,0,.07)}.card span{display:block;font-size:9px;color:#64748B;text-transform:uppercase;letter-spacing:.07em;font-weight:700}.card strong{display:block;margin-top:4px;font-size:20px;color:#001F5B}
.summary-card{position:relative;overflow:hidden;border:none;border-left:4px solid var(--accent);background:linear-gradient(110deg,var(--accent-soft) 0%,rgba(255,255,255,.92) 58%,#fff 100%);display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;min-height:74px}
.summary-card>div,.summary-card>.sparkline{position:relative;z-index:1}.summary-card strong{color:#001F5B;font-size:23px}.summary-card .sparkline{width:62px;height:28px;flex-shrink:0;opacity:.48}.summary-card .sparkline path{fill:none;stroke-width:3;stroke-linecap:round}
.summary-glow{position:absolute;display:block;border-radius:50%;background:var(--accent-glow);filter:blur(1px);pointer-events:none}.summary-glow-a{right:-26px;top:-22px;width:92px;height:62px;opacity:.72}.summary-glow-b{right:40px;bottom:-28px;width:70px;height:44px;opacity:.55}
.summary-table{width:100%;border-collapse:collapse;background:white;border-radius:10px;overflow:hidden;margin-bottom:18px;box-shadow:0 1px 5px rgba(0,0,0,.07)}.summary-table th{background:#001F5B;color:white;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.06em;padding:9px 10px}.summary-table td{padding:9px 10px;border-bottom:1px solid #E2E8F0;font-size:11px;vertical-align:top}.summary-table .summary-collective td{background:#EFF6FF}.type-badge{display:inline-flex;align-items:center;border-radius:999px;padding:2px 7px;margin-right:6px;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}.badge-collective{background:#DBEAFE;color:#1D4ED8;border:1px solid #BFDBFE}.badge-individual{background:#F1F5F9;color:#475569;border:1px solid #CBD5E1}.summary-table a,.evidence-link{color:#0070B8;font-weight:700;text-decoration:none}.evidence-empty{font-size:11px;color:#94A3B8;margin-bottom:10px}
.goal-page{break-inside:avoid}.goal{background:white;border-radius:12px;padding:20px 22px;margin-bottom:16px;box-shadow:0 1px 6px rgba(0,0,0,.07);break-inside:avoid;border-left:4px solid #0070B8}
.goal-head{display:flex;gap:14px;align-items:flex-start;justify-content:space-between;border-bottom:1px solid #E2E8F0;padding-bottom:12px;margin-bottom:14px}.goal-kicker{font-size:10px;font-weight:800;color:#0070B8;text-transform:uppercase;letter-spacing:.08em}h2{font-size:17px;margin:4px 0 0;color:#001F5B}.status{background:#EFF6FF;color:#1D4ED8;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap}
.meta-grid{display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:8px;margin-bottom:12px}.meta-grid div{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:11px 12px;box-shadow:0 1px 3px rgba(15,23,42,.05)}.meta-grid span{display:block;color:#64748B;font-size:10px;text-transform:uppercase;font-weight:800}.meta-grid strong{display:block;margin-top:4px;color:#0F172A;font-size:14px;line-height:1.25}
.section-label{font-size:10px;color:#64748B;text-transform:uppercase;font-weight:800;letter-spacing:.04em;margin-bottom:4px}.detail-block{margin:0}.detail{margin:0;line-height:1.55;color:#334155;white-space:pre-wrap}.targets{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}.targets div{border:1px solid #E2E8F0;border-radius:8px;padding:9px 10px;line-height:1.4;white-space:pre-wrap}.targets div:nth-child(1){background:rgba(249,115,22,.12);border-color:rgba(249,115,22,.28)}.targets div:nth-child(2){background:rgba(0,112,184,.12);border-color:rgba(0,112,184,.28)}.targets div:nth-child(3){background:rgba(16,185,129,.12);border-color:rgba(16,185,129,.28)}.targets span{display:block;color:#0070B8;font-weight:800;font-size:11px;margin-bottom:4px}.targets div:nth-child(1) span{color:#C2410C}.targets div:nth-child(3) span{color:#047857}
.progress{height:8px;background:#E2E8F0;border-radius:999px;overflow:hidden;margin:12px 0}.progress span{display:block;height:100%;background:linear-gradient(90deg,#0070B8,#10B981)}.notes{background:#FFFBEB;border-left:3px solid #F59E0B;padding:10px 12px;border-radius:8px;white-space:pre-wrap;color:#78350F;margin:10px 0}
figure{margin:14px 0 0}.evidence-layout{display:grid;gap:8px}.evidence-cell{min-height:0;border:1px solid #CBD5E1;border-radius:10px;overflow:hidden;background:white}.evidence-cell img{display:block;width:100%;height:100%}.evidence-cell img.fit-contain{object-fit:contain}.evidence-cell img.fit-cover{object-fit:cover}.layout-single{grid-template-columns:1fr;grid-template-rows:minmax(0,1fr) auto}.layout-grid-2x2{grid-template-columns:repeat(2,1fr);grid-template-rows:repeat(2,minmax(0,1fr)) auto}.layout-two-columns{grid-template-columns:repeat(2,1fr);grid-template-rows:minmax(0,1fr) auto}.layout-main-left{grid-template-columns:1.45fr 1fr;grid-template-rows:repeat(2,minmax(0,1fr)) auto}.layout-main-left .evidence-cell:first-child{grid-row:1 / span 2}.layout-main-right{grid-template-columns:1fr 1.45fr;grid-template-rows:repeat(2,minmax(0,1fr)) auto}.layout-main-right .evidence-cell:first-child{grid-column:2;grid-row:1 / span 2}.layout-main-right .evidence-cell:nth-child(2){grid-column:1;grid-row:1}.layout-main-right .evidence-cell:nth-child(3){grid-column:1;grid-row:2}.layout-two-rows{grid-template-columns:1fr;grid-template-rows:repeat(2,minmax(0,1fr)) auto}figcaption{grid-column:1 / -1;font-size:10px;color:#64748B;margin-top:6px}figcaption a{color:#0070B8;font-weight:700;text-decoration:none}.missing{height:100%;min-height:42px;border:1px dashed #CBD5E1;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#94A3B8;background:#F8FAFC}
@media print{
body{background:white;font-size:11px}
.content{max-width:none;padding:8mm}
.header,.summary,.summary-table{break-after:avoid}
.goal-page{width:210mm;height:297mm;margin:0 -8mm -8mm;break-before:page;page-break-before:always;break-after:page;page-break-after:always;break-inside:avoid;page-break-inside:avoid;overflow:hidden;background:white}
.goal{width:210mm;height:297mm;margin:0;padding:8mm;border-radius:0;box-shadow:none;overflow:hidden;display:grid;grid-template-columns:1fr;grid-template-rows:auto auto auto auto auto auto;align-content:start;row-gap:6px;border-left:4px solid #0070B8}
.goal-head{grid-column:1 / -1;margin:0;padding-bottom:6px}.goal-kicker{font-size:9px}h2{font-size:14px;line-height:1.2;margin-top:2px}.status{font-size:10px;padding:3px 8px}
.meta-grid{grid-template-columns:1.35fr 1fr 1fr;gap:6px;margin:0}.meta-grid div{padding:8px 9px}.meta-grid span{font-size:9px}.meta-grid strong{font-size:12px;line-height:1.2}
.evidence-link,.evidence-empty{margin:0;font-size:10px}.detail-block{margin:0}.section-label{font-size:9px;margin-bottom:3px}.detail{font-size:10px;line-height:1.32;max-height:22mm;overflow:hidden}
.targets{grid-template-columns:repeat(3,1fr);gap:5px;margin:0 0 6px}.targets div{padding:6px 7px;font-size:9px;line-height:1.22;max-height:25mm;overflow:hidden}.targets span{font-size:10px;margin-bottom:2px}
.progress{margin:0 0 6px;height:7px}.notes{margin:0;padding:7px 8px;font-size:10px;line-height:1.28;max-height:18mm;overflow:hidden}
figure{margin:0;min-height:0;height:108mm}
.missing{height:100%;min-height:0}
figcaption{margin-top:4px}
.goal,.card,.header,.summary-table,.evidence-cell,.targets div{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style>
</head>
<body>
<div class="header">
  <div class="brand">CTG<span>.</span>Engenharia</div>
  <div class="title">Goals Report ${year}</div>
  <div class="sub">${escapeHTML(member.name)} - ${escapeHTML(areaLabel(member.area))}</div>
  <div class="meta"><span>Generated on ${now}</span><span>${metas.length} goals</span><span>${metasWithEvidence} evidence attached</span></div>
</div>
<main class="content">
  <div class="summary">
    ${summaryCard('Total', metas.length, totalColor)}
    ${summaryCard('Achieved', achievedMetas, healthColor(achievedRate))}
    ${summaryCard('Weighted Average', fmtPercent(averageAchievement), healthColor(averageAchievement))}
  </div>
  <table class="summary-table">
    <thead><tr><th>Type</th><th>Description</th><th>Weight</th><th>Achieved</th><th>Weighted</th></tr></thead>
    <tbody>${summaryRows || '<tr><td colspan="5">No goals registered for this period.</td></tr>'}</tbody>
  </table>
  ${rows || '<div class="card">No goals registered for this period.</div>'}
</main>
</body>
</html>`;
}

function MetaModal({ meta, userId, area, year, members, canEditOthers, currentUser, readOnly = false, onSave, onDelete, onEvidenceSlot, onClose }) {
  // For collective metas: which members receive it (null = all)
  const [assignedUserIds, setAssignedUserIds] = useState(() => {
    if (!meta?.is_general) return null;
    if (Array.isArray(meta?.assigned_user_ids) && meta.assigned_user_ids.length > 0)
      return new Set(meta.assigned_user_ids.map(Number));
    return new Set(currentUser?.id ? [currentUser.id] : []);
  });

  const [form, setForm] = useState({
    user_id: meta?.user_id || userId,
    area: meta?.area || area,
    meta_number: meta?.meta_number || 1,
    description: meta?.description || '',
    kpi: meta?.kpi || '',
    detailed: meta?.detailed || '',
    weight: meta?.weight != null && meta?.weight !== '' ? parseFloat((Number(meta.weight) * 100).toFixed(2)) : '',
    target_80: meta?.target_80 || '',
    target_100: meta?.target_100 || '',
    target_120: meta?.target_120 || '',
    target_value: meta?.target_value || 0,
    achieved_value: meta?.achieved_value != null ? String(meta.achieved_value) : '',
    unit: meta?.unit || '',
    status: meta?.status || 'Em andamento',
    notes: meta?.notes || '',
    evidence_link: meta?.evidence_link || '',
    evidence_layout: evidenceLayout(meta),
    is_general: !!meta?.is_general,
    assigned_area: meta?.assigned_area || meta?.area || area,
    year: meta?.year || year,
  });
  const [saving, setSaving] = useState(false);
  const [deletingMeta, setDeletingMeta] = useState(false);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [error, setError] = useState('');
  const [evidenceDraft, setEvidenceDraft] = useState(() => evidenceImages(meta));
  const [fitDraft, setFitDraft] = useState(() => evidenceFits(meta));
  const inp = { padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', fontSize: '0.82rem', background: 'var(--bg-card)', color: 'var(--text-primary)', width: '100%', outline: 'none', fontFamily: 'var(--font-body)' };
  const label = { fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 };
  const busy = saving || deletingMeta || uploadingEvidence;
  const isReadOnly = !!readOnly;
  const collectiveMembers = members
    .filter(m => (m.id === currentUser?.id) || (m.role === 'engenheiro' && (!form.assigned_area || m.area === form.assigned_area)))
    .sort((a, b) => (a.id === currentUser?.id ? -1 : b.id === currentUser?.id ? 1 : a.name.localeCompare(b.name, 'pt-BR')));
  const [assignedWeights, setAssignedWeights] = useState(() => {
    const map = assignedWeightMap(meta);
    const fallback = meta?.weight != null && meta?.weight !== '' ? parseFloat((Number(meta.weight) * 100).toFixed(2)) : '';
    return Object.fromEntries(Object.entries(map).map(([id, val]) => [id, parseFloat((Number(val) * 100).toFixed(2)) || fallback]));
  });

  useEffect(() => {
    setEvidenceDraft(evidenceImages(meta));
    setFitDraft(evidenceFits(meta));
    setForm(f => ({ ...f, evidence_layout: evidenceLayout(meta) }));
  }, [meta?.id, meta?.evidence_images, meta?.evidence_image, meta?.evidence_fits, meta?.evidence_layout]);

  useEffect(() => {
    if (!form.is_general) return;
    const fallback = form.weight !== '' && form.weight != null ? Number(form.weight) : '';
    setAssignedUserIds(prev => {
      const next = new Set(prev || []);
      if (!meta?.id && currentUser?.id) next.add(currentUser.id);
      return next;
    });
    setAssignedWeights(prev => {
      const next = { ...prev };
      for (const member of collectiveMembers) {
        if (next[member.id] === undefined || next[member.id] === '') next[member.id] = fallback;
      }
      return next;
    });
  }, [form.is_general, form.assigned_area, form.weight, currentUser?.id, meta?.id]);

  async function handleSubmit() {
    if (isReadOnly) return;
    if (!form.description.trim()) return setError('Preencha a descricao da meta');
    if (form.is_general && assignedUserIds && assignedUserIds.size === 0)
      return setError('Selecione ao menos um destinatario');
    setSaving(true);
    setError('');
    try {
      const selectedIds = form.is_general && assignedUserIds
        ? [...new Set([...(currentUser?.id ? [currentUser.id] : []), ...assignedUserIds])]
        : null;
      const weightMap = form.is_general && selectedIds
        ? Object.fromEntries(selectedIds.map(id => [id, assignedWeights[id] !== '' && assignedWeights[id] != null ? Number(assignedWeights[id]) / 100 : (form.weight !== '' && form.weight != null ? Number(form.weight) / 100 : null)]).filter(([, v]) => Number.isFinite(v) && v >= 0))
        : {};
      const payload = {
        ...form,
        weight: form.weight !== '' && form.weight != null ? Number(form.weight) / 100 : null,
        achieved_value: parseFloat(form.achieved_value) || 0,
        assigned_user_ids: selectedIds,
        assigned_weights: weightMap,
      };
      await onSave(meta?.id ? 'put' : 'post', meta?.id || null, payload);
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteClick() {
    if (isReadOnly) return;
    if (!meta?.id || !confirm('Excluir esta meta?')) return;
    setDeletingMeta(true);
    setError('');
    try {
      await onDelete(meta.id);
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || 'Erro ao excluir');
    } finally {
      setDeletingMeta(false);
    }
  }

  async function handleEvidenceSlot(slotIndex, filesLike) {
    if (isReadOnly) return;
    const file = Array.from(filesLike || [])[0];
    if (!meta?.id || !file || !onEvidenceSlot) return;
    setUploadingEvidence(true);
    setError('');
    try {
      const next = await onEvidenceSlot(meta, slotIndex, file, form.evidence_layout, fitDraft[slotIndex] || 'contain');
      setEvidenceDraft(evidenceImages(next));
      setFitDraft(evidenceFits(next));
    } catch (e) {
      setError(e.response?.data?.error || 'Erro ao enviar imagem.');
    } finally {
      setUploadingEvidence(false);
    }
  }

  async function handleClearEvidenceSlot(slotIndex) {
    if (isReadOnly) return;
    if (!meta?.id || !onEvidenceSlot) return;
    setUploadingEvidence(true);
    setError('');
    try {
      const next = await onEvidenceSlot(meta, slotIndex, null, form.evidence_layout);
      setEvidenceDraft(evidenceImages(next));
      setFitDraft(evidenceFits(next));
    } catch (e) {
      setError(e.response?.data?.error || 'Erro ao remover imagem.');
    } finally {
      setUploadingEvidence(false);
    }
  }

  const currentImages = evidenceDraft;
  const currentSlotCount = evidenceSlotCount(form.evidence_layout);

  async function handleFitSlot(slotIndex, fit) {
    if (isReadOnly) return;
    const nextFits = [...fitDraft];
    nextFits[slotIndex] = fit;
    setFitDraft(nextFits);
    if (!meta?.id || !onEvidenceSlot) return;
    try {
      const next = await onEvidenceSlot(meta, slotIndex, undefined, form.evidence_layout, fit);
      setEvidenceDraft(evidenceImages(next));
      setFitDraft(evidenceFits(next));
    } catch {
      setFitDraft(evidenceFits(meta));
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ position: 'relative', background: 'var(--bg-card)', borderRadius: 14, width: 560, maxWidth: '96vw', maxHeight: '92vh', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {busy && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 5, background: 'rgba(248,250,252,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(1px)' }}>
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', boxShadow: 'var(--shadow-md)', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ctg-navy)', fontSize: '0.82rem', fontWeight: 800 }}>
              <span className="spinner" style={{ width: 18, height: 18 }} />
              Salvando...
            </div>
          </div>
        )}
        <div style={{ background: 'var(--ctg-navy)', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}>{isReadOnly ? 'Visualizar meta' : (meta?.id ? 'Editar meta' : 'Nova meta')}</span>
          <button onClick={onClose} disabled={busy} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 6, cursor: busy ? 'not-allowed' : 'pointer', fontSize: '0.85rem', color: '#fff', width: 26, height: 26, fontWeight: 700 }}>x</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '18px 20px', overflowY: 'auto' }}>
          {canEditOthers && !isReadOnly && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border)', background: form.is_general ? '#EFF6FF' : '#F8FAFC', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={form.is_general}
                onChange={e => {
                  const checked = e.target.checked;
                  const targetArea = form.assigned_area || form.area || area;
                  setForm(f => ({ ...f, is_general: checked, assigned_area: targetArea, area: targetArea, user_id: checked ? (currentUser?.id || f.user_id) : f.user_id }));
                  if (checked) {
                    const eligible = members.filter(m => m.id === currentUser?.id || (m.role === 'engenheiro' && m.area === targetArea));
                    setAssignedUserIds(new Set(eligible.map(m => m.id)));
                    const fallback = form.weight !== '' && form.weight != null ? Number(form.weight) : '';
                    setAssignedWeights(prev => {
                      const next = { ...prev };
                      eligible.forEach(m => { if (next[m.id] === undefined || next[m.id] === '') next[m.id] = fallback; });
                      return next;
                    });
                  }
                }}
                style={{ accentColor: 'var(--ctg-blue)', width: 15, height: 15 }}
              />
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: form.is_general ? '#1D4ED8' : 'var(--text-secondary)' }}>
                Meta coletiva
              </span>
            </label>
          )}

          {canEditOthers && !isReadOnly && !form.is_general && (
            <div>
              <label style={label}>COLABORADOR</label>
              <select value={form.user_id} onChange={e => setForm(f => ({ ...f, user_id: parseInt(e.target.value) }))} style={inp}>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}

          {form.is_general && (
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 10, alignItems: 'end', marginBottom: collectiveMembers.length > 0 ? 8 : 0 }}>
                <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#1D4ED8' }}>Meta coletiva</div>
                <label>
                  <span style={{ ...label, marginBottom: 3 }}>AREA DA META</span>
                  <select value={form.assigned_area} disabled={isReadOnly} onChange={e => {
                    const nextArea = e.target.value;
                    const eligible = members.filter(m => m.id === currentUser?.id || (m.role === 'engenheiro' && m.area === nextArea));
                    setForm(f => ({ ...f, assigned_area: nextArea, area: nextArea }));
                    setAssignedUserIds(new Set(eligible.map(m => m.id)));
                  }} style={inp}>
                    {AREAS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </label>
              </div>
              {collectiveMembers.length > 0 && (
                <>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#1E40AF', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>PESO POR PESSOA</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {!isReadOnly && <button type="button" onClick={() => setAssignedUserIds(new Set(collectiveMembers.map(m => m.id)))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.68rem', color: '#2563EB', fontWeight: 700, padding: 0 }}>
                        Todos
                      </button>}
                      {!isReadOnly && <button type="button" onClick={() => setAssignedUserIds(new Set())}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.68rem', color: '#6B7280', fontWeight: 700, padding: 0 }}>
                        Nenhum
                      </button>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                    {collectiveMembers.map(m => {
                      const checked = assignedUserIds ? assignedUserIds.has(m.id) : true;
                      return (
                        <label key={m.id} style={{
                          display: 'grid', gridTemplateColumns: 'auto 22px minmax(0, 1fr) 90px', alignItems: 'center', gap: 8, padding: '5px 8px',
                          borderRadius: 6,
                          background: checked ? 'rgba(37,99,235,0.08)' : 'transparent',
                          border: `1px solid ${checked ? '#93C5FD' : 'transparent'}`,
                          cursor: isReadOnly ? 'default' : 'pointer',
                          transition: 'all 0.12s',
                        }}>
                          <input type="checkbox" checked={checked} disabled={isReadOnly} onChange={() => {
                            setAssignedUserIds(prev => {
                              const next = new Set(prev || collectiveMembers.map(x => x.id));
                              next.has(m.id) ? next.delete(m.id) : next.add(m.id);
                              return next;
                            });
                          }} style={{ accentColor: '#2563EB', width: 13, height: 13, flexShrink: 0 }} />
                          <Avatar name={m.name} initials={m.avatar_initials} size={22} />
                          <span style={{ fontSize: '0.78rem', fontWeight: checked ? 600 : 400, color: checked ? '#1E3A8A' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.name}
                          </span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={assignedWeights[m.id] ?? ''}
                            disabled={isReadOnly || !checked}
                            onChange={e => setAssignedWeights(prev => ({ ...prev, [m.id]: e.target.value }))}
                            onClick={e => e.stopPropagation()}
                            style={{ ...inp, padding: '5px 7px', fontSize: '0.74rem', opacity: checked ? 1 : 0.45 }}
                          />
                        </label>
                      );
                    })}
                  </div>
                  {assignedUserIds && assignedUserIds.size === 0 && (
                    <div style={{ fontSize: '0.7rem', color: '#EF4444', marginTop: 6, fontWeight: 600 }}>
                      Selecione ao menos um destinatário
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={label}>AREA</label>
              <select value={form.area} disabled={isReadOnly} onChange={e => setForm(f => ({ ...f, area: e.target.value, assigned_area: f.is_general ? e.target.value : f.assigned_area }))} style={inp}>
                {AREAS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>META</label>
              <select value={form.meta_number} disabled={isReadOnly} onChange={e => setForm(f => ({ ...f, meta_number: parseInt(e.target.value) }))} style={inp}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => <option key={n} value={n}>Meta {n}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={label}>NOME DA META</label>
            <textarea value={form.description} disabled={isReadOnly} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} style={{ ...inp, resize: 'vertical' }} placeholder="Descreva o objetivo principal desta meta" />
          </div>

          <div>
            <label style={label}>KPI / INDICADOR</label>
            <select value={form.kpi} disabled={isReadOnly} onChange={e => setForm(f => ({ ...f, kpi: e.target.value }))} style={inp}>
              <option value="">-- Selecione --</option>
              {KPI_OPTIONS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>

          <div>
            <label style={label}>DETALHAMENTO</label>
            <textarea value={form.detailed} disabled={isReadOnly} onChange={e => setForm(f => ({ ...f, detailed: e.target.value }))} rows={3} style={{ ...inp, resize: 'vertical' }} placeholder="Critérios de avaliação, metodologia, entregáveis..." />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={label}>PESO (%)</label>
              <input type="number" step="1" min="0" max="100" value={form.weight} disabled={isReadOnly} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} placeholder="Ex: 20 (para 20%)" style={inp} />
            </div>
            <div>
              <label style={label}>REALIZADO (%)</label>
              <input type="number" step="any" value={form.achieved_value} disabled={isReadOnly} onChange={e => setForm(f => ({ ...f, achieved_value: e.target.value }))} placeholder="0 – 120" style={inp} />
            </div>
          </div>

          <div>
            <label style={label}>UNIDADE</label>
            <input value={form.unit} disabled={isReadOnly} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="%, MW, horas, entrega" style={inp} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              ['target_80', 'TARGET 80%', 'Condição mínima de atingimento'],
              ['target_100', 'TARGET 100%', 'Meta padrão esperada'],
              ['target_120', 'TARGET 120%', 'Superação da meta'],
            ].map(([key, title, ph]) => (
              <div key={key}>
                <label style={label}>{title}</label>
                <textarea value={form[key]} disabled={isReadOnly} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} rows={3} style={{ ...inp, resize: 'vertical' }} placeholder={ph} />
              </div>
            ))}
          </div>

          <div>
            <label style={label}>STATUS</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {STATUS.map(s => (
                <button key={s.value} disabled={isReadOnly} onClick={() => setForm(f => ({ ...f, status: s.value }))} style={{
                  flex: 1, padding: '7px 0', borderRadius: 7, cursor: isReadOnly ? 'default' : 'pointer', fontSize: '0.72rem',
                  border: `1.5px solid ${form.status === s.value ? s.color : 'var(--border)'}`,
                  background: form.status === s.value ? s.bg : 'transparent',
                  color: form.status === s.value ? s.text : 'var(--text-secondary)',
                  fontWeight: 700,
                }}>{s.value}</button>
              ))}
            </div>
          </div>

          <div>
            <label style={label}>LINK DAS EVIDENCIAS (SHAREPOINT)</label>
            <input value={form.evidence_link} disabled={isReadOnly} onChange={e => setForm(f => ({ ...f, evidence_link: e.target.value }))} placeholder="https://..." style={inp} />
          </div>

          {meta?.id && (
            <div>
              <label style={label}>IMAGENS DA EVIDENCIA</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
                <div>
                  <label style={label}>LAYOUT DAS IMAGENS</label>
                  <select value={form.evidence_layout} disabled={isReadOnly} onChange={e => setForm(f => ({ ...f, evidence_layout: e.target.value }))} style={inp}>
                    {EVIDENCE_LAYOUTS.map(layout => <option key={layout.value} value={layout.value}>{layout.label}</option>)}
                  </select>
                  {!isReadOnly && <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 7, padding: '7px 10px', fontSize: '0.7rem', color: '#92400E', marginTop: 6 }}>
                    As imagens somente poderão ser incluídas após o salvamento do layout desejado e reabertura do modal.
                  </div>}
                </div>
                <div style={{ display: 'grid', ...layoutGridStyle(form.evidence_layout), gap: 6, height: 190, padding: 6, borderRadius: 8, border: '1px solid var(--border)', background: '#F8FAFC' }}>
                  {Array.from({ length: currentSlotCount }, (_, i) => (
                    <label key={i} style={{
                      ...layoutSlotStyle(form.evidence_layout, i),
                      position: 'relative',
                      minHeight: 0,
                      border: currentImages[i] ? '1px solid #CBD5E1' : '1px dashed #94A3B8',
                      borderRadius: 7,
                      background: '#fff',
                      overflow: 'hidden',
                      cursor: isReadOnly ? 'default' : (uploadingEvidence ? 'wait' : 'pointer'),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-muted)',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                    }}>
                      {currentImages[i] ? (
                        <>
                          <img src={currentImages[i]} alt={`Evidencia ${i + 1}`} style={{ width: '100%', height: '100%', objectFit: fitDraft[i] === 'cover' ? 'cover' : 'contain' }} />
                          {!isReadOnly && <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); handleFitSlot(i, fitDraft[i] === 'cover' ? 'contain' : 'cover'); }} disabled={uploadingEvidence}
                            title={fitDraft[i] === 'cover' ? 'Mostrar imagem inteira' : 'Cortar para preencher'}
                            style={{ position: 'absolute', left: 4, bottom: 4, borderRadius: 5, border: 'none', background: 'rgba(15,23,42,0.68)', color: '#fff', cursor: uploadingEvidence ? 'wait' : 'pointer', fontSize: '0.62rem', fontWeight: 800, padding: '3px 6px' }}>
                            {fitDraft[i] === 'cover' ? 'Cortar' : 'Inteira'}
                          </button>}
                          {!isReadOnly && <button type="button" onClick={e => { e.preventDefault(); e.stopPropagation(); handleClearEvidenceSlot(i); }} disabled={uploadingEvidence}
                            style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 5, border: 'none', background: 'rgba(15,23,42,0.68)', color: '#fff', cursor: uploadingEvidence ? 'wait' : 'pointer', fontSize: '0.72rem', fontWeight: 800 }}>
                            x
                          </button>}
                        </>
                      ) : (
                        <span>Imagem {i + 1}</span>
                      )}
                      <input type="file" accept="image/*" disabled={isReadOnly || uploadingEvidence} onChange={e => handleEvidenceSlot(i, e.target.files)} style={{ display: 'none' }} />
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginTop: 5 }}>
                {isReadOnly ? 'Imagens anexadas a esta meta coletiva.' : 'Clique em um espaco para escolher ou substituir a imagem daquela posicao.'}
              </div>
            </div>
          )}

          {!meta?.id && (
            <div>
              <label style={label}>LAYOUT DAS IMAGENS</label>
              <select value={form.evidence_layout} disabled={isReadOnly} onChange={e => setForm(f => ({ ...f, evidence_layout: e.target.value }))} style={inp}>
                {EVIDENCE_LAYOUTS.map(layout => <option key={layout.value} value={layout.value}>{layout.label}</option>)}
              </select>
              {!isReadOnly && <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 7, padding: '7px 10px', fontSize: '0.7rem', color: '#92400E', marginTop: 6 }}>
                As imagens somente poderão ser incluídas após o salvamento do layout desejado e reabertura do modal.
              </div>}
            </div>
          )}

          <div>
            <label style={label}>OBSERVACOES</label>
            <textarea value={form.notes} disabled={isReadOnly} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inp, resize: 'vertical' }} placeholder="Notas adicionais, contexto, dependências..." />
          </div>

          {error && <div style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 7, padding: '8px 12px', fontSize: '0.78rem' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {meta?.id && !isReadOnly && (
              <button onClick={handleDeleteClick} disabled={deletingMeta} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid #FCA5A5', background: '#FEF2F2', cursor: deletingMeta ? 'not-allowed' : 'pointer', fontSize: '0.82rem', color: '#DC2626', fontWeight: 700 }}>
                {deletingMeta ? 'Excluindo...' : 'Excluir'}
              </button>
            )}
            <button onClick={onClose} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{isReadOnly ? 'Fechar' : 'Cancelar'}</button>
            {!isReadOnly && (
              <button onClick={handleSubmit} disabled={saving} style={{ flex: 2, padding: '9px 0', borderRadius: 8, border: 'none', background: saving ? '#93C5FD' : 'var(--ctg-blue)', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: 700 }}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetaCell({ meta, member, canEdit, deleting, uploading, onEdit, onDelete, onEvidence }) {
  if (!meta) {
    return (
      <td style={{ padding: '7px 12px' }}>
        {canEdit ? (
          <button onClick={onEdit} style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
            + Adicionar
          </button>
        ) : <span style={{ color: 'var(--text-secondary)' }}>-</span>}
      </td>
    );
  }

  const images = visibleEvidenceImages(meta);
  const evidenceCount = images.filter(Boolean).length;

  return (
    <td style={{ padding: '7px 12px', minWidth: 150, verticalAlign: 'top' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <StatusBadge status={meta.status} />
        {canEdit && (
          <>
            <button onClick={onEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ctg-blue)', padding: '0 2px', fontSize: '0.7rem' }}>Editar</button>
            <button onClick={onDelete} disabled={deleting === meta.id} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: '0 2px', fontSize: '0.7rem' }}>Excluir</button>
          </>
        )}
      </div>
      <div title={meta.description} style={{ fontSize: '0.72rem', color: 'var(--text-primary)', marginTop: 5, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {meta.description}
      </div>
      <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', marginTop: 2 }}>
        Peso {meta.weight ? fmtPercent(meta.weight * 100) : '-'} - Realizado {fmtPercent(meta.achieved_value)}
      </div>
      {meta.evidence_link && (
        <a href={meta.evidence_link} target="_blank" rel="noopener noreferrer" title={meta.evidence_link}
          style={{ display: 'inline-block', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ctg-blue)', fontSize: '0.64rem', fontWeight: 700, marginTop: 3 }}>
          Link evidencias
        </a>
      )}
      {evidenceCount ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
          <img src={images.find(Boolean)} alt="Evidencia" style={{ maxWidth: 52, maxHeight: 32, borderRadius: 4, border: '1px solid var(--border)', display: 'block', objectFit: 'contain', background: '#fff' }} />
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.64rem' }}>{evidenceCount}/{evidenceSlotCount(evidenceLayout(meta))} img.</span>
        </div>
      ) : (
        <div style={{ color: '#B45309', fontSize: '0.64rem', marginTop: 4 }}>Sem evidencia</div>
      )}
      {canEdit && (
        <label style={{ display: 'inline-flex', marginTop: 4, fontSize: '0.66rem', color: uploading === meta.id ? 'var(--text-muted)' : 'var(--ctg-blue)', fontWeight: 700, cursor: uploading === meta.id ? 'wait' : 'pointer' }}>
          {uploading === meta.id ? 'Enviando...' : 'Imagem'}
          <input type="file" accept="image/*" multiple disabled={uploading === meta.id} onChange={e => onEvidence(meta, e.target.files)} style={{ display: 'none' }} />
        </label>
      )}
    </td>
  );
}

export default function MetasPage({ areaFilter: areaFilterProp = '', year: yearProp }) {
  const { user } = useAuth();
  const role = user?.role;
  const canEditOthers = ['admin', 'gestor', 'coordenador', 'gerente'].includes(role);
  const canViewAllMetas = ['admin', 'gestor', 'planejador', 'gerente'].includes(role);
  const year = yearProp ?? new Date().getFullYear();
  const area = ['engenheiro', 'coordenador'].includes(role)
    ? (user?.area || 'eletrica')
    : (areaFilterProp || 'eletrica');

  const [metas, setMetas] = useState([]);
  const [members, setMembers] = useState([]);
  const [allMembers, setAllMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [uploading, setUploading] = useState(null);
  const [reportUserId, setReportUserId] = useState(user?.id || '');
  const [previewSrc, setPreviewSrc] = useState(null);
  const [reportWarning, setReportWarning] = useState('');
  const [openGoalSections, setOpenGoalSections] = useState(() => new Set(['self']));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [metasRes, membersAreaRes, membersAllRes] = await Promise.all([
        api.get(`/metas?year=${year}`),
        api.get(canViewAllMetas ? '/metas/members' : `/metas/members?area=${area}`),
        api.get('/metas/members'),
      ]);
      setMetas(metasRes.data);
      setMembers(membersAreaRes.data);
      setAllMembers(membersAllRes.data);
      if (!reportUserId && user?.id) setReportUserId(user.id);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [year, area, reportUserId, user?.id, canViewAllMetas]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (previewSrc) URL.revokeObjectURL(previewSrc); }, [previewSrc]);

  async function handleSave(method, id, form) {
    if (method === 'post') await api.post('/metas', { ...form, year });
    else await api.put(`/metas/${id}`, { ...form, year });
    await load();
    if (form?.is_general) {
      setOpenGoalSections(prev => new Set([...prev, 'general']));
    }
  }

  async function handleDelete(id) {
    setDeleting(id);
    try {
      await api.delete(`/metas/${id}`);
      await load();
    } finally {
      setDeleting(null);
    }
  }

  async function handleEvidence(meta, filesLike) {
    const files = Array.from(filesLike || []).slice(0, 4);
    if (!files.length) return;
    setUploading(meta.id);
    try {
      const data = new FormData();
      files.forEach(file => data.append('evidence', file));
      await api.post(`/metas/${meta.id}/evidence`, data);
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Erro ao enviar imagem.');
    } finally {
      setUploading(null);
    }
  }

  async function handleEvidenceSlot(meta, slotIndex, file, layout = evidenceLayout(meta), fit = 'contain') {
    if (!meta?.id) return meta;
    setUploading(meta.id);
    try {
      let res;
      if (file) {
        const data = new FormData();
        data.append('slot', String(slotIndex));
        data.append('layout', layout);
        data.append('fit', fit);
        data.append('evidence', file);
        res = await api.post(`/metas/${meta.id}/evidence-slot`, data);
      } else if (file === null) {
        res = await api.delete(`/metas/${meta.id}/evidence-slot/${slotIndex}?layout=${encodeURIComponent(layout)}`);
      } else {
        res = await api.put(`/metas/${meta.id}/evidence-slot/${slotIndex}/fit`, { layout, fit });
      }
      await load();
      return res.data;
    } catch (e) {
      alert(e.response?.data?.error || 'Erro ao atualizar imagem.');
      throw e;
    } finally {
      setUploading(null);
    }
  }

  const metasByUser = {};
  for (const m of metas) {
    if (m.is_general) continue;
    if (!metasByUser[m.user_id]) metasByUser[m.user_id] = [];
    metasByUser[m.user_id].push(m);
  }
  const generalMetas = metas
    .filter(m => m.is_general)
    .sort((a, b) => (a.assigned_area || a.area || '').localeCompare(b.assigned_area || b.area || '', 'pt-BR') || a.meta_number - b.meta_number);

  const mgmtRoles = ['gerente', 'gestor', 'coordenador', 'planejador'];
  const mgmtMembers = allMembers.filter(m => mgmtRoles.includes(m.role));
  const areaMembers = members.filter(m => (canViewAllMetas || m.area === area) && !mgmtRoles.includes(m.role));
  const selfMember = members.find(m => m.id === user?.id) || allMembers.find(m => m.id === user?.id) || user;
  const collectiveAppliesToMember = (meta, member) => {
    if (!member?.id) return false;
    if (member.role === 'coordenador') {
      return (meta.assigned_area || meta.area) === (member.area || 'eletrica');
    }
    const assigned = Array.isArray(meta.assigned_user_ids) ? meta.assigned_user_ids.map(Number) : [];
    if (assigned.length > 0) return assigned.includes(Number(member.id));
    return (meta.assigned_area || meta.area) === (member.area || 'eletrica') || Number(meta.user_id) === Number(member.id);
  };
  const metasForMember = (member) => {
    const collective = generalMetas
      .filter(m => collectiveAppliesToMember(m, member))
      .map(m => withMemberWeight(m, member));
    const personal = (metasByUser[member?.id] || []);
    return [...collective, ...personal].sort((a, b) => {
      if (!!a.is_general !== !!b.is_general) return a.is_general ? -1 : 1;
      return a.meta_number - b.meta_number;
    });
  };
  const summaryMembers = canViewAllMetas ? members : areaMembers;
  const areaMetas = metas.filter(m => !m.is_general && summaryMembers.some(mem => mem.id === m.user_id));
  const withMeta = new Set(areaMetas.map(m => m.user_id)).size;
  const completed = areaMetas.filter(m => m.status === 'Concluida').length;
  const withEvidence = areaMetas.filter(m => visibleEvidenceImages(m).length > 0).length;
  const totalMetas = areaMetas.length;

  const listRows = areaMembers
    .map(m => ({ member: m, metas: metasForMember(m) }))
    .sort((a, b) => a.member.name.localeCompare(b.member.name, 'pt-BR'));
  const selfRow = selfMember ? { member: selfMember, metas: metasForMember(selfMember) } : null;

  const mgmtRows = mgmtMembers
    .map(m => ({ member: m, metas: metasForMember(m) }))
    .sort((a, b) => a.member.name.localeCompare(b.member.name, 'pt-BR'));

  const goalsSummaryRows = areaMetas
    .map(m => ({
      ...m,
      memberName: areaMembers.find(mem => mem.id === m.user_id)?.name || m.user_name || '-',
    }))
    .sort((a, b) => a.memberName.localeCompare(b.memberName, 'pt-BR') || a.meta_number - b.meta_number);

  const reportMember = allMembers.find(m => m.id === Number(reportUserId)) || allMembers.find(m => m.id === user?.id) || user;
  const reportMetas = metasForMember(reportMember);

  function generateReport() {
    if (!reportMember) return;
    const missing = reportMetas.filter(m => visibleEvidenceImages(m).length === 0).length;
    setReportWarning(missing ? `${missing} meta(s) ainda sem imagem de evidencia.` : '');
    const html = buildGoalsHTML({ member: reportMember, metas: reportMetas, year });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    if (previewSrc) URL.revokeObjectURL(previewSrc);
    setPreviewSrc(url);
  }

  function downloadReport() {
    if (!previewSrc || !reportMember) return;
    const a = document.createElement('a');
    a.href = previewSrc;
    a.download = `Metas_${year}_${reportMember.name.replace(/[^a-z0-9]+/gi, '_')}.html`;
    a.click();
  }

  function printReport() {
    document.getElementById('metas-report-frame')?.contentWindow?.print();
  }

  function nextMetaNumber(metaArr) {
    const used = new Set(metaArr.map(m => m.meta_number));
    for (let i = 1; i <= 10; i++) if (!used.has(i)) return i;
    return metaArr.length + 1;
  }

  function openNewGeneralMeta() {
    const targetArea = role === 'coordenador' ? (user?.area || 'eletrica') : area;
    const areaGeneralMetas = generalMetas.filter(m => (m.assigned_area || m.area) === targetArea);
    setModal({
      meta: {
        is_general: true,
        assigned_area: targetArea,
        area: targetArea,
        meta_number: nextMetaNumber(areaGeneralMetas),
        year,
      },
      userId: null,
    });
  }

  function openNewMeta() {
    const memberMetas = metasByUser[user?.id] || [];
    setModal({
      meta: {
        user_id: user?.id,
        area: user?.area || area,
        meta_number: nextMetaNumber(memberMetas),
        year,
      },
      userId: user?.id,
    });
  }

  useEffect(() => {
    window.addEventListener('new-meta', openNewMeta);
    return () => window.removeEventListener('new-meta', openNewMeta);
  });

  function toggleGoalSection(key) {
    setOpenGoalSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function CollapsibleSection({ sectionKey, title, sub, defaultOpen = false, children, action, tone = TABLE_TONES.subordinate }) {
    const open = openGoalSections.has(sectionKey) || defaultOpen;
    return (
      <div className="card" style={{ flexShrink: 0, overflow: 'hidden', padding: 0 }}>
        <button
          type="button"
          onClick={() => !defaultOpen && toggleGoalSection(sectionKey)}
          style={{ width: '100%', border: 'none', background: tone.header, color: '#fff', padding: '7px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: defaultOpen ? 'default' : 'pointer', textAlign: 'left' }}
        >
          <span style={{ minWidth: 0, display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', alignItems: 'center', columnGap: 8, rowGap: 4 }}>
            <span title={typeof title === 'string' ? title : undefined} style={{ display: 'block', fontSize: '0.86rem', fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
            {sub && <span style={{ display: 'block', color: 'rgba(255,255,255,0.72)', fontSize: '0.72rem', fontWeight: 800 }}>{sub}</span>}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {action}
            {!defaultOpen && <span style={{ fontSize: '0.8rem', fontWeight: 900 }}>{open ? '−' : '+'}</span>}
          </span>
        </button>
        {open && <div>{children}</div>}
      </div>
    );
  }

  function renderGoalsSummary() {
    return (
      <div className="card" style={{ flexShrink: 0 }}>
        <div style={{ padding: '6px 14px 4px', background: 'var(--ctg-navy)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0' }}>
          <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.76rem', fontWeight: 600, letterSpacing: '0.04em' }}>Resumo de propostas e atingimento</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', minWidth: 920 }}>
            <thead>
              <tr>
                {['Colaborador', 'Meta', 'Proposta', 'Peso', 'Realizado', 'Ating.', 'Evidencias'].map(h => (
                  <th key={h} style={{ background: '#1E3A6E', color: '#fff', padding: '7px 10px', textAlign: 'left', fontWeight: 700, fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {goalsSummaryRows.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 20, color: 'var(--text-secondary)' }}>Nenhuma meta cadastrada para este periodo</td></tr>
              ) : goalsSummaryRows.map((m, i) => (
                <tr key={m.id} style={{ background: i % 2 ? '#F8FAFC' : 'var(--bg-card)', borderBottom: '1px solid #E2E8F0' }}>
                  <td style={{ padding: '7px 10px', fontWeight: 600, color: 'var(--text-primary)' }}>{m.memberName}</td>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>Meta {m.meta_number}</td>
                  <td title={m.description} style={{ padding: '7px 10px', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.description}</td>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{m.weight ? `${fmtNumber(m.weight * 100)}%` : '-'}</td>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>{fmtPercent(m.achieved_value)}</td>
                  <td style={{ padding: '7px 10px', fontWeight: 700, color: (achievementPercent(m) || 0) >= 100 ? '#059669' : 'var(--text-secondary)' }}>{fmtPercent(achievementPercent(m))}</td>
                  <td style={{ padding: '7px 10px' }}>
                    {m.evidence_link ? (
                      <a href={m.evidence_link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ctg-blue)', fontWeight: 700 }}>Abrir</a>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderGeneralGoalsTable() {
    const targetArea = role === 'coordenador' ? (user?.area || 'eletrica') : area;
    const rows = generalMetas.filter(m => canViewAllMetas || (m.assigned_area || m.area) === targetArea);
    const canManageGeneral = role === 'coordenador' || ['admin', 'gestor', 'planejador'].includes(role);
    if (!canManageGeneral && rows.length === 0) return null;
    return (
      <CollapsibleSection
        sectionKey="general"
        title="Metas Coletivas"
        sub={`${rows.length} meta(s) coletiva(s)`}
        tone={TABLE_TONES.collective}
        action={null}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 980, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 120 }} />
              <col style={{ width: 360 }} />
              <col style={{ width: 180 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 100 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 110 }} />
            </colgroup>
            <thead>
              <tr>
                {['Area', 'Meta', 'Proposta', 'KPI', 'Peso', 'Realizado', 'Status', 'Evidencias'].map(h => (
                  <th key={h} style={{ background: TABLE_TONES.collective.sub, color: '#fff', padding: '7px 10px', textAlign: 'left', fontWeight: 700, fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 18, textAlign: 'center', color: 'var(--text-secondary)' }}>Nenhuma meta coletiva cadastrada para esta area.</td></tr>
              ) : rows.map((m, i) => (
                <tr key={m.id} onClick={() => setModal({ meta: m, userId: null, readOnly: !canManageGeneral })} style={{ background: i % 2 ? TABLE_TONES.collective.alt : TABLE_TONES.collective.row, borderBottom: '1px solid #BFECE5', boxShadow: `inset 3px 0 0 ${TABLE_TONES.collective.header}`, cursor: 'pointer' }}>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', fontWeight: 700 }}>{areaLabel(m.assigned_area || m.area)}</td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', fontWeight: 700, color: 'var(--ctg-navy)' }}>Meta {m.meta_number}</td>
                  <td title={m.description} style={{ padding: '8px 10px', maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.description}</td>
                  <td title={m.kpi || ''} style={{ padding: '8px 10px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.kpi || '-'}</td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{m.weight ? `${fmtNumber(m.weight * 100)}%` : '-'}</td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtPercent(m.achieved_value)}</td>
                  <td style={{ padding: '8px 10px' }}><StatusBadge status={m.status} /></td>
                  <td style={{ padding: '8px 10px' }}>{visibleEvidenceImages(m).filter(Boolean).length}/{evidenceSlotCount(evidenceLayout(m))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>
    );
  }

  function renderTable(rows, title, includeRole = false) {
    const colCount = includeRole ? 10 : 9;
    return (
      <div className="card" style={{ flexShrink: 0 }}>
        <div style={{ padding: '6px 14px 4px', background: includeRole ? 'var(--ctg-navy)' : '#1E3A6E', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0' }}>
          <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.76rem', fontWeight: 600, letterSpacing: '0.04em' }}>{title}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', minWidth: includeRole ? 1120 : 1020 }}>
            <thead>
              <tr>
                {['Colaborador', includeRole ? 'Cargo' : null, 'Meta 1', 'Meta 2', 'Meta 3', 'Meta 4', 'Meta 5', 'Concluidas', 'Evidencias', ''].filter(Boolean).map(h => (
                  <th key={h} style={{ background: includeRole ? '#1E3A6E' : 'var(--ctg-navy)', color: '#fff', padding: '7px 12px', textAlign: 'left', fontWeight: 700, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={colCount} style={{ textAlign: 'center', padding: 24, color: 'var(--text-secondary)' }}>Nenhum colaborador encontrado</td></tr>
              ) : rows.map(({ member, metas: mm }, i) => {
                const metaArr = [1, 2, 3, 4, 5].map(n => mm.find(m => m.meta_number === n));
                const concluded = mm.filter(m => m.status === 'Concluida').length;
                const evidences = mm.filter(m => visibleEvidenceImages(m).length > 0).length;
                const canEdit = includeRole
                  ? canEditOthers && !(role === 'coordenador' && ['gerente', 'gestor'].includes(member.role))
                  : canEditOthers || member.id === user?.id;
                const roleLabel = { gerente: 'Gerente', gestor: 'Gestor', coordenador: 'Coord.', planejador: 'Planejador' }[member.role] || member.role;

                return (
                  <tr key={member.id} style={{ background: i % 2 ? '#F8FAFC' : 'var(--bg-card)', borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '7px 12px', minWidth: 190 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <Avatar name={member.name} initials={member.avatar_initials} size={28} />
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{member.name}</span>
                      </div>
                    </td>
                    {includeRole && (
                      <td style={{ padding: '7px 12px' }}>
                        <span style={{ fontSize: '0.7rem', background: '#EFF6FF', color: '#1D4ED8', borderRadius: 4, padding: '2px 6px', fontWeight: 600 }}>{roleLabel}</span>
                      </td>
                    )}
                    {[1, 2, 3, 4, 5].map(n => (
                      <MetaCell
                        key={n}
                        meta={metaArr[n - 1]}
                        member={member}
                        canEdit={canEdit}
                        deleting={deleting}
                        uploading={uploading}
                        onEdit={() => setModal({ meta: metaArr[n - 1] || { user_id: member.id, area: member.area || area, meta_number: n, year }, userId: member.id })}
                        onDelete={() => handleDelete(metaArr[n - 1].id)}
                        onEvidence={handleEvidence}
                      />
                    ))}
                    <td style={{ padding: '7px 12px', fontVariantNumeric: 'tabular-nums' }}>{concluded ? <span style={{ color: '#10B981', fontWeight: 600 }}>{concluded}/{mm.length}</span> : <span style={{ color: 'var(--text-secondary)' }}>-</span>}</td>
                    <td style={{ padding: '7px 12px', fontVariantNumeric: 'tabular-nums' }}>{mm.length ? `${evidences}/${mm.length}` : '-'}</td>
                    <td style={{ padding: '7px 12px' }}>
                      {canEdit && mm.length < 10 && (
                        <button onClick={() => setModal({ meta: { user_id: member.id, area: member.area || area, meta_number: nextMetaNumber(mm), year }, userId: member.id })}
                          style={{ background: 'rgba(0,112,184,0.08)', border: '1px solid rgba(0,112,184,0.2)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', color: 'var(--ctg-blue)', fontSize: '0.68rem', fontWeight: 700 }}>
                          + meta
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
    );
  }

  function renderCollaboratorTable(member, memberMetas, options = {}) {
    const { open = false, sectionKey = `member-${member.id}`, title = member.name, sub, tone = TABLE_TONES.subordinate } = options;
    const canEdit = canEditOthers || member.id === user?.id;
    const personalMetas = (metasByUser[member.id] || []).sort((a, b) => a.meta_number - b.meta_number);
    const sortedMetas = [...memberMetas].sort((a, b) => {
      if (!!a.is_general !== !!b.is_general) return a.is_general ? -1 : 1;
      return a.meta_number - b.meta_number;
    });
    const collectiveCount = sortedMetas.filter(m => m.is_general).length;
    const individualCount = sortedMetas.length - collectiveCount;
    const weightSum = sortedMetas.reduce((sum, m) => sum + metaWeight(m, member.id), 0) * 100;
    const weightOk = Math.abs(weightSum - 100) < 0.05;
    const typeBadgeStyle = (variant) => {
      const palette = variant === 'total'
        ? { color: '#334155', background: '#F1F5F9', border: '#CBD5E1' }
        : variant === 'general'
          ? { color: '#075985', background: '#CCFBF1', border: '#99F6E4' }
          : { color: '#1D4ED8', background: '#DBEAFE', border: '#BFDBFE' };
      return ({
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: variant === 'total' ? 96 : 102,
      borderRadius: 999,
      padding: '2px 7px',
      color: palette.color,
      background: palette.background,
      border: `1px solid ${palette.border}`,
      fontWeight: 900,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
      fontSize: '0.62rem',
    });
    };
    const headerSub = sub || (
      <span style={{ display: 'inline-grid', gridTemplateColumns: '90px 108px 112px 118px 92px', alignItems: 'center', columnGap: 8, rowGap: 4 }}>
        <span style={{ minWidth: 0 }}>{areaLabel(member.area)}</span>
        <span style={typeBadgeStyle('total')}>{sortedMetas.length} Meta(s)</span>
        <span style={typeBadgeStyle('general')}>{collectiveCount} Coletiva(s)</span>
        <span style={typeBadgeStyle('individual')}>{individualCount} Individual(is)</span>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 86,
          borderRadius: 999,
          padding: '1px 7px',
          background: weightOk ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.2)',
          color: weightOk ? '#D1FAE5' : '#FEE2E2',
          border: `1px solid ${weightOk ? 'rgba(167,243,208,0.36)' : 'rgba(254,202,202,0.5)'}`,
          fontWeight: 900,
        }}>
          Peso {fmtPercent(weightSum)}
        </span>
      </span>
    );
    return (
      <CollapsibleSection
        key={member.id}
        sectionKey={sectionKey}
        title={title}
        sub={headerSub}
        defaultOpen={open}
        tone={tone}
        action={canEdit && personalMetas.length < 10 && (
          <button onClick={(e) => { e.stopPropagation(); setModal({ meta: { user_id: member.id, area: member.area || area, meta_number: nextMetaNumber(personalMetas), year }, userId: member.id }); }}
            style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 6, color: '#fff', cursor: 'pointer', fontSize: '0.68rem', fontWeight: 800, padding: '3px 8px' }}>
            + meta
          </button>
        )}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', minWidth: 1180, tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 110 }} />
              <col style={{ width: 410 }} />
              <col style={{ width: 180 }} />
              <col style={{ width: 85 }} />
              <col style={{ width: 105 }} />
              <col style={{ width: 85 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 75 }} />
            </colgroup>
            <thead>
              <tr>
                {['Tipo Meta', 'Proposta', 'KPI', 'Peso', 'Realizado', 'Ating.', 'Status', 'Evidencias'].map(h => (
                  <th key={h} style={{ background: tone.sub, color: '#fff', padding: '7px 10px', textAlign: 'left', fontWeight: 700, fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedMetas.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 18, textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Nenhuma meta cadastrada para este colaborador.
                  </td>
                </tr>
              ) : sortedMetas.map((m, i) => {
                const rowTone = m.is_general ? TABLE_TONES.collective : tone;
                const canManageCollective = m.is_general && (role === 'coordenador' || ['admin', 'gestor', 'planejador'].includes(role));
                const canEditRow = m.is_general ? canManageCollective : canEdit;
                const canOpenRow = m.is_general || canEditRow;
                return (
                <tr
                  key={`${m.is_general ? 'general' : 'personal'}-${m.id}`}
                  onClick={() => canOpenRow && setModal({ meta: m, userId: member.id, readOnly: !canEditRow })}
                  title={canOpenRow ? (canEditRow ? 'Clique para editar esta meta' : 'Clique para visualizar esta meta') : undefined}
                  style={{ background: i % 2 ? (rowTone.alt || '#F8FAFC') : (rowTone.row || 'var(--bg-card)'), borderBottom: '1px solid #E2E8F0', boxShadow: `inset 3px 0 0 ${rowTone.header}`, cursor: canOpenRow ? 'pointer' : 'default' }}
                >
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', fontWeight: 700, color: 'var(--ctg-navy)' }}>
                    <span style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.04em', borderRadius: 999, padding: '2px 7px', color: m.is_general ? '#075985' : '#1D4ED8', background: m.is_general ? '#CCFBF1' : '#DBEAFE', border: `1px solid ${m.is_general ? '#99F6E4' : '#BFDBFE'}` }}>
                      {m.is_general ? 'Coletiva' : 'Individual'}
                    </span>
                  </td>
                  <td title={m.description} style={{ padding: '8px 10px', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.description}</td>
                  <td title={m.kpi || ''} style={{ padding: '8px 10px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.kpi || '-'}</td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{m.weight ? `${fmtNumber(m.weight * 100)}%` : '-'}</td>
                  <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{fmtPercent(m.achieved_value)}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 700, color: (achievementPercent(m) || 0) >= 100 ? '#059669' : 'var(--text-secondary)' }}>{fmtPercent(achievementPercent(m))}</td>
                  <td style={{ padding: '8px 10px' }}><StatusBadge status={m.status} /></td>
                  <td style={{ padding: '8px 10px' }}>
                    {m.evidence_link ? (
                      <a href={m.evidence_link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: 'var(--ctg-blue)', fontWeight: 700 }}>Abrir</a>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>-</span>
                    )}
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      </CollapsibleSection>
    );
  }

  function renderDisciplineTables() {
    const grouped = new Map();
    for (const row of listRows) {
      const key = row.member.area || 'eletrica';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(row);
    }

    return [...grouped.entries()]
      .sort(([a], [b]) => areaLabel(a).localeCompare(areaLabel(b), 'pt-BR'))
      .map(([areaKey, rows]) => (
        <section key={areaKey} style={{ display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
          {canViewAllMetas && (
            <div style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--ctg-navy)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '2px 2px 0' }}>
              {areaLabel(areaKey)}
            </div>
          )}
          {rows.map(({ member, metas: mm }) => renderCollaboratorTable(member, mm, { sectionKey: `engineer-${member.id}` }))}
        </section>
      ));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {role !== 'engenheiro' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, flexShrink: 0 }}>
          {[
            { label: 'Colaboradores', val: summaryMembers.length, sub: canViewAllMetas ? 'Todas as areas' : areaLabel(area) },
            { label: 'Com metas cadastradas', val: withMeta, sub: `${summaryMembers.length - withMeta} sem registro` },
            { label: 'Metas concluidas', val: completed, sub: `${totalMetas - completed} abertas/canceladas` },
            { label: 'Evidencias anexadas', val: withEvidence, sub: `de ${totalMetas} metas` },
          ].map(c => (
            <div key={c.label} className="stat-card" style={{ padding: '10px 14px' }}>
              <div className="stat-label" style={{ fontSize: '0.68rem' }}>{c.label}</div>
              <div className="stat-value" style={{ fontSize: '1.3rem', color: 'var(--ctg-navy)' }}>{c.val}</div>
              <div className="stat-sub">{c.sub}</div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', paddingTop: 8 }}>
          {role === 'coordenador' && selfRow && renderCollaboratorTable(selfRow.member, selfRow.metas, { sectionKey: 'self', title: selfRow.member.name, tone: TABLE_TONES.personal })}
          {renderDisciplineTables()}

          <section style={{ display: 'grid', gridTemplateColumns: '360px minmax(0, 1fr)', gap: 12, alignItems: 'stretch', flexShrink: 0 }}>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ background: 'linear-gradient(135deg, #002A67, #0B4F82)', color: '#fff', padding: '10px 16px', fontSize: '0.9rem', fontWeight: 900, letterSpacing: '0.01em' }}>
                Relatorio individual
              </div>
              <div style={{ padding: '14px 16px' }}>
                {canEditOthers ? (
                  <label style={{ display: 'block', marginBottom: 10 }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>Colaborador</div>
                    <select className="form-input" value={reportUserId} onChange={e => setReportUserId(e.target.value)} style={{ width: '100%' }}>
                      {allMembers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </label>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <Avatar name={user?.name} initials={user?.avatar_initials} />
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{user?.name}</span>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
                  <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 8 }}><div className="stat-label">Metas</div><strong>{reportMetas.length}</strong></div>
                  <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 8 }}><div className="stat-label">Evid.</div><strong>{reportMetas.filter(m => visibleEvidenceImages(m).length > 0).length}</strong></div>
                  <div style={{ background: '#F8FAFC', borderRadius: 8, padding: 8 }}><div className="stat-label">Ano</div><strong>{year}</strong></div>
                </div>

                {reportWarning && <div style={{ background: '#FEF3C7', color: '#92400E', borderRadius: 7, padding: '8px 10px', fontSize: '0.75rem', marginBottom: 10 }}>{reportWarning}</div>}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary" onClick={generateReport} style={{ flex: 1, justifyContent: 'center', padding: '9px 10px' }}>Gerar</button>
                  <button onClick={downloadReport} disabled={!previewSrc} title="Baixar HTML" style={{ width: 38, borderRadius: 8, border: '1.5px solid #10B981', background: previewSrc ? '#F0FDF4' : 'var(--bg-app)', color: '#059669', cursor: previewSrc ? 'pointer' : 'not-allowed', fontWeight: 800 }}>H</button>
                  <button onClick={printReport} disabled={!previewSrc} title="Imprimir / salvar PDF" style={{ width: 38, borderRadius: 8, border: '1.5px solid #EA580C', background: previewSrc ? '#FFF7ED' : 'var(--bg-app)', color: '#EA580C', cursor: previewSrc ? 'pointer' : 'not-allowed', fontWeight: 800 }}>P</button>
                </div>
              </div>
            </div>

            <div className="card" style={{ minHeight: 430, overflow: 'hidden', padding: 0 }}>
              {previewSrc ? (
                <iframe id="metas-report-frame" src={previewSrc} title="Preview do relatorio de metas" style={{ width: '100%', height: '100%', border: 'none' }} />
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 22, color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                  O preview do relatorio aparece aqui depois de gerar.
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {modal && (
        <MetaModal
          meta={modal.meta?.id ? modal.meta : (modal.meta?.meta_number ? modal.meta : null)}
          userId={modal.userId ?? user?.id}
          area={area}
          year={year}
          members={allMembers}
          canEditOthers={canEditOthers}
          currentUser={user}
          readOnly={modal.readOnly}
          onSave={handleSave}
          onDelete={handleDelete}
          onEvidenceSlot={handleEvidenceSlot}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
