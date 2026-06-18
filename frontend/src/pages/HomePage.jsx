import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AlertBell from '../components/ui/AlertBell.jsx';
import api from '../utils/api.js';
import { formatBRL } from '../utils/format.js';

function pct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function weight(meta) {
  const n = Number(meta?.weight);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function weightedAchievement(metas) {
  const rows = metas
    .map(m => ({ w: weight(m), a: Number(m.achieved_value || 0) }))
    .filter(r => r.w > 0 && Number.isFinite(r.a));
  const total = rows.reduce((s, r) => s + r.w, 0);
  if (total <= 0) return null;
  return rows.reduce((s, r) => s + r.w * r.a, 0) / total;
}

function evidenceCount(meta) {
  const raw = meta?.evidence_images;
  if (Array.isArray(raw)) return raw.filter(Boolean).length;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).length;
    } catch {}
  }
  return meta?.evidence_image ? 1 : 0;
}

function areaLabel(area) {
  return {
    eletrica: 'Eng. Eletrica',
    mecanica: 'Eng. Mecanica',
    confiabilidade: 'Eng. Confiabilidade',
    modernizacao: 'Modernizacao',
  }[area] || 'Todas as areas';
}

function areaKey(value) {
  const raw = String(value || '').toLowerCase();
  const normalized = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (normalized.includes('confi')) return 'confiabilidade';
  if (normalized.includes('mec')) return 'mecanica';
  if (normalized.includes('ele') || normalized.includes('trica')) return 'eletrica';
  if (normalized.includes('modern')) return 'modernizacao';
  return normalized.trim();
}

const PROJECT_PLANTS = [
  'PCH Palmeiras',
  'PCH Retiro',
  'UHE Canoas I',
  'UHE Canoas II',
  'UHE Capivara',
  'UHE Chavantes',
  'UHE Garibaldi',
  'UHE Ilha Solteira',
  'UHE Jupiá',
  'UHE Jurumirim',
  'UHE Rosana',
  'UHE Salto',
  'UHE Salto Grande',
  'UHE Taquaruçu',
];

const PROJECT_PLANT_SIGLAS = {
  'PCH Palmeiras': 'PLM',
  'PCH Retiro': 'RET',
  'UHE Canoas I': 'CN1',
  'UHE Canoas II': 'CN2',
  'UHE Capivara': 'CPV',
  'UHE Chavantes': 'CHV',
  'UHE Garibaldi': 'GAR',
  'UHE Ilha Solteira': 'ILS',
  'UHE Jupiá': 'JUP',
  'UHE Jurumirim': 'JUR',
  'UHE Rosana': 'ROS',
  'UHE Salto': 'STO',
  'UHE Salto Grande': 'SAG',
  'UHE Taquaruçu': 'TAQ',
  Palmeiras: 'PLM',
  Retiro: 'RET',
  'Canoas I': 'CN1',
  'Canoas II': 'CN2',
  Capivara: 'CPV',
  Chavantes: 'CHV',
  Garibaldi: 'GAR',
  'Ilha Solteira': 'ILS',
  Jupiá: 'JUP',
  Jurumirim: 'JUR',
  Rosana: 'ROS',
  Salto: 'STO',
  'Salto Grande': 'SAG',
  Taquaruçu: 'TAQ',
};

const PROJECT_PLANT_COORDS = {
  'PCH Palmeiras': { lat: -20.5495, lon: -47.8132 },
  'PCH Retiro': { lat: -20.4366, lon: -47.8886 },
  'UHE Canoas I': { lat: -22.95, lon: -50.38 },
  'UHE Canoas II': { lat: -22.89, lon: -50.36 },
  'UHE Capivara': { lat: -22.66, lon: -51.36 },
  'UHE Chavantes': { lat: -23.12, lon: -49.73 },
  'UHE Garibaldi': { lat: -27.62, lon: -50.99 },
  'UHE Ilha Solteira': { lat: -20.38, lon: -51.37 },
  'UHE Jupiá': { lat: -20.78, lon: -51.63 },
  'UHE Jurumirim': { lat: -23.21, lon: -49.23 },
  'UHE Rosana': { lat: -22.6, lon: -52.87 },
  'UHE Salto': { lat: -18.78, lon: -51.08 },
  'UHE Salto Grande': { lat: -22.89, lon: -49.98 },
  'UHE Taquaruçu': { lat: -22.53, lon: -52 },
};

const PROJECT_PLANT_POLES = {
  'UHE Ilha Solteira': 'Rio Paraná',
  'UHE Jupiá': 'Rio Paraná',
  'UHE Salto': 'Rio Paraná',
  'UHE Canoas I': 'Polo Chavantes',
  'UHE Canoas II': 'Polo Chavantes',
  'UHE Chavantes': 'Polo Chavantes',
  'UHE Salto Grande': 'Polo Chavantes',
  'UHE Jurumirim': 'Polo Chavantes',
  'PCH Retiro': 'Polo Chavantes',
  'PCH Palmeiras': 'Polo Chavantes',
  'UHE Capivara': 'Polo Capivara',
  'UHE Rosana': 'Polo Capivara',
  'UHE Taquaruçu': 'Polo Capivara',
  'UHE Garibaldi': 'Polo Capivara',
};

const PLANT_FILTER_POLES = [
  {
    label: 'Rio Paraná',
    color: '#0070B8',
    bg: '#EFF6FF',
    plants: ['UHE Ilha Solteira', 'UHE Jupiá', 'UHE Salto'],
  },
  {
    label: 'Polo Chavantes',
    color: '#10B981',
    bg: '#ECFDF5',
    plants: ['UHE Canoas I', 'UHE Canoas II', 'UHE Chavantes', 'UHE Salto Grande', 'UHE Jurumirim', 'PCH Retiro', 'PCH Palmeiras'],
  },
  {
    label: 'Polo Capivara',
    color: '#6366F1',
    bg: '#EEF2FF',
    plants: ['UHE Capivara', 'UHE Rosana', 'UHE Taquaruçu', 'UHE Garibaldi'],
  },
];

const BRAZIL_OUTLINE = [
  [-51.2, 4.3], [-48.2, 2.3], [-45.8, 1.2], [-43.2, -2.5], [-41.2, -2.7], [-38.5, -5.1],
  [-35.1, -5.8], [-34.8, -8.1], [-36.4, -10.7], [-38.5, -12.8], [-39.2, -15.4], [-38.8, -18.1],
  [-40.7, -20.7], [-43.0, -22.9], [-44.9, -23.3], [-46.2, -25.1], [-48.6, -25.8], [-48.8, -28.6],
  [-52.1, -32.0], [-55.2, -31.0], [-57.6, -30.2], [-57.8, -27.4], [-54.8, -25.6], [-54.4, -23.0],
  [-57.5, -22.2], [-58.4, -19.8], [-61.7, -18.2], [-62.9, -15.6], [-60.4, -13.0], [-61.1, -10.2],
  [-65.0, -9.0], [-67.8, -7.1], [-70.1, -8.0], [-73.6, -7.0], [-73.9, -4.2], [-70.8, -2.0],
  [-69.7, 0.7], [-66.9, 1.1], [-63.6, 2.2], [-60.0, 4.9], [-56.8, 3.7], [-54.0, 5.2], [-51.2, 4.3],
];

const IAC_STATUS_OPTIONS = [
  { value: '0 - Not started yet', color: '#94A3B8', bg: '#F1F5F9', text: '#475569' },
  { value: '1 - IA and PDs', color: '#3B82F6', bg: '#EFF6FF', text: '#1D4ED8' },
  { value: '2 - Invitation letter', color: '#8B5CF6', bg: '#F5F3FF', text: '#5B21B6' },
  { value: '3 - Proposal received', color: '#F59E0B', bg: '#FEF3C7', text: '#92400E' },
  { value: '4 - Clarification', color: '#F97316', bg: '#FFF7ED', text: '#9A3412' },
  { value: '5 - Negotiation', color: '#0EA5E9', bg: '#E0F2FE', text: '#0369A1' },
  { value: '6 - ER/DM Review/Approval', color: '#10B981', bg: '#D1FAE5', text: '#065F46' },
  { value: '8 - Draft Contract', color: '#22C55E', bg: '#DCFCE7', text: '#14532D' },
  { value: '9 - Contract signed', color: '#16A34A', bg: '#BBF7D0', text: '#14532D' },
  { value: '91 - Hired 2025', color: '#64748B', bg: '#F1F5F9', text: '#334155' },
  { value: '10 - Cancelado', color: '#EF4444', bg: '#FEE2E2', text: '#991B1B' },
];

function statusLabel(status) {
  return (status || '').split(' - ').slice(1).join(' - ') || status;
}

function normalizePlant(value) {
  return compactLabel(value, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function MiniBar({ value, color = '#0070B8' }) {
  const width = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div style={{ height: 7, background: '#E2E8F0', borderRadius: 999, overflow: 'hidden' }}>
      <div style={{ width: `${width}%`, height: '100%', background: color, borderRadius: 999 }} />
    </div>
  );
}

function HorizontalBars({ items }) {
  const max = Math.max(1, ...items.map(item => Number(item.value) || 0));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minHeight: 0 }}>
      {items.map(item => (
        <div key={item.label} style={{ display: 'grid', gridTemplateColumns: '72px 1fr 24px', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
          <div style={{ height: 7, borderRadius: 999, background: '#E2E8F0', overflow: 'hidden' }}>
            <div style={{ width: `${((Number(item.value) || 0) / max) * 100}%`, height: '100%', background: item.color, borderRadius: 999 }} />
          </div>
          <span style={{ fontSize: '0.68rem', color: 'var(--ctg-navy)', fontWeight: 900, textAlign: 'right' }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function MiniList({ items, empty }) {
  return (
    <div style={{ minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 5 }}>
      {items.length ? items.slice(0, 4).map((item, idx) => (
        <div key={`${item.title}-${idx}`} style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--ctg-navy)', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
          <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sub}</span>
        </div>
      )) : (
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{empty}</span>
      )}
    </div>
  );
}

function parseMoney(value) {
  if (!value && value !== 0) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const negative = raw.startsWith('-') || raw.includes('(');
  const cleaned = raw.replace(/^[+-]/, '').replace(/[^\d.,]/g, '');
  if (!cleaned) return 0;
  if (cleaned.includes(',')) {
    const n = Number.parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    return (negative ? -1 : 1) * (Number.isFinite(n) ? n : 0);
  }
  if (cleaned.includes('.')) {
    const parts = cleaned.split('.');
    const normalized = parts.length === 2 && parts[1].length <= 2 ? cleaned : cleaned.replace(/\./g, '');
    const n = Number.parseFloat(normalized);
    return (negative ? -1 : 1) * (Number.isFinite(n) ? n : 0);
  }
  const n = Number.parseFloat(cleaned);
  return (negative ? -1 : 1) * (Number.isFinite(n) ? n : 0);
}

function moneyCompact(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (Math.abs(n) >= 1_000) return `R$ ${(n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function moneyAxis(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k`;
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function monthDiffFrom(dateValue) {
  if (!dateValue) return null;
  const opened = new Date(dateValue);
  if (Number.isNaN(opened.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - opened.getTime()) / (1000 * 60 * 60 * 24 * 30)));
}

function compactLabel(value, fallback = 'Nao informado') {
  return value ? String(value).replace('UHE ', '').replace('PCH ', '') : fallback;
}

function countBy(rows, key, fallback = 'Nao informado') {
  const map = new Map();
  rows.forEach(row => {
    const label = compactLabel(row[key], fallback);
    map.set(label, (map.get(label) || 0) + 1);
  });
  return [...map.entries()].map(([label, value]) => ({ label, value }));
}

function sumBy(rows, key, valueKey, fallback = 'Nao informado') {
  const map = new Map();
  rows.forEach(row => {
    const label = compactLabel(row[key], fallback);
    map.set(label, (map.get(label) || 0) + parseMoney(row[valueKey]));
  });
  return [...map.entries()].map(([label, value]) => ({ label, value }));
}

function plantValueData(rows) {
  const totals = new Map(PROJECT_PLANTS.map(plant => [normalizePlant(plant), {
    contratoTotal: 0,
    contratoUtilizado: 0,
    contratoSaldo: 0,
    siTotal: 0,
    siUtilizado: 0,
    siSaldo: 0,
    projectCount: 0,
    disciplines: new Map(),
  }]));
  rows.forEach(row => {
    const key = normalizePlant(row.uhe || 'Geral');
    if (!totals.has(key)) return;
    const entry = totals.get(key);
    const contratoTotal = parseMoney(row.valor_contrato);
    const contratoUtilizado = parseMoney(row.realizado_contrato);
    const siTotal = parseMoney(row.valor_si);
    const siUtilizado = parseMoney(row.realizado_si);
    entry.contratoTotal += contratoTotal;
    entry.contratoUtilizado += contratoUtilizado;
    entry.contratoSaldo += row.saldo_contrato ? parseMoney(row.saldo_contrato) : contratoTotal - contratoUtilizado;
    entry.siTotal += siTotal;
    entry.siUtilizado += siUtilizado;
    entry.siSaldo += row.saldo_si ? parseMoney(row.saldo_si) : siTotal - siUtilizado;
    entry.projectCount += 1;
    const discipline = compactLabel(row.disciplina || row.area || row.natureza, 'Nao informado');
    entry.disciplines.set(discipline, (entry.disciplines.get(discipline) || 0) + 1);
  });
  return PROJECT_PLANTS.map(plant => ({
    label: plant,
    sigla: PROJECT_PLANT_SIGLAS[plant],
    value: totals.get(normalizePlant(plant))?.contratoTotal || 0,
    ...totals.get(normalizePlant(plant)),
    disciplines: Object.fromEntries(totals.get(normalizePlant(plant))?.disciplines || []),
  }));
}

function TopBars({ items, valueFormatter = value => value, maxItems = 5 }) {
  const rows = items
    .filter(item => Number(item.value) > 0)
    .sort((a, b) => Number(b.value) - Number(a.value))
    .slice(0, maxItems);
  const max = Math.max(1, ...rows.map(item => Number(item.value) || 0));
  if (!rows.length) return <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Sem dados para este escopo.</span>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
      {rows.map((item, idx) => (
        <div key={item.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(64px, .75fr) 1fr auto', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
          <div style={{ height: 8, borderRadius: 999, background: '#E2E8F0', overflow: 'hidden' }}>
            <div style={{ width: `${((Number(item.value) || 0) / max) * 100}%`, height: '100%', borderRadius: 999, background: item.color || ['#0070B8', '#10B981', '#F59E0B', '#6366F1', '#EF4444'][idx % 5] }} />
          </div>
          <span style={{ fontSize: '0.68rem', color: 'var(--ctg-navy)', fontWeight: 900 }}>{valueFormatter(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

function TinyKpi({ label, value, sub, color = '#0070B8' }) {
  return (
    <div style={{ background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', minWidth: 0 }}>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ marginTop: 3, color, fontFamily: 'var(--font-display)', fontSize: '1.05rem', fontWeight: 900, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ marginTop: 3, color: 'var(--text-muted)', fontSize: '0.66rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
    </div>
  );
}

function FreshnessPills({ updated, stale }) {
  return (
    <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 999, background: 'rgba(16,185,129,0.14)', color: '#D1FAE5', fontSize: '0.68rem', fontWeight: 900 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34D399' }} />
        {updated} atualizados
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 999, background: stale ? 'rgba(239,68,68,0.16)' : 'rgba(255,255,255,0.12)', color: stale ? '#FECACA' : 'rgba(255,255,255,0.76)', fontSize: '0.68rem', fontWeight: 900 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: stale ? '#F87171' : 'rgba(255,255,255,0.44)' }} />
        {stale} sem revisao
      </span>
    </div>
  );
}

function ChartBox({ title, children }) {
  return (
    <div style={{ border: '1px solid var(--border)', background: '#FBFDFF', borderRadius: 8, padding: 10, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.66rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</div>
      {children}
    </div>
  );
}

function DistributionDonut({ items, total, centerLabel }) {
  const rows = items
    .filter(item => Number(item.value) > 0)
    .sort((a, b) => Number(b.value) - Number(a.value))
    .slice(0, 4);
  const sum = total || rows.reduce((acc, item) => acc + Number(item.value || 0), 0);
  if (!sum || !rows.length) return <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Sem dados para este escopo.</span>;
  let cursor = 0;
  const gradient = rows.map((item, idx) => {
    const start = cursor;
    cursor += (Number(item.value) / sum) * 100;
    const color = item.color || ['#0070B8', '#10B981', '#F59E0B', '#6366F1'][idx % 4];
    return `${color} ${start}% ${cursor}%`;
  }).join(', ');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '78px 1fr', alignItems: 'center', gap: 10, minHeight: 0 }}>
      <div style={{ width: 74, height: 74, borderRadius: '50%', background: `conic-gradient(${gradient}, #E2E8F0 0)`, display: 'grid', placeItems: 'center', boxShadow: 'inset 0 0 0 1px rgba(15,23,42,0.06)' }}>
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fff', display: 'grid', placeItems: 'center', color: 'var(--ctg-navy)', fontWeight: 900, fontSize: '0.78rem' }}>{centerLabel || sum}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
        {rows.map((item, idx) => (
          <div key={item.label} style={{ display: 'grid', gridTemplateColumns: '10px 1fr auto', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color || ['#0070B8', '#10B981', '#F59E0B', '#6366F1'][idx % 4] }} />
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
            <span style={{ color: 'var(--ctg-navy)', fontSize: '0.7rem', fontWeight: 900 }}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusChips({ items }) {
  const rows = items.filter(item => Number(item.value) > 0).sort((a, b) => Number(b.value) - Number(a.value)).slice(0, 6);
  if (!rows.length) return <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Sem status no escopo.</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignContent: 'flex-start', overflow: 'hidden' }}>
      {rows.map((item, idx) => (
        <span key={item.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%', border: `1px solid ${(item.color || '#0070B8')}33`, background: item.bg || '#F8FAFC', color: item.text || 'var(--text-secondary)', borderRadius: 999, padding: '5px 8px', fontSize: '0.68rem', fontWeight: 900 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: item.color || ['#0070B8', '#10B981', '#F59E0B', '#6366F1'][idx % 4], flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
          <strong style={{ color: 'var(--ctg-navy)' }}>{item.value}</strong>
        </span>
      ))}
    </div>
  );
}

function HeroMetric({ label, value, sub, color = '#0070B8', footer }) {
  return (
    <div style={{ borderRadius: 8, padding: 13, minHeight: 0, background: `linear-gradient(135deg, ${color}18, #fff 66%)`, border: `1px solid ${color}30`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10 }}>
      <div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.64rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
        <div style={{ marginTop: 6, color, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.75rem', lineHeight: 1 }}>{value}</div>
        <div style={{ marginTop: 5, color: 'var(--text-secondary)', fontSize: '0.74rem', lineHeight: 1.3 }}>{sub}</div>
      </div>
      {footer}
    </div>
  );
}

function FinanceSummary({ contrato, realizado, si }) {
  const pctRealizado = contrato > 0 ? Math.min(100, (realizado / contrato) * 100) : 0;
  return (
    <div style={{ borderRadius: 8, padding: 13, background: 'linear-gradient(135deg, rgba(0,112,184,0.14), #fff 68%)', border: '1px solid rgba(0,112,184,0.22)', minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10 }}>
      <div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.64rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Valores</div>
        <div style={{ marginTop: 5, color: 'var(--ctg-navy)', fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 900, lineHeight: 1 }}>{moneyCompact(contrato)}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: 3 }}>contrato total</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
        <TinyKpi label="Realizado" value={moneyCompact(realizado)} color="#10B981" />
        <TinyKpi label="SI" value={moneyCompact(si)} color="#6366F1" />
      </div>
      <MiniBar value={pctRealizado} color="#10B981" />
    </div>
  );
}

function AnalyticsPanel({ title, total, updated, stale, onClick, children }) {
  return (
    <button onClick={onClick} className="card" style={{ minHeight: 0, padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', cursor: 'pointer', textAlign: 'left', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
      <div style={{ background: 'var(--ctg-navy)', color: '#fff', padding: '9px 13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span className="card-title" style={{ color: '#fff' }}>{title}</span>
        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.76)', fontWeight: 800 }}>{total} registro(s)</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, padding: '10px 12px 0' }}>
        <TinyKpi label="Atualizados" value={updated} sub="com revisão recente" color="#10B981" />
        <TinyKpi label="Nao atualizados" value={stale} sub="pedem atencao" color="#EF4444" />
      </div>
      <div style={{ padding: 12, minHeight: 0, flex: 1, display: 'grid', gap: 10 }}>
        {children}
      </div>
    </button>
  );
}

function PanelSection({ title, children }) {
  return (
    <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 900 }}>{title}</div>
      {children}
    </div>
  );
}

function BetterAnalyticsPanel({ title, total, updated, stale, onClick, children }) {
  return (
    <button onClick={onClick} className="card" style={{ minHeight: 0, padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', cursor: 'pointer', textAlign: 'left', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
      <div style={{ background: 'var(--ctg-navy)', color: '#fff', padding: '10px 13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <span className="card-title" style={{ color: '#fff' }}>{title}</span>
          <span style={{ marginLeft: 8, fontSize: '0.7rem', color: 'rgba(255,255,255,0.66)', fontWeight: 800 }}>{total} registro(s)</span>
        </div>
        <FreshnessPills updated={updated} stale={stale} />
      </div>
      <div style={{ padding: 12, minHeight: 0, flex: 1, display: 'grid', gap: 10, background: 'linear-gradient(180deg, #fff 0%, #F8FAFC 100%)' }}>
        {children}
      </div>
    </button>
  );
}

function FaLikeIcon({ name, color }) {
  const paths = {
    'fa-bell': 'M10 18a2 2 0 002-2H8a2 2 0 002 2zm6-5V9a6 6 0 10-12 0v4l-1.4 1.4A1 1 0 003.3 16h13.4a1 1 0 00.7-1.7L16 13z',
    'fa-file-lines': 'M5 2a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7l-5-5H5zm7 1.5V7h3.5L12 3.5zM7 10h6v1.5H7V10zm0 3h6v1.5H7V13z',
    'fa-bullseye': 'M10 2a8 8 0 108 8h-2a6 6 0 11-6-6V2zm0 4a4 4 0 104 4h-2a2 2 0 11-2-2V6zm6.7-3.7l1 1a1 1 0 010 1.4L12.4 10H10V7.6l5.3-5.3a1 1 0 011.4 0z',
    'fa-calendar-days': 'M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zM4 8h12v8H4V8zm2 2h2v2H6v-2zm4 0h2v2h-2v-2zm4 0h1v2h-1v-2z',
  };
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill={color} aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={paths[name] || paths['fa-file-lines']} />
    </svg>
  );
}

function Donut({ value, color = '#0070B8', label }) {
  const size = 58;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  const dash = (safe / 100) * circumference;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E2E8F0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 900, color: 'var(--ctg-navy)' }}>
        {label || `${Math.round(safe)}%`}
      </div>
    </div>
  );
}

function ScopeTable({ title, rows, columns, onClick, empty }) {
  return (
    <div className="card" style={{ padding: 0, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <button onClick={onClick} style={{ border: 'none', background: 'var(--ctg-navy)', borderBottom: '1px solid rgba(255,255,255,0.12)', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', textAlign: 'left' }}>
        <span className="card-title" style={{ color: '#fff' }}>{title}</span>
        <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.76)', fontWeight: 800 }}>{rows.length} registro(s)</span>
      </button>
      <div style={{ overflow: 'auto', minHeight: 0, flex: 1 }}>
        <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: '0.78rem' }}>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key} style={{ position: 'sticky', top: 0, zIndex: 1, background: '#F8FAFC', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.66rem', textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row, idx) => (
              <tr key={row.id || `${title}-${idx}`} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 ? '#FBFDFF' : '#fff' }}>
                {columns.map(col => (
                  <td key={col.key} style={{ padding: '8px 10px', color: col.muted ? 'var(--text-muted)' : 'var(--text-primary)', fontWeight: col.strong ? 700 : 500, whiteSpace: col.nowrap ? 'nowrap' : 'normal' }}>
                    {col.render ? col.render(row) : (row[col.key] || '-')}
                  </td>
                ))}
              </tr>
            )) : (
              <tr>
                <td colSpan={columns.length} style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)' }}>{empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InsightCard({ title, icon, value, sub, color, gauge, onClick, children }) {
  return (
    <button onClick={onClick} className="card" style={{ minHeight: 0, padding: 13, border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <FaLikeIcon name={icon} color={color} />
            {title}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.45rem', fontWeight: 900, color: 'var(--ctg-navy)', marginTop: 6 }}>{value}</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', lineHeight: 1.35 }}>{sub}</div>
        </div>
        {gauge}
      </div>
      {children}
    </button>
  );
}

function SectionCard({ title, action, onClick, children, style }) {
  return (
    <div
      onClick={onClick}
      className="card"
      style={{
        border: '1px solid var(--border)',
        background: 'var(--bg-card)',
        borderRadius: 8,
        padding: 0,
        textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default',
        overflow: 'hidden',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      <div style={{ padding: '11px 13px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0 }}>
        <span className="card-title" style={{ color: 'var(--ctg-navy)' }}>{title}</span>
        {action && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 900 }}>{action}</span>}
      </div>
      <div style={{ padding: 13, minHeight: 0, flex: 1 }}>
        {children}
      </div>
    </div>
  );
}

function SummaryMetric({ label, value, sub, color, onClick }) {
  return (
    <button onClick={onClick} style={{ border: '1px solid var(--border)', background: '#fff', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', textAlign: 'left', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.66rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: color }} />
      </div>
      <div style={{ color: 'var(--ctg-navy)', fontFamily: 'var(--font-display)', fontSize: '1.45rem', lineHeight: 1, fontWeight: 900 }}>{value}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>
      <MiniBar value={Number.parseFloat(String(value).replace(',', '.')) || 0} color={color} />
    </button>
  );
}

function WorkPanel({ title, eyebrow, primary, sub, color, updated, stale, onClick, children }) {
  return (
    <SectionCard title={title} action={`${updated} atualizados | ${stale} sem revisao`} onClick={onClick}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(170px, .75fr) minmax(0, 1.25fr)', gap: 12, height: '100%', minHeight: 0 }}>
        <div style={{ borderRadius: 8, padding: 13, background: `linear-gradient(135deg, ${color}18, #fff 70%)`, border: `1px solid ${color}30`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 0 }}>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.64rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{eyebrow}</div>
            <div style={{ color, fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 900, marginTop: 6, lineHeight: 1 }}>{primary}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', marginTop: 5, lineHeight: 1.3 }}>{sub}</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
            <span style={{ borderRadius: 999, padding: '4px 8px', background: 'rgba(16,185,129,0.12)', color: '#047857', fontSize: '0.66rem', fontWeight: 900 }}>{updated} ok</span>
            <span style={{ borderRadius: 999, padding: '4px 8px', background: stale ? 'rgba(239,68,68,0.1)' : '#F1F5F9', color: stale ? '#B91C1C' : 'var(--text-muted)', fontSize: '0.66rem', fontWeight: 900 }}>{stale} revisar</span>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10, minHeight: 0 }}>
          {children}
        </div>
      </div>
    </SectionCard>
  );
}

function AttentionList({ items }) {
  const rows = items.filter(item => Number(item.value) > 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.length ? rows.map(item => (
        <div key={item.label} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: 'var(--ctg-navy)', fontSize: '0.76rem', fontWeight: 900 }}>{item.label}</div>
            <MiniBar value={(item.value / Math.max(...rows.map(r => r.value), 1)) * 100} color={item.color} />
          </div>
          <strong style={{ color: item.color, fontSize: '0.85rem' }}>{item.value}</strong>
        </div>
      )) : <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>Sem pendencias relevantes no momento.</span>}
    </div>
  );
}

function TimelineList({ items }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
      {items.length ? items.slice(0, 6).map((item, idx) => (
        <div key={`${item.title}-${idx}`} style={{ display: 'grid', gridTemplateColumns: '10px 1fr', gap: 9, minWidth: 0 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: item.color, marginTop: 4 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ color: 'var(--ctg-navy)', fontSize: '0.76rem', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.sub}</div>
          </div>
        </div>
      )) : <span style={{ color: 'var(--text-muted)', fontSize: '0.76rem' }}>Nada urgente cadastrado para este escopo.</span>}
    </div>
  );
}

function HomeCard({ title, icon, action, children, onClick, style }) {
  const iconColor = icon === 'warning' ? '#F59E0B' : '#0070B8';
  const iconBg = icon === 'warning' ? '#FEF3C7' : '#EFF6FF';
  return (
    <div
      onClick={onClick}
      className="card"
      style={{
        padding: 0,
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: '#fff',
        overflow: 'hidden',
        minHeight: 0,
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      <div style={{ padding: '11px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {icon && <span style={{ width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center', background: iconBg, color: iconColor, fontWeight: 900, fontSize: '0.8rem' }}>
            {['target', 'file', 'folder', 'warning'].includes(icon) ? <OperationalIcon name={icon} color={iconColor} /> : icon}
          </span>}
          <span style={{ color: 'var(--ctg-navy)', fontWeight: 900, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
        </div>
        {action && <span style={{ color: '#0070B8', fontSize: '0.68rem', fontWeight: 900 }}>{action}</span>}
      </div>
      <div style={{ padding: '0 14px 14px', flex: 1, minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}

function OperationalIcon({ name, color }) {
  const paths = {
    target: 'M10 18a8 8 0 1 1 8-8h-2a6 6 0 1 0-6 6v2Zm0-4a4 4 0 1 1 4-4h-2a2 2 0 1 0-2 2v2Zm5.9-10.9.9.9-5.5 5.5H9.8V8.1l5.5-5.5c.2-.2.4-.2.6 0Z',
    file: 'M6 2h6l4 4v12H6V2Zm6 1.8V7h3.2L12 3.8ZM8 10h6v1.3H8V10Zm0 3h6v1.3H8V13Z',
    folder: 'M3 5.5A1.5 1.5 0 0 1 4.5 4H8l1.5 1.5h6A1.5 1.5 0 0 1 17 7v7.5A1.5 1.5 0 0 1 15.5 16h-11A1.5 1.5 0 0 1 3 14.5v-9Z',
    warning: 'M10 3 18 17H2L10 3Zm-.7 5v4h1.4V8H9.3Zm0 5.2v1.4h1.4v-1.4H9.3Z',
    calendar: 'M6 2h1.4v2h5.2V2H14v2h1.5A1.5 1.5 0 0 1 17 5.5V16a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 16V5.5A1.5 1.5 0 0 1 4.5 4H6V2Zm9.5 6h-11v8h11V8Zm-9 2h2v2h-2v-2Z',
    users: 'M7.5 9a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm-5 7.5c.4-2.6 2.4-4.5 5-4.5s4.6 1.9 5 4.5H2.5Zm9.8-7.8A2.5 2.5 0 1 0 12.3 4a4.4 4.4 0 0 1 0 4.7Zm1.2 7.8a6.4 6.4 0 0 0-1.8-3.6 4.6 4.6 0 0 1 5.8 3.6h-4Z',
  };
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" fill={color} aria-hidden="true">
      <path d={paths[name] || paths.target} />
    </svg>
  );
}

function Sparkline({ color }) {
  return (
    <svg viewBox="0 0 70 28" width="58" height="24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M4 21 C14 18 17 14 25 16 S37 20 44 13 S56 8 66 10" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function updateHealthColor(value) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return safe >= 90 ? '#10B981' : safe >= 70 ? '#F59E0B' : '#EF4444';
}

function OperationalTile({ label, value, sub, color, icon, trend, gaugeValue, onClick }) {
  const hasGauge = gaugeValue !== undefined;
  const statusColor = hasGauge ? updateHealthColor(gaugeValue) : color;
  const hasBubble = trend || hasGauge;
  return (
    <button
      onClick={onClick}
      style={{
        position: 'relative',
        overflow: 'hidden',
        border: 'none',
        background: hasBubble ? `linear-gradient(110deg, ${statusColor}20 0%, rgba(255,255,255,0) 72%)` : 'transparent',
        borderRadius: hasBubble ? 8 : 0,
        padding: '4px 8px',
        textAlign: 'left',
        cursor: 'pointer',
        minWidth: 0,
        borderRight: '1px solid var(--border)',
      }}
    >
      {hasBubble && (
        <>
          <span style={{ position: 'absolute', right: -28, top: -24, width: 92, height: 72, borderRadius: '50%', background: `${statusColor}28`, filter: 'blur(1px)', animation: 'metricBubbleFloat 6.5s ease-in-out infinite', pointerEvents: 'none' }} />
          <span style={{ position: 'absolute', right: 42, bottom: -28, width: 64, height: 50, borderRadius: '50%', background: `${statusColor}1f`, filter: 'blur(1px)', animation: 'metricBubbleFloat 8s ease-in-out infinite reverse', pointerEvents: 'none' }} />
        </>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr auto', gap: 9, alignItems: 'center', minWidth: 0 }}>
        <span style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', background: `${color}18`, color, fontWeight: 900, flexShrink: 0 }}>
          <OperationalIcon name={icon} color={color} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 900 }}>{label}</div>
          <div style={{ color: 'var(--ctg-navy)', fontFamily: 'var(--font-display)', fontSize: 'clamp(1.1rem, 2vw, 1.5rem)', fontWeight: 900, lineHeight: 1.05, marginTop: 1 }}>{value}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>{sub}</div>
        </div>
        {trend && <Sparkline color={statusColor} />}
      </div>
    </button>
  );
}

function StatBox({ label, value, sub, color = '#0070B8', children }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 11, background: '#FBFDFF', minHeight: 0 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 'clamp(0.6rem, 0.9vw, 0.72rem)', fontWeight: 900 }}>{label}</div>
      <div style={{ color, fontFamily: 'var(--font-display)', fontSize: 'clamp(1.15rem, 1.8vw, 1.6rem)', fontWeight: 900, marginTop: 5, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ color: 'var(--text-muted)', fontSize: '0.66rem', marginTop: 5 }}>{sub}</div>}
      {children && <div style={{ marginTop: 9 }}>{children}</div>}
    </div>
  );
}

function ValueConsumptionBox({ label, value, realized, color }) {
  const pctValue = value > 0 ? Math.max(0, Math.min(100, (realized / value) * 100)) : 0;
  return (
    <StatBox label={label} value={moneyCompact(value)} color="#001F5B">
      <div style={{ display: 'grid', gap: 7 }}>
        <div>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.62rem', fontWeight: 900 }}>Consumido</div>
          <div style={{ color, fontWeight: 900, fontSize: '0.86rem' }}>{moneyCompact(realized)} <span style={{ color: 'var(--text-muted)', fontSize: '0.62rem' }}>({Math.round(pctValue)}%)</span></div>
          <MiniBar value={pctValue} color={color} />
        </div>
      </div>
    </StatBox>
  );
}

function makePlantWavePath(x, topY, bottomY, w, amp) {
  const startX = x - w;
  const hw = w / 2;
  let d = `M ${startX} ${bottomY} L ${startX} ${topY}`;
  for (let k = 0; k < 3; k += 1) {
    const x0 = startX + k * w;
    d += ` C ${x0 + hw * 0.5} ${topY - amp} ${x0 + hw * 1.5} ${topY + amp} ${x0 + w} ${topY}`;
  }
  d += ` L ${startX + 3 * w} ${bottomY} Z`;
  return d;
}

function PlantColumnChart({ items }) {
  const [hovered, setHovered] = useState(null);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });
  const rows = items;
  if (!rows.length) return <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Sem valores por usina neste escopo.</span>;
  const tooltipRow = (label, value, color) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: '0.76rem', marginBottom: 2 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, opacity: 0.85, whiteSpace: 'nowrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
        {label}
      </span>
      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: value === 0 ? 'var(--text-muted)' : undefined }}>
        {value === 0 ? '-' : formatBRL(value)}
      </span>
    </div>
  );
  const tooltipSection = title => (
    <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginTop: 6, marginBottom: 3, paddingTop: 5, borderTop: '1px solid var(--border)' }}>
      {title}
    </div>
  );
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: '#FBFDFF', minHeight: 0, height: '100%', position: 'relative', overflow: 'visible', display: 'flex', flexDirection: 'column' }} onMouseMove={e => setTipPos({ x: e.clientX, y: e.clientY })} onMouseLeave={() => setHovered(null)}>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, flexShrink: 0 }}>Por usina</div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${rows.length}, minmax(24px, 1fr))`, gridTemplateRows: '1fr', gap: 7, flex: 1, minHeight: 60, paddingBottom: 6 }}>
        {rows.map((item) => {
          const contratoTotal = Number(item.contratoTotal) || 0;
          const contratoUtilizado = Number(item.contratoUtilizado) || 0;
          const hasValue = contratoTotal > 0;
          const utilizationPct = hasValue ? Math.min(100, (contratoUtilizado / contratoTotal) * 100) : 0;
          const barColor = utilizationPct >= 100 ? '#EF4444' : utilizationPct >= 80 ? '#F59E0B' : '#10B981';
          const sigla = item.sigla || PROJECT_PLANT_SIGLAS[item.label] || PROJECT_PLANT_SIGLAS[compactLabel(item.label)] || compactLabel(item.label).slice(0, 3).toUpperCase();
          const waveTop = 100 - utilizationPct;
          return (
            <div
              key={item.label}
              onMouseEnter={() => setHovered(item)}
              onFocus={() => setHovered(item)}
              style={{ display: 'grid', gridTemplateRows: '12px 1fr 20px', gap: 2, justifyItems: 'center', minWidth: 0, cursor: 'default' }}
            >
              <div style={{ color: hasValue ? 'var(--ctg-navy)' : '#94A3B8', fontSize: '0.58rem', fontWeight: 900, whiteSpace: 'nowrap' }}>{hasValue ? moneyAxis(contratoTotal) : '-'}</div>
              <div style={{ width: '100%', maxWidth: 34, height: '100%', borderRadius: 4, background: '#E2E8F0', position: 'relative', overflow: 'hidden' }}>
                {hasValue && utilizationPct > 0 && (
                  <svg viewBox="0 0 34 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
                    <g>
                      <animateTransform attributeName="transform" type="translate" from="0 0" to="34 0" dur="3.6s" repeatCount="indefinite" />
                      <path d={makePlantWavePath(0, waveTop, 100, 34, 2.2)} fill={barColor} />
                    </g>
                    <g>
                      <animateTransform attributeName="transform" type="translate" from="-17 0" to="17 0" dur="5.2s" repeatCount="indefinite" />
                      <path d={makePlantWavePath(0, waveTop, 100, 34, 1.6)} fill={barColor} opacity="0.35" />
                    </g>
                  </svg>
                )}
              </div>
              <div style={{ color: 'var(--ctg-navy)', fontSize: '0.58rem', lineHeight: 1, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', alignSelf: 'start', paddingTop: 1 }}>{sigla || item.label}</div>
            </div>
          );
        })}
      </div>
      {hovered && (
        <div style={{
          position: 'fixed',
          left: tipPos.x + 16,
          top: tipPos.y - 10,
          zIndex: 9999,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '10px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
          fontSize: '0.8rem', minWidth: 230, maxWidth: 280, pointerEvents: 'none',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 5, color: 'var(--ctg-navy)', fontSize: '0.85rem', borderBottom: '1px solid var(--border)', paddingBottom: 5 }}>
            {hovered.label}
          </div>
          {tooltipSection('Contrato')}
          {tooltipRow('Total', hovered.contratoTotal || 0, '#001F5B')}
          {tooltipRow('Utilizado', hovered.contratoUtilizado || 0, '#10B981')}
          {tooltipRow('Saldo', hovered.contratoSaldo || 0, '#64748B')}
          {tooltipSection('SI')}
          {tooltipRow('Total', hovered.siTotal || 0, '#6366F1')}
          {tooltipRow('Utilizado', hovered.siUtilizado || 0, '#7C3AED')}
          {tooltipRow('Saldo', hovered.siSaldo || 0, '#64748B')}
        </div>
      )}
    </div>
  );
}

function PlantValueSankey({ items, selectedPlant, onSelectPlant, expanded = false }) {
  const [hovered, setHovered] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const maxSi = Math.max(1, ...items.map(item => Number(item.siTotal) || 0));
  const totalSi = items.reduce((sum, item) => sum + (Number(item.siTotal) || 0), 0);
  const poleColors = {
    'Rio Paraná': '#0070B8',
    'Polo Chavantes': '#10B981',
    'Polo Capivara': '#6366F1',
  };
  const colorFor = (value, pole) => {
    const intensity = Math.max(0, Math.min(1, Number(value) / maxSi));
    if (!value) return '#E2E8F0';
    if (pole === 'Polo Chavantes') return intensity > 0.46 ? '#059669' : '#6EE7B7';
    if (pole === 'Polo Capivara') return intensity > 0.46 ? '#4F46E5' : '#A5B4FC';
    return intensity > 0.46 ? '#0070B8' : '#7DD3FC';
  };
  const selectedKey = selectedPlant ? normalizePlant(selectedPlant) : '';
  const hover = hovered;
  const poles = ['Rio Paraná', 'Polo Chavantes', 'Polo Capivara'].map((name, idx) => {
    const plants = items
      .filter(item => PROJECT_PLANT_POLES[item.label] === name)
      .map(item => ({ ...item, pole: name, color: colorFor(item.siTotal, name) }));
    return {
      name,
      color: poleColors[name],
      value: plants.reduce((sum, item) => sum + (Number(item.siTotal) || 0), 0),
      plants,
      y: 23 + idx * 37,
    };
  });
  const plantRows = poles.flatMap(pole => pole.plants);
  const rowGap = plantRows.length > 1 ? 96 / (plantRows.length - 1) : 0;
  const plantLayout = new Map(plantRows.map((item, idx) => [item.label, { ...item, y: 17 + idx * rowGap }]));
  const linkWidth = value => Math.max(2.2, Math.min(11, 2.2 + (Number(value || 0) / Math.max(maxSi, 1)) * 8.8));
  const curvePath = (x1, y1, x2, y2) => {
    const c = Math.max(10, (x2 - x1) * 0.52);
    return `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
  };
  const tooltipRow = (label, value, color) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: '0.72rem', marginBottom: 2 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, opacity: 0.86, whiteSpace: 'nowrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
        {label}
      </span>
      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: value === 0 ? 'rgba(255,255,255,0.58)' : '#fff' }}>
        {value === 0 ? '-' : formatBRL(value)}
      </span>
    </div>
  );
  const disciplineRows = Object.entries(hover?.disciplines || {});
  const viewBox = expanded ? '0 0 140 130' : '0 0 116 130';
  const node = expanded
    ? { totalX: 8, totalW: 18, totalY: 65, poleX: 51, poleW: 18, plantX: 104, plantW: 8, plantTextX: 115, totalLinkX: 26, poleLinkInX: 55, poleLinkOutX: 69, plantLinkX: 106 }
    : { totalX: 3, totalW: 16, totalY: 65, poleX: 37, poleW: 18, plantX: 82, plantW: 8, plantTextX: 93, totalLinkX: 19, poleLinkInX: 41, poleLinkOutX: 55, plantLinkX: 90 };
  return (
    <div style={{ height: '100%', minHeight: 0, display: 'grid', gridTemplateRows: selectedPlant ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr)', gap: 8 }}>
      <div style={{ position: 'relative', border: '1px solid var(--border)', borderRadius: 8, background: 'linear-gradient(145deg, #F8FAFC, #EFF6FF)', overflow: 'visible', minHeight: 0 }} onMouseLeave={() => setHovered(null)}>
        <svg
          viewBox={viewBox}
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Fluxo dos valores de SI por polo e usina"
          style={{ borderRadius: 8, background: '#F8FAFC' }}
        >
          <rect x="0" y="0" width={expanded ? 140 : 116} height="130" rx="2" fill="#F8FAFC" />
          {poles.map(pole => (
            <path key={`total-${pole.name}`} d={curvePath(node.totalLinkX, node.totalY, node.poleLinkInX, pole.y)} fill="none" stroke={pole.color} strokeWidth={linkWidth(pole.value)} strokeOpacity="0.22" />
          ))}
          {poles.flatMap(pole => pole.plants.map(plant => {
            const target = plantLayout.get(plant.label);
            const isSelected = selectedKey && normalizePlant(plant.label) === selectedKey;
            const hasSelection = Boolean(selectedKey);
            return (
              <path
                key={`link-${plant.label}`}
                d={curvePath(node.poleLinkOutX, pole.y, node.plantLinkX, target.y)}
                fill="none"
                stroke={plant.color}
                strokeWidth={linkWidth(plant.siTotal)}
                strokeLinecap="round"
                strokeOpacity={hasSelection && !isSelected ? 0.14 : 0.52}
                onMouseEnter={(e) => { setHovered(plant); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                onMouseMove={(e) => { setHovered(plant); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                onClick={(e) => { e.stopPropagation(); onSelectPlant(isSelected ? '' : plant.label); }}
                style={{ cursor: 'pointer' }}
              />
            );
          }))}
          <rect x={node.totalX} y={node.totalY - 20} width={node.totalW} height="40" rx="3" fill="#001F5B" />
          <text x={node.totalX + node.totalW / 2} y={node.totalY - 6} textAnchor="middle" style={{ fill: '#fff', fontSize: '4px', fontWeight: 900 }}>SI</text>
          <text x={node.totalX + node.totalW / 2} y={node.totalY + 1} textAnchor="middle" style={{ fill: '#fff', fontSize: '4px', fontWeight: 900 }}>total</text>
          <text x={node.totalX + node.totalW / 2} y={node.totalY + 9} textAnchor="middle" style={{ fill: '#CDEEFF', fontSize: '3.2px', fontWeight: 800 }}>{moneyCompact(totalSi).replace('R$ ', '')}</text>
          {poles.map(pole => (
            <g key={pole.name}>
              <rect x={node.poleX} y={pole.y - 7.5} width={node.poleW} height="15" rx="3" fill={pole.color} />
              <text x={node.poleX + node.poleW / 2} y={pole.y - 1} textAnchor="middle" style={{ fill: '#fff', fontSize: '3.1px', fontWeight: 900 }}>{pole.name.replace('Polo ', '')}</text>
              <text x={node.poleX + node.poleW / 2} y={pole.y + 4.5} textAnchor="middle" style={{ fill: 'rgba(255,255,255,0.88)', fontSize: '2.7px', fontWeight: 800 }}>{moneyCompact(pole.value).replace('R$ ', '')}</text>
            </g>
          ))}
          {plantRows.map(plant => {
            const row = plantLayout.get(plant.label);
            const isSelected = selectedKey && normalizePlant(plant.label) === selectedKey;
            const hasSelection = Boolean(selectedKey);
            return (
              <g
                key={`plant-${plant.label}`}
                role="button"
                tabIndex="0"
                onMouseEnter={(e) => { setHovered(plant); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                onMouseMove={(e) => { setHovered(plant); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                onFocus={() => setHovered(plant)}
                onClick={(e) => { e.stopPropagation(); onSelectPlant(isSelected ? '' : plant.label); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectPlant(isSelected ? '' : plant.label);
                  }
                }}
                style={{ cursor: 'pointer', opacity: hasSelection && !isSelected ? 0.44 : 1 }}
              >
                <rect x={node.plantX} y={row.y - 3.5} width={node.plantW} height="7" rx="1.8" fill={isSelected ? '#F59E0B' : plant.color} stroke="#fff" strokeWidth="0.5" />
                <text x={node.plantTextX} y={row.y + 1.4} style={{ fill: 'var(--ctg-navy)', fontSize: '3.5px', fontWeight: 900 }}>{plant.sigla}</text>
              </g>
            );
          })}
        </svg>
        {hover && (
          <div style={{ position: 'fixed', left: tooltipPos.x + 14, top: tooltipPos.y + 14, zIndex: 9999, minWidth: 230, maxWidth: 300, background: 'rgba(15,23,42,0.94)', color: '#fff', borderRadius: 8, padding: '9px 10px', boxShadow: '0 14px 32px rgba(15,23,42,0.22)', pointerEvents: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', marginBottom: 5 }}>
              <div style={{ fontSize: '0.76rem', fontWeight: 800 }}>{hover.label}</div>
              <div style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.72)', fontVariantNumeric: 'tabular-nums' }}>{hover.projectCount || 0} projeto(s)</div>
            </div>
            {tooltipRow('Contrato', hover.contratoTotal || 0, '#0070B8')}
            {tooltipRow('SI', hover.siTotal || 0, '#6366F1')}
            {tooltipRow('SI utilizado', hover.siUtilizado || 0, '#10B981')}
            <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(255,255,255,0.62)', marginTop: 6, marginBottom: 3, paddingTop: 5, borderTop: '1px solid rgba(255,255,255,0.16)' }}>
              Disciplinas
            </div>
            <div style={{ display: 'grid', gap: 2 }}>
              {disciplineRows.length ? disciplineRows.map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: 'rgba(255,255,255,0.82)', fontSize: '0.68rem' }}>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                  <strong style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{value}</strong>
                </div>
              )) : <span style={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.68rem' }}>Sem disciplina cadastrada.</span>}
            </div>
          </div>
        )}
      </div>
      {selectedPlant && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.62rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Filtro ativo: {PROJECT_PLANT_SIGLAS[selectedPlant] || compactLabel(selectedPlant)}
          </span>
          <button onClick={(e) => { e.stopPropagation(); onSelectPlant(''); }} style={{ border: 'none', background: '#EFF6FF', color: '#0070B8', borderRadius: 999, padding: '4px 8px', fontSize: '0.62rem', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Limpar
          </button>
        </div>
      )}
    </div>
  );
}

function ProjectStatusStrip({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
      {items.map(item => (
        <div key={item.label} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, borderTop: `3px solid ${item.color}`, padding: '8px 10px', minWidth: 0 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 'clamp(0.58rem, 0.85vw, 0.68rem)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
          <div style={{ color: item.color, fontFamily: 'var(--font-display)', fontSize: 'clamp(1.2rem, 2.2vw, 1.7rem)', fontWeight: 900, lineHeight: 1.05, marginTop: 4 }}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

function NaturezaHorizontalChart({ items }) {
  const base = [
    { label: 'CAPEX', color: '#0050B3' },
    { label: 'OPEX', color: '#00AEEF' },
    { label: 'Guarda-chuva', color: '#97DDF7' },
  ].map(row => ({
    ...row,
    value: items.find(item => item.label === row.label)?.value || 0,
  }));
  const max = Math.max(1, ...base.map(item => Number(item.value) || 0));
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: '#FBFDFF', minHeight: 0 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Por natureza</div>
      <div style={{ display: 'grid', gap: 7 }}>
        {base.map(item => (
          <div key={item.label} style={{ display: 'grid', gridTemplateColumns: '82px 1fr 24px', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--ctg-navy)', fontSize: '0.68rem', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
            <div style={{ height: 8, borderRadius: 999, background: '#E2E8F0', overflow: 'hidden' }}>
              <div style={{ width: `${(item.value / max) * 100}%`, height: '100%', borderRadius: 999, background: item.color }} />
            </div>
            <strong style={{ color: 'var(--ctg-navy)', fontSize: '0.68rem', textAlign: 'right' }}>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function IacStatusProcessChart({ items }) {
  const countMap = new Map(items.map(item => [item.status, item.count]));
  const rows = IAC_STATUS_OPTIONS.map(option => ({
    ...option,
    label: statusLabel(option.value),
    count: countMap.get(option.value) || 0,
  }));
  const max = Math.max(1, ...rows.map(item => item.count));
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: '#FBFDFF', minHeight: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, flexShrink: 0 }}>Etapas do processo</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gridAutoRows: '1fr', gap: 4, flex: 1, minHeight: 0 }}>
        {rows.map(item => (
          <div key={item.value} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, .76fr) minmax(120px, 1fr) 28px', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', fontWeight: 850, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
            <div style={{ height: 7, borderRadius: 999, background: '#E2E8F0', overflow: 'hidden' }}>
              <div style={{ width: `${(item.count / max) * 100}%`, height: '100%', borderRadius: 999, background: item.color, opacity: item.count ? 1 : 0.22 }} />
            </div>
            <strong style={{ color: item.text, fontSize: '0.78rem', textAlign: 'right' }}>{item.count}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoStrip({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, gap: 8 }}>
      {items.map(item => (
        <div key={item.label} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', background: '#F8FAFC', display: 'grid', gridTemplateColumns: '24px 1fr', gap: 8, alignItems: 'center', minWidth: 0 }}>
          <span style={{ width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center', background: item.bg || '#EFF6FF', color: item.color || '#0070B8', fontWeight: 900 }}>{item.icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 'clamp(0.58rem, 0.85vw, 0.68rem)', fontWeight: 900 }}>{item.label}</div>
            <div style={{ color: 'var(--ctg-navy)', fontSize: 'clamp(0.72rem, 1.1vw, 0.9rem)', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CompactActionList({ title, items }) {
  return (
    <div>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.62rem', fontWeight: 900, marginBottom: 7 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.length ? items.slice(0, 3).map((item, idx) => (
          <div key={`${item.title}-${idx}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: 'var(--ctg-navy)', fontSize: '0.68rem', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.6rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.sub}</div>
            </div>
            {item.date && <span style={{ color: 'var(--text-muted)', fontSize: '0.58rem', whiteSpace: 'nowrap' }}>{item.date}</span>}
          </div>
        )) : <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Sem itens para exibir.</span>}
      </div>
    </div>
  );
}

function AttentionPanel({ total, items, navigate }) {
  const max = Math.max(1, ...items.map(item => Number(item.value) || 0));
  const iconByLabel = {
    Documentos: 'file',
    Projetos: 'folder',
    IACs: 'warning',
    Ferias: 'calendar',
    Delegacoes: 'users',
  };
  return (
    <HomeCard title="Atenção agora" icon="!" action={`${total} pendências`} style={{ minHeight: 0 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, padding: '6px 4px 4px' }}>
        {items.map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ width: 28, height: 28, borderRadius: 7, display: 'grid', placeItems: 'center', background: `${item.color}16`, color: item.color, flexShrink: 0 }}>
              <OperationalIcon name={iconByLabel[item.label] || 'target'} color={item.color} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: 'var(--ctg-navy)', fontSize: '0.72rem', fontWeight: 900, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.6rem', lineHeight: 1.2, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.sub}</div>
              <div style={{ marginTop: 5 }}>
                <MiniBar value={(item.value / max) * 100} color={item.color} />
              </div>
            </div>
            <strong style={{ color: item.color, fontSize: '0.82rem', fontWeight: 900, flexShrink: 0, minWidth: 20, textAlign: 'right' }}>{item.value}</strong>
          </div>
        ))}
      </div>
    </HomeCard>
  );
}

export default function HomePage({ year }) {
  const { user } = useAuth();
  const viewRole = user?._managerAccessOverride ? user?.role : (user?._originalRole || user?.role);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    metas: [],
    vacations: [],
    documents: [],
    alerts: null,
    delegations: [],
    docsStats: null,
    tracking: [],
    iacs: [],
    staleTracking: [],
    staleIacs: [],
  });
  const [selectedPlants, setSelectedPlants] = useState([]);

  const scope = useMemo(() => {
    if (user?.role === 'engenheiro') return { label: 'Meus dados', area: user?.area || 'eletrica' };
    if (user?.role === 'coordenador' && !user?._managerAccessOverride) return { label: areaLabel(user?.area || 'eletrica'), area: user?.area || 'eletrica' };
    return { label: 'Visao geral', area: '' };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const docsYear = year ? year % 100 : '';
      const metasQuery = `?year=${year}${scope.area ? `&area=${scope.area}` : ''}`;
      const vacationsQuery = `?year=${year}${scope.area ? `&area=${scope.area}` : ''}`;
      const [metas, vacations, documents, docsStats, tracking, iacs, staleTracking, staleIacs, alerts, delegations] = await Promise.all([
        api.get(`/metas${metasQuery}`).then(r => r.data).catch(() => []),
        api.get(`/vacations${vacationsQuery}`).then(r => r.data).catch(() => []),
        api.get(`/documents?year=${docsYear}`).then(r => r.data).catch(() => []),
        api.get(`/documents/stats?year=${docsYear}`).then(r => r.data).catch(() => null),
        api.get('/lists/projects-tracking').then(r => r.data).catch(() => []),
        api.get('/lists/iacs').then(r => r.data).catch(() => []),
        api.get('/lists/projects-tracking/stale-projects').then(r => r.data).catch(() => []),
        api.get('/lists/iacs/stale-iacs').then(r => r.data).catch(() => []),
        api.get('/forecast/alerts').then(r => r.data).catch(() => null),
        api.get('/delegations/notifications').then(r => r.data).catch(() => []),
      ]);
      if (cancelled) return;
      const viewRole = user?._managerAccessOverride ? user?.role : (user?._originalRole || user?.role);
      const ownMetas = viewRole === 'engenheiro' ? metas.filter(m => m.is_general || m.user_id === user.id) : metas;
      const ownVacations = viewRole === 'engenheiro' ? vacations.filter(v => v.user_id === user.id) : vacations;
      const areaMatch = row => areaKey(row.area) === areaKey(scope.area);
      const scopedTracking = viewRole === 'engenheiro'
        ? tracking.filter(r => Number(r.gestor_user_id) === Number(user.id))
        : scope.area ? tracking.filter(areaMatch) : tracking;
      const scopedIacs = viewRole === 'engenheiro'
        ? iacs.filter(r => Number(r.team_leader_user_id) === Number(user.id))
        : scope.area ? iacs.filter(areaMatch) : iacs;
      const scopedDocuments = viewRole === 'engenheiro'
        ? documents.filter(d => (d.responsible || '').trim().toLowerCase() === (user?.name || '').trim().toLowerCase())
        : scope.area ? documents.filter(areaMatch) : documents;
      const scopedStaleTracking = scope.area ? staleTracking.filter(areaMatch) : staleTracking;
      const scopedStaleIacs = scope.area ? staleIacs.filter(areaMatch) : staleIacs;
      setData({ metas: ownMetas, vacations: ownVacations, documents: scopedDocuments, alerts, delegations, docsStats, tracking: scopedTracking, iacs: scopedIacs, staleTracking: scopedStaleTracking, staleIacs: scopedStaleIacs });
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [year, scope.area, user?.id, user?.role, user?._originalRole, user?._managerAccessOverride]);

  const metasDone = data.metas.filter(m => Number(m.achieved_value || 0) >= 100).length;
  const metasAvg = weightedAchievement(data.metas);
  const metasMissingEvidence = data.metas.filter(m => evidenceCount(m) === 0).length;
  const vacationPeople = new Set(data.vacations.map(v => v.user_id)).size;
  const vacationDays = data.vacations.reduce((s, v) => s + (Number(v.days) || 0), 0);
  const rowMatchesSelectedPlant = (row, exactFields = ['uhe', 'plant', 'usina']) => {
    if (!selectedPlants.length) return true;
    return selectedPlants.some(plant => {
      const plantKey = normalizePlant(plant);
      const plantSigla = normalizePlant(PROJECT_PLANT_SIGLAS[plant] || '');
      const explicitValues = exactFields.map(field => normalizePlant(row?.[field] || '')).filter(Boolean);
      if (!explicitValues.length) return true;
      return explicitValues.some(key => key === plantKey || key === plantSigla);
    });
  };
  const projectRows = data.tracking.filter(row => rowMatchesSelectedPlant(row, ['uhe', 'plant', 'usina']));
  const staleTrackingRows = data.staleTracking.filter(row => rowMatchesSelectedPlant(row, ['uhe', 'plant', 'usina']));
  const documentRows = data.documents.filter(row => rowMatchesSelectedPlant(row, ['plant', 'uhe', 'usina']));
  const iacRows = data.iacs.filter(row => rowMatchesSelectedPlant(row, ['uhe', 'plant', 'usina']));
  const staleIacRows = data.staleIacs.filter(row => rowMatchesSelectedPlant(row, ['uhe', 'plant', 'usina']));
  const useDocsStatsFallback = !selectedPlants.length && !documentRows.length;
  const docsTotal = documentRows.length || (useDocsStatsFallback ? (data.docsStats?.by_status || []).reduce((s, r) => s + Number(r.count || 0), 0) : 0);
  const docsPublishedNoLink = documentRows.length
    ? documentRows.filter(d => d.status === 'Publicado' && !d.document_link).length
    : (useDocsStatsFallback ? Number(data.docsStats?.published_without_link || 0) : 0);
  const activeTracking = projectRows.filter(p => !/encerrado/i.test(p.status || '')).length;
  const activeIacs = iacRows.filter(i => !/cancel|hired|signed/i.test(i.status_current || '')).length;
  const alertVacationCount = Number(data.alerts?.vacation_adp?.count || 0);
  const alertDelegationCount = data.delegations.length;
  const docsPublished = documentRows.length
    ? documentRows.filter(d => d.status === 'Publicado').length
    : (useDocsStatsFallback ? Number((data.docsStats?.by_status || []).find(r => r.status === 'Publicado')?.count || 0) : 0);
  const docsPublishedPct = docsTotal ? Math.round((docsPublished / docsTotal) * 100) : 0;
  const docsGauge = docsTotal ? (docsPublished / docsTotal) * 100 : 0;
  const vacationsGauge = vacationPeople ? Math.min(100, (data.vacations.length / Math.max(vacationPeople, 1)) * 100) : 0;
  const projectStaleCount = staleTrackingRows.length;
  const iacStaleCount = staleIacRows.length;
  const projectUpdatedCount = Math.max(0, projectRows.length - projectStaleCount);
  const iacUpdatedCount = Math.max(0, iacRows.length - iacStaleCount);
  const projectUpdatedPct = projectRows.length ? Math.round((projectUpdatedCount / projectRows.length) * 100) : 0;
  const iacUpdatedPct = iacRows.length ? Math.round((iacUpdatedCount / iacRows.length) * 100) : 0;
  const iacPriorityData = countBy(iacRows, 'priority').map(item => ({
    ...item,
    color: item.label === 'Priority' ? '#0070B8' : item.label === 'Hired' ? '#00AEEF' : '#64748B',
  }));
  const iacProcessData = IAC_STATUS_OPTIONS.map(option => ({
    status: option.value,
    count: iacRows.filter(i => i.status_current === option.value).length,
  }));
  const iacStatusData = countBy(iacRows, 'status_current').map(item => ({
    ...item,
    label: item.label.split(' - ').slice(1).join(' - ') || item.label,
    color: item.label.startsWith('0') ? '#94A3B8' : item.label.startsWith('1') ? '#3B82F6' : item.label.startsWith('2') ? '#8B5CF6' : item.label.startsWith('3') ? '#F59E0B' : item.label.startsWith('4') ? '#F97316' : item.label.startsWith('5') ? '#0EA5E9' : item.label.startsWith('6') ? '#10B981' : item.label.startsWith('8') || item.label.startsWith('9') ? '#16A34A' : '#64748B',
    bg: item.label.startsWith('0') ? '#F1F5F9' : item.label.startsWith('3') || item.label.startsWith('4') ? '#FFF7ED' : item.label.startsWith('6') || item.label.startsWith('8') || item.label.startsWith('9') ? '#ECFDF5' : '#EFF6FF',
  }));
  const iac2026 = iacRows.filter(i => (i.iac_code || i.name || '').startsWith('IAC2026'));
  const iacMonths = iac2026.map(i => monthDiffFrom(i.opening_date)).filter(v => v !== null);
  const iacAvgMonths = iacMonths.length ? Math.round(iacMonths.reduce((sum, v) => sum + v, 0) / iacMonths.length) : null;
  const iacMetaColor = iacAvgMonths === null ? '#10B981' : iacAvgMonths < 5 ? '#10B981' : iacAvgMonths < 6 ? '#0070B8' : iacAvgMonths < 7 ? '#F59E0B' : '#EF4444';
  const projectNatureData = countBy(projectRows, 'natureza').map(item => ({
    ...item,
    color: item.label === 'CAPEX' ? '#0070B8' : item.label === 'OPEX' ? '#10B981' : '#F59E0B',
  }));
  const projectPlantData = sumBy(projectRows, 'uhe', 'valor_contrato').filter(item => item.label !== 'Geral');
  const projectAllPlantData = plantValueData(projectRows);
  const projectTotalContrato = projectRows.reduce((sum, p) => sum + parseMoney(p.valor_contrato), 0);
  const projectTotalSi = projectRows.reduce((sum, p) => sum + parseMoney(p.valor_si), 0);
  const projectRealizadoContrato = projectRows.reduce((sum, p) => sum + parseMoney(p.realizado_contrato), 0);
  const projectRealizadoSi = projectRows.reduce((sum, p) => sum + parseMoney(p.realizado_si), 0);
  const unpublishedDocs = documentRows.filter(d => d.status !== 'Publicado' || !d.document_link);
  const alertDocCount = unpublishedDocs.length || (!selectedPlants.length ? Number(data.alerts?.doc_unpublished?.count || 0) : 0);
  const metasAttention = data.metas
    .filter(m => evidenceCount(m) === 0 || Number(m.achieved_value || 0) < 100)
    .sort((a, b) => Number(a.achieved_value || 0) - Number(b.achieved_value || 0));
  const upcomingVacations = [...data.vacations]
    .filter(v => v.start_date || v.start)
    .sort((a, b) => String(a.start_date || a.start).localeCompare(String(b.start_date || b.start)));
  const projectRealizedPct = projectTotalContrato ? (projectRealizadoContrato / projectTotalContrato) * 100 : 0;
  const projectStatusItems = [
    { label: 'Total', value: projectRows.length, color: '#0b5cab' },
    { label: 'Em Andamento', value: projectRows.filter(i => i.status === 'Em andamento').length, color: '#0EA5E9' },
    { label: 'Encerramento', value: projectRows.filter(i => i.status === 'Em fase de encerramento').length, color: '#F59E0B' },
    { label: 'Encerrados', value: projectRows.filter(i => i.status === 'Encerrado').length, color: '#94A3B8' },
  ];
  const mainNature = projectNatureData.sort((a, b) => b.value - a.value)[0]?.label || 'Sem natureza';
  const mainPlant = [...projectPlantData].sort((a, b) => b.value - a.value)[0]?.label || compactLabel(projectRows[0]?.uhe, 'Sem usina');
  const mainPriority = [...iacPriorityData].sort((a, b) => b.value - a.value)[0]?.label || 'Sem prioridade';
  const mainIacStatus = [...iacStatusData].sort((a, b) => b.value - a.value)[0]?.label || 'Sem status';
  const milestoneItems = [
    ...unpublishedDocs.slice(0, 3).map(d => ({
      title: d.subject || d.code || 'Documento pendente',
      sub: `${d.code || 'Documento'} - ${d.status || 'em revisao'}`,
      color: '#6366F1',
    })),
    ...metasAttention.slice(0, 3).map(m => ({
      title: m.goal_name || m.name || `Meta ${m.meta_number || ''}`,
      sub: `${pct(m.achieved_value || 0)} realizado${evidenceCount(m) === 0 ? ' - sem evidencia' : ''}`,
      color: '#10B981',
    })),
    ...upcomingVacations.slice(0, 3).map(v => ({
      title: v.user_name || v.name || 'Ferias planejadas',
      sub: `${v.start_date || v.start || '-'} - ${v.days || 0} dias`,
      color: '#F59E0B',
    })),
  ];
  const attentionItems = [
    { label: 'Documentos', sub: 'revisao e publicacao', value: alertDocCount, color: '#6366F1' },
    { label: 'Projetos', sub: 'atualizacoes pendentes', value: projectStaleCount, color: '#0070B8' },
    { label: 'IACs', sub: 'acoes e revisoes', value: iacStaleCount, color: '#F59E0B' },
  ];
  const pendingTotal = attentionItems.reduce((sum, item) => sum + item.value, 0);
  const projectActionItems = [
    ...unpublishedDocs.slice(0, 2).map(d => ({ title: d.subject || d.code || 'Documento pendente', sub: d.status || 'Em elaboracao', date: d.code || '' })),
    ...staleTrackingRows.slice(0, 2).map(p => ({ title: p.projeto || p.pp_contrato || 'Projeto sem revisao', sub: p.status || 'Atualizacao pendente', date: p.vencimento_txt || '' })),
  ];
  const iacActionItems = iacRows.slice(0, 3).map(i => ({
    title: i.project || i.iac_code || 'IAC em andamento',
    sub: i.status_current?.split(' - ').slice(1).join(' - ') || i.status_current || 'Sem status',
    date: i.validity || '',
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: 'calc(100vh - 32px)', maxHeight: 'calc(100vh - 32px)', overflow: 'hidden', paddingBottom: 0 }}>
      <style>{`
        @keyframes homeHeroGlow {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: .58; }
          50% { transform: translate3d(-18px, 4px, 0) scale(1.04); opacity: .78; }
        }
        @keyframes homeHeroGradientFloat {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes metricBubbleFloat {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: .42; }
          50% { transform: translate3d(-10px, 7px, 0) scale(1.08); opacity: .62; }
        }
      `}</style>
      <section style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(112deg, var(--ctg-navy) 0%, #063575 44%, #0B6FAE 73%, #8ED8F8 100%)', backgroundSize: '210% 210%', animation: 'homeHeroGradientFloat 12s ease-in-out infinite', color: '#fff', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', flexShrink: 0 }}>
        <div style={{ position: 'absolute', right: 78, top: -42, width: 300, height: 150, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.36) 0%, rgba(125,211,252,0.22) 46%, rgba(255,255,255,0) 72%)', filter: 'blur(3px)', animation: 'homeHeroGlow 7s ease-in-out infinite', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: -80, bottom: -70, width: 360, height: 150, borderRadius: '50%', background: 'radial-gradient(circle, rgba(14,165,233,0.24) 0%, rgba(255,255,255,0.16) 48%, rgba(255,255,255,0) 74%)', animation: 'homeHeroGlow 9s ease-in-out infinite reverse', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.72, fontWeight: 800 }}>Pagina inicial</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 800, marginTop: 3 }}>Bem-vindo, {user?.name?.split(' ')[0] || 'usuario'}</div>
        </div>
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 12, marginLeft: 'auto' }}>
          <div style={{ background: 'rgba(255,255,255,0.38)', border: '1px solid rgba(255,255,255,0.56)', borderRadius: 8, padding: 6, boxShadow: '0 10px 24px rgba(0,31,91,0.16)' }}>
            <AlertBell />
          </div>
          {loading && <div className="spinner" />}
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>

        {/* Row 1: left col = Resumo + Filter stacked; right col = Atenção agora spanning both */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 290px', gridTemplateRows: 'auto auto', gap: 10, flexShrink: 0 }}>
          <HomeCard title="Resumo operacional" style={{ gridColumn: '1', gridRow: '1' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
              <OperationalTile label="IACs" value={iacRows.length} sub={`${iacUpdatedPct}% atualizado`} color="#F59E0B" icon="warning" trend gaugeValue={iacUpdatedPct} onClick={() => navigate('/lists/iacs')} />
              <OperationalTile label="Projetos" value={projectRows.length} sub={`${projectUpdatedPct}% atualizado`} color="#0070B8" icon="folder" trend gaugeValue={projectUpdatedPct} onClick={() => navigate('/lists/projects-tracking')} />
              <OperationalTile label="Documentos" value={docsTotal} sub={`${docsPublished} publicados`} color="#6366F1" icon="file" trend gaugeValue={docsPublishedPct} onClick={() => navigate('/documents')} />
              <OperationalTile label="Metas" value={pct(metasAvg)} sub={`${metasDone} de ${data.metas.length} atingidas`} color="#10B981" icon="target" trend gaugeValue={metasAvg || 0} onClick={() => navigate('/metas')} />
            </div>
          </HomeCard>

          <div
            className="card"
            style={{
              gridColumn: '1',
              gridRow: '2',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: '#fff',
              padding: '9px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--ctg-navy)', fontSize: '0.9rem', fontWeight: 900, whiteSpace: 'nowrap', flexShrink: 0 }}>
              <svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true" style={{ color: '#0070B8', flexShrink: 0 }}>
                <path d="M3 4h14l-5.4 6.2V15l-3.2 1.4v-6.2L3 4Z" fill="currentColor" />
              </svg>
              Filtro
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 2, flex: 1, minWidth: 0 }}>
              {PLANT_FILTER_POLES.map(group => (
                <div
                  key={group.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: '#FBFDFF',
                    padding: '6px 8px',
                    flex: '0 0 auto',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: group.color, boxShadow: `0 0 0 4px ${group.bg}` }} />
                    <span style={{ color: 'var(--ctg-navy)', fontSize: '0.68rem', fontWeight: 900, whiteSpace: 'nowrap' }}>{group.label}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'nowrap', justifyContent: 'flex-start' }}>
                    {group.plants.map(plant => {
                      const active = selectedPlants.includes(plant);
                      return (
                        <button
                          key={plant}
                          type="button"
                          title={plant}
                          onClick={() => setSelectedPlants(prev => active ? prev.filter(p => p !== plant) : [...prev, plant])}
                          style={{
                            minWidth: 38,
                            padding: '4px 8px',
                            borderRadius: 999,
                            border: `1.5px solid ${active ? group.color : '#E2E8F0'}`,
                            background: active ? group.bg : '#fff',
                            color: active ? group.color : '#64748B',
                            fontSize: '0.64rem',
                            fontWeight: active ? 900 : 700,
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            boxShadow: active ? `0 1px 5px ${group.color}24` : 'none',
                          }}
                        >
                          {PROJECT_PLANT_SIGLAS[plant] || compactLabel(plant)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minWidth: 92 }}>
              {selectedPlants.length > 0 ? (
                <button type="button" onClick={() => setSelectedPlants([])} style={{ border: '1px solid #FECACA', background: '#FEE2E2', color: '#991B1B', borderRadius: 6, padding: '4px 9px', fontSize: '0.64rem', fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  Limpar ({selectedPlants.length})
                </button>
              ) : (
                <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)', fontStyle: 'italic', whiteSpace: 'nowrap' }}>Todas selecionadas</span>
              )}
            </div>
          </div>

          <div style={{ gridColumn: '2', gridRow: '1 / 3', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <AttentionPanel total={pendingTotal} items={attentionItems} navigate={navigate} />
          </div>
        </div>

        {/* Row 2: main cards side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, flex: 1, minHeight: 0 }}>
          <HomeCard title="Projetos em acompanhamento" icon="folder" action="›" onClick={() => navigate('/lists/projects-tracking')}>
            <div style={{ display: 'grid', gridTemplateRows: 'auto auto minmax(0, 1fr) auto', gap: 8, height: '100%', minHeight: 0 }}>
              <ProjectStatusStrip items={projectStatusItems} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                <ValueConsumptionBox label="Valor total do contrato" value={projectTotalContrato} realized={projectRealizadoContrato} color="#10B981" />
                <ValueConsumptionBox label="Valor total de SI" value={projectTotalSi} realized={projectRealizadoSi} color="#6366F1" />
              </div>
              <PlantColumnChart items={projectAllPlantData} />
              <NaturezaHorizontalChart items={projectNatureData} />
            </div>
          </HomeCard>

          <HomeCard title="IACs em andamento" icon="warning" action="›" onClick={() => navigate('/lists/iacs')}>
            <div style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: 10, height: '100%', minHeight: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, .85fr) minmax(0, 1fr)', gap: 10, minHeight: 0 }}>
                <StatBox label="Média META" value={iacAvgMonths === null ? '-' : `${iacAvgMonths}m`} color={iacMetaColor} sub={`${iac2026.length} IAC(s) de 2026`}>
                  <div style={{ position: 'relative', paddingBottom: 14 }}>
                    <div style={{ height: 7, background: '#E2E8F0', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ width: `${iacAvgMonths === null ? 0 : Math.min(100, (iacAvgMonths / 8) * 100)}%`, height: '100%', background: iacMetaColor, borderRadius: 999 }} />
                    </div>
                    {[{ m: 5, color: '#10B981' }, { m: 6, color: '#0070B8' }, { m: 7, color: '#F59E0B' }].map(({ m, color }) => (
                      <div key={m} style={{ position: 'absolute', left: `${(m / 8) * 100}%`, top: 0, transform: 'translateX(-50%)', pointerEvents: 'none' }}>
                        <div style={{ width: 2, height: 7, background: color, borderRadius: 1 }} />
                        <div style={{ marginTop: 2, fontSize: '0.8rem', color, fontWeight: 900, textAlign: 'center', whiteSpace: 'nowrap' }}>{m}m</div>
                      </div>
                    ))}
                  </div>
                </StatBox>
                <ChartBox title="Por prioridade">
                  <DistributionDonut items={iacPriorityData} total={iacRows.length} centerLabel={iacRows.length} />
                </ChartBox>
              </div>
              <IacStatusProcessChart items={iacProcessData} />
            </div>
          </HomeCard>
        </div>

      </section>
    </div>
  );
}
