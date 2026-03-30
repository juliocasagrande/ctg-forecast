import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../utils/api.js';
import { useTypeColors } from '../context/SettingsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from './ui/Toast.jsx';
import { MONTHS_FULL_PT, MONTHS_PT, formatBRL } from '../utils/format.js';

// ── SAP Excel Import Modal ────────────────────────────────────────────────────
// Classificação por palavras-chave contidas na Descr.classe custo
// keywords: { Dispensado: [...], Viagens: [...] } — vem da API /settings/sap-keywords
const DEFAULT_SAP_KEYWORDS = {
  Dispensado: ['salario', 'hora extra', 'inss', 'fgts'],
  Viagens:    ['viage', 'taxi', 'pedagio', 'estacionamento'],
};

function normStr(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function classifyDescr(descr, mapping, keywords) {
  const d = normStr(descr);
  const kws = keywords || DEFAULT_SAP_KEYWORDS;

  // 1. Dispensados (prioridade máxima)
  const dispensadoKws = kws.Dispensado || DEFAULT_SAP_KEYWORDS.Dispensado;
  if (dispensadoKws.some(kw => d.includes(normStr(kw)))) return 'Dispensado';

  // 2. Viagens
  const viagemKws = kws.Viagens || DEFAULT_SAP_KEYWORDS.Viagens;
  if (viagemKws.some(kw => d.includes(normStr(kw)))) return 'Viagens';

  // 3. Mapeamento avançado (sobrescreve apenas se não encaixou nas regras acima)
  if (mapping && mapping.length > 0) {
    const hit = mapping.find(m => d.includes(normStr(m.descr)));
    if (hit) {
      if (hit.category === 'Desconsiderar') return 'Dispensado';
      if (hit.category === 'Viagens') return 'Viagens';
      if (hit.category === 'Contratos') return 'Contratos';
    }
  }

  // 4. Fallback → Contratos
  return 'Contratos';
}

// Calcula a moda de um array de strings
function calcModa(arr) {
  if (!arr || !arr.length) return '';
  const freq = {};
  arr.forEach(v => { if (v) freq[v] = (freq[v] || 0) + 1; });
  let best = ''; let bestN = 0;
  Object.entries(freq).forEach(([k, n]) => { if (n > bestN) { best = k; bestN = n; } });
  return best;
}

function ImportActualModal({ open, onClose, onApply, currentYear, theme, isConsolidated, existingData }) {
  const [file,           setFile]           = useState(null);
  const [parsing,        setParsing]        = useState(false);
  const [parseError,     setParseError]     = useState(null);
  const [preview,        setPreview]        = useState(null);
  const [mapping,        setMapping]        = useState(null);
  const [keywords,       setKeywords]       = useState(null);
  const [dragging,       setDragging]       = useState(false);
  const [applying,       setApplying]       = useState(false);
  // Per-item selection: key = `${year}|${month}|${cat}|${itemIdx}`, value = bool
  const [itemSel,        setItemSel]        = useState({});
  // Expanded months per category: key = `${year}|${month}|${cat}`
  const [expanded,       setExpanded]       = useState({});
  // Confirm overwrite dialog
  const [confirmData,    setConfirmData]    = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    api.get('/settings/sap-mapping')
      .then(r => setMapping(r.data || []))
      .catch(() => setMapping([]));
    api.get('/settings/sap-keywords')
      .then(r => setKeywords(r.data || null))
      .catch(() => setKeywords(null));
  }, [open]);

  useEffect(() => {
    if (!open) {
      setFile(null); setParsing(false); setParseError(null); setPreview(null);
      setItemSel({}); setExpanded({}); setConfirmData(null);
    }
  }, [open]);

  async function loadSheetJS() {
    if (window.XLSX) return window.XLSX;
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = () => resolve(window.XLSX);
      s.onerror = () => reject(new Error('Falha ao carregar SheetJS'));
      document.head.appendChild(s);
    });
  }

  function norm(s) {
    return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  async function processFile(f) {
    if (!f.name.match(/\.xlsx?$/i)) { setParseError('Apenas arquivos .xlsx são aceitos.'); return; }
    setFile(f); setParsing(true); setParseError(null); setPreview(null);
    try {
      const buf = await f.arrayBuffer();
      const XLSX = await loadSheetJS();
      const wb = XLSX.read(buf, { type: 'array', cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });

      if (!rows.length) { setParseError('Planilha vazia.'); setParsing(false); return; }

      const headerMap = {};
      Object.keys(rows[0]).forEach(k => { headerMap[norm(k)] = k; });

      const colExercicio = headerMap['exercicio'] || headerMap['exerccio'];
      const colPeriodo   = headerMap['periodo'];
      const colDescr     = headerMap['descr.classe custo'] || headerMap['descrclasse custo'] || headerMap['descr classe custo'];
      const colValor     = headerMap['valor/moeda acc'] || headerMap['valormoeda acc'] || headerMap['valor moeda acc'];
      const colDenom     = headerMap['denominacao'] || headerMap['denominação'] || headerMap['denom.'] || null;

      if (!colExercicio || !colPeriodo || !colDescr || !colValor) {
        setParseError(`Colunas não encontradas.\nEsperado: "Exercício", "Período", "Descr.classe custo", "Valor/moeda ACC".\nEncontradas: ${Object.keys(headerMap).join(', ')}`);
        setParsing(false); return;
      }

      // months: { "yr|mo": { year, month, Contratos: [], Viagens: [], Dispensado: [] } }
      // Each item: { valor, descr, denom, selected: true }
      const months = {};

      rows.forEach(row => {
        const descr = String(row[colDescr] || '').trim();
        if (!descr) return;

        const rawValor = row[colValor];
        const valor = (typeof rawValor === 'number')
          ? rawValor
          : parseFloat(String(rawValor || '0').replace(/[^\d,.-]/g, '').replace(',', '.')) || 0;
        if (!valor) return;

        const yr = String(row[colExercicio] || '').trim();
        const mo = parseInt(String(row[colPeriodo] || '0').trim());
        if (!yr || yr.length < 4 || !mo || mo < 1 || mo > 12) return;

        const denom = colDenom ? String(row[colDenom] || '').trim() : '';
        const cat   = classifyDescr(descr, mapping, keywords);

        const key = `${yr}|${mo}`;
        if (!months[key]) months[key] = { year: yr, month: mo, Contratos: [], Viagens: [], Dispensado: [] };
        months[key][cat].push({ valor, descr, denom });
      });

      if (!Object.keys(months).length) {
        setParseError('Nenhum dado encontrado no arquivo. Verifique as colunas.');
        setParsing(false); return;
      }

      // Initial item selection: select Contratos + Viagens, deselect Dispensado
      const initSel = {};
      Object.entries(months).forEach(([key, m]) => {
        ['Contratos', 'Viagens'].forEach(cat => {
          m[cat].forEach((_, i) => { initSel[`${key}|${cat}|${i}`] = true; });
        });
        m.Dispensado.forEach((_, i) => { initSel[`${key}|Dispensado|${i}`] = false; });
      });
      setItemSel(initSel);

      const targetYear = String(currentYear);
      setPreview({ months });
      setExpanded({});
    } catch (err) {
      setParseError(`Erro ao processar arquivo: ${err.message}`);
    }
    setParsing(false);
  }

  // Toggle de seleção de TODOS os itens de um mês (todas as categorias)
  function toggleWholeMonth(monthKey, m) {
    const allItems = ['Contratos', 'Viagens', 'Dispensado'].flatMap((cat) =>
      m[cat].map((_, i) => `${monthKey}|${cat}|${i}`)
    );
    const allOn = allItems.every(k => itemSel[k]);
    setItemSel(prev => {
      const next = { ...prev };
      allItems.forEach(k => { next[k] = !allOn; });
      return next;
    });
  }

  function toggleItem(key) {
    setItemSel(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleCatMonth(monthKey, cat, items) {
    const allOn = items.every((_, i) => itemSel[`${monthKey}|${cat}|${i}`]);
    setItemSel(prev => {
      const next = { ...prev };
      items.forEach((_, i) => { next[`${monthKey}|${cat}|${i}`] = !allOn; });
      return next;
    });
  }

  function toggleExpand(key) {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }

  // Compute totals per month/cat from selected items
  function computeMonthCatTotal(monthKey, cat, items) {
    return items.reduce((s, _, i) => s + (itemSel[`${monthKey}|${cat}|${i}`] ? items[i].valor : 0), 0);
  }
  // Soma bruta sem considerar seleção — usado para Dispensados (sempre desmarcados)
  function computeRawTotal(items) {
    return items.reduce((s, it) => s + it.valor, 0);
  }

  // Build final result for apply
  // Retorna estrutura: { Contratos: { "year|month": { value, comment, year, month } }, Viagens: {...} }
  // Preserva year do dado importado para salvar no período correto
  function buildResult() {
    if (!preview) return null;
    const result = { Contratos: {}, Viagens: {} };
    Object.entries(preview.months).forEach(([key, m]) => {
      ['Contratos', 'Viagens'].forEach(cat => {
        const selectedItems = m[cat].filter((_, i) => itemSel[`${key}|${cat}|${i}`]);
        if (!selectedItems.length) return;
        const total = selectedItems.reduce((s, it) => s + it.valor, 0);
        const entryKey = `${m.year}|${m.month}`;
        if (!result[cat][entryKey]) result[cat][entryKey] = { value: 0, comment: '', year: m.year, month: m.month, _descrs: [] };
        result[cat][entryKey].value += total;
        result[cat][entryKey]._descrs.push(...selectedItems.map(it => it.descr));
      });
    });
    // Finaliza comentários pela moda das descrições
    ['Contratos', 'Viagens'].forEach(cat => {
      Object.keys(result[cat]).forEach(k => {
        result[cat][k].comment = calcModa(result[cat][k]._descrs || []);
        delete result[cat][k]._descrs;
      });
    });
    return result;
  }

  async function handleApplyClick() {
    if (!preview) return;
    const result = buildResult();
    if (!result) return;

    // Verifica conflitos usando a chave "year|month" do resultado
    const conflicts = [];
    if (existingData) {
      ['Contratos', 'Viagens'].forEach(cat => {
        Object.entries(result[cat]).forEach(([entryKey, entry]) => {
          const existing = existingData[`Actual|${cat}|${entry.month}`];
          if (existing && existing.value > 0) {
            conflicts.push({ cat, mo: entry.month, year: entry.year });
          }
        });
      });
    }

    if (conflicts.length > 0) {
      setConfirmData({ result, conflicts });
    } else {
      setApplying(true);
      try {
        await onApply(result);
        onClose();
      } finally {
        setApplying(false);
      }
    }
  }

  async function confirmOverwrite() {
    if (!confirmData) return;
    setApplying(true);
    try {
      await onApply(confirmData.result);
      onClose();
    } finally {
      setApplying(false);
      setConfirmData(null);
    }
  }

  if (!open) return null;

  // Usa MONTHS_FULL_PT importado do utils/format.js — sem hardcode interno
  const MONTHS_FULL = MONTHS_FULL_PT;

  // Summary totals for footer
  let totalContr = 0; let totalViag = 0;
  if (preview) {
    Object.entries(preview.months).forEach(([key, m]) => {
      totalContr += computeMonthCatTotal(key, 'Contratos', m.Contratos);
      totalViag  += computeMonthCatTotal(key, 'Viagens',   m.Viagens);
    });
  }

  const CAT_STYLE = {
    Contratos:  { color:'#1d4ed8', bg:'#eff6ff', border:'#bfdbfe', label:'Contratos',  emoji:'📄' },
    Viagens:    { color:'#059669', bg:'#f0fdf4', border:'#bbf7d0', label:'Viagens',    emoji:'✈️' },
    Dispensado: { color:'#b45309', bg:'#fffbeb', border:'#fde68a', label:'Dispensados',emoji:'🚫' },
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:3000, background:'rgba(15,23,42,0.65)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }} onClick={onClose}>
      <div style={{ background:'var(--bg-card)', borderRadius:16, width:'100%', maxWidth:900, maxHeight:'92vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 64px rgba(0,0,0,0.35)', overflow:'hidden' }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ background:'var(--ctg-navy)', padding:'14px 22px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ color:'#fff', fontWeight:700, fontSize:'0.95rem' }}>📥 Importar Realizado — SAP</div>
            <div style={{ color:'rgba(255,255,255,0.55)', fontSize:'0.72rem', marginTop:2 }}>
              {isConsolidated
                ? 'Valores dos meses selecionados serão somados e aplicados como Realizado consolidado'
                : 'Valores classificados por palavra-chave em Descr.classe custo'}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.12)', border:'none', borderRadius:8, color:'#fff', cursor:'pointer', padding:'5px 14px', fontSize:'0.82rem', fontWeight:700 }}>✕ Fechar</button>
        </div>

        <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:'20px 24px' }}>
          {/* Upload area */}
          {!preview && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) processFile(f); }}
              onClick={() => inputRef.current?.click()}
              style={{ border:`2px dashed ${dragging ? theme.color : file ? '#10b981' : '#cbd5e1'}`, borderRadius:12, padding:'36px 24px', textAlign:'center', cursor:'pointer', background: dragging ? theme.light : file ? '#f0fdf4' : '#f8fafc', transition:'all 0.2s', marginBottom:16 }}
            >
              <input ref={inputRef} type="file" accept=".xlsx,.xls" style={{ display:'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); }} />
              {parsing ? (
                <div><div style={{ fontSize:'1.6rem', marginBottom:8 }}>⏳</div><div style={{ fontWeight:600, color:'#374151' }}>Processando planilha…</div></div>
              ) : file ? (
                <div><div style={{ fontSize:'1.6rem', marginBottom:8 }}>📊</div><div style={{ fontWeight:600, color:'#065f46' }}>{file.name}</div><div style={{ fontSize:'0.78rem', color:'#64748b', marginTop:4 }}>Clique para trocar</div></div>
              ) : (
                <div><div style={{ fontSize:'1.6rem', marginBottom:8 }}>📂</div><div style={{ fontWeight:600, color:'#374151', fontSize:'0.95rem' }}>Arraste o arquivo Excel aqui</div><div style={{ fontSize:'0.78rem', color:'#94a3b8', marginTop:4 }}>Exportação SAP — colunas: Exercício, Período, Descr.classe custo, Valor/moeda ACC</div></div>
              )}
            </div>
          )}

          {parseError && (
            <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:'0.82rem', color:'#b91c1c', whiteSpace:'pre-wrap' }}>⚠️ {parseError}</div>
          )}

          {preview && (
            <div>
              <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, padding:'10px 16px', marginBottom:16, fontSize:'0.82rem', color:'#065f46', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                <span>✅ Arquivo processado — expanda os meses para ver e selecionar itens</span>
                {isConsolidated && <span style={{ color:'#1d4ed8', background:'#eff6ff', padding:'2px 8px', borderRadius:6, fontSize:'0.75rem', fontWeight:600 }}>Modo consolidado</span>}
                <button onClick={() => { setPreview(null); setFile(null); }} style={{ marginLeft:'auto', background:'transparent', border:'1px solid #10b981', borderRadius:6, color:'#065f46', cursor:'pointer', padding:'3px 10px', fontSize:'0.75rem', fontWeight:600 }}>Trocar arquivo</button>
              </div>

              {/* Months table */}
              <div style={{ border:'1.5px solid #e2e8f0', borderRadius:12, overflow:'hidden', marginBottom:16 }}>
                {/* Table header */}
                <div style={{ display:'grid', gridTemplateColumns:'140px 1fr 1fr 1fr 36px', background:'#f1f5f9', borderBottom:'2px solid #e2e8f0', padding:'7px 14px', gap:0 }}>
                  <span style={{ fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:'#64748b' }}>Mês</span>
                  <span style={{ fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:CAT_STYLE.Contratos.color, textAlign:'right', paddingRight:16 }}>📄 Contratos</span>
                  <span style={{ fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:CAT_STYLE.Viagens.color, textAlign:'right', paddingRight:16 }}>✈️ Viagens</span>
                  <span style={{ fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.06em', color:CAT_STYLE.Dispensado.color, textAlign:'right', paddingRight:16 }}>🚫 Dispensados</span>
                  <span></span>
                </div>

                {/* Table rows */}
                {Object.values(preview.months)
                  .sort((a, b) => a.year !== b.year ? String(a.year).localeCompare(String(b.year)) : a.month - b.month)
                  .map((m, rowIdx) => {
                    const monthKey = `${m.year}|${m.month}`;
                    const isCurrentYear = String(m.year) === String(currentYear);
                    const contrTotal = computeMonthCatTotal(monthKey, 'Contratos', m.Contratos);
                    const viagTotal  = computeMonthCatTotal(monthKey, 'Viagens',   m.Viagens);
                    const dispTotal  = computeRawTotal(m.Dispensado);
                    const isExp = expanded[monthKey];

                    return (
                      <div key={monthKey} style={{ borderBottom: '1px solid #e2e8f0' }}>
                        {/* Row */}
                        <div
                          onClick={() => toggleExpand(monthKey)}
                          style={{ display:'grid', gridTemplateColumns:'140px 1fr 1fr 1fr 36px', alignItems:'center', gap:0, padding:'9px 14px', background: isExp ? '#f8fafc' : rowIdx%2===0 ? '#fff' : '#fafafa', cursor:'pointer', transition:'background 0.1s' }}
                          onMouseEnter={e => { if (!isExp) e.currentTarget.style.background='#f0f7ff'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = isExp ? '#f8fafc' : rowIdx%2===0 ? '#fff' : '#fafafa'; }}
                        >
                        {/* Month label com checkbox de mês inteiro */}
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <input
                              type="checkbox"
                              title="Selecionar/deselecionar mês inteiro"
                              checked={['Contratos','Viagens','Dispensado'].flatMap(cat => m[cat].map((_,i) => itemSel[`${monthKey}|${cat}|${i}`])).every(Boolean)}
                              ref={el => {
                                if (el) {
                                  const all = ['Contratos','Viagens','Dispensado'].flatMap(cat => m[cat].map((_,i) => itemSel[`${monthKey}|${cat}|${i}`]));
                                  el.indeterminate = all.some(Boolean) && !all.every(Boolean);
                                }
                              }}
                              onChange={(e) => { e.stopPropagation(); toggleWholeMonth(monthKey, m); }}
                              onClick={e => e.stopPropagation()}
                              style={{ width:13, height:13, cursor:'pointer', flexShrink:0, accentColor:'#1d4ed8' }}
                            />
                            <span style={{ fontWeight:700, fontSize:'0.88rem', color:'var(--text-primary)' }}>{MONTHS_FULL[m.month-1]}</span>
                            {!isCurrentYear && <span style={{ fontSize:'0.6rem', background:'#fef3c7', color:'#92400e', padding:'1px 5px', borderRadius:4, fontWeight:700 }}>{m.year}</span>}
                          </div>
                          {/* Contratos */}
                          <div style={{ textAlign:'right', paddingRight:16 }}>
                            {contrTotal !== 0
                              ? <><span style={{ fontVariantNumeric:'tabular-nums', fontSize:'0.85rem', fontWeight:600, color:CAT_STYLE.Contratos.color }}>{formatBRL(contrTotal)}</span>
                                  {m.Contratos.length>0 && <span style={{ fontSize:'0.6rem', background:CAT_STYLE.Contratos.bg, color:CAT_STYLE.Contratos.color, border:`1px solid ${CAT_STYLE.Contratos.border}`, borderRadius:8, padding:'1px 5px', marginLeft:4, fontWeight:700 }}>{m.Contratos.length}</span>}</>
                              : <span style={{ color:'#cbd5e1', fontSize:'0.82rem' }}>—</span>}
                          </div>
                          {/* Viagens */}
                          <div style={{ textAlign:'right', paddingRight:16 }}>
                            {viagTotal !== 0
                              ? <><span style={{ fontVariantNumeric:'tabular-nums', fontSize:'0.85rem', fontWeight:600, color:CAT_STYLE.Viagens.color }}>{formatBRL(viagTotal)}</span>
                                  {m.Viagens.length>0 && <span style={{ fontSize:'0.6rem', background:CAT_STYLE.Viagens.bg, color:CAT_STYLE.Viagens.color, border:`1px solid ${CAT_STYLE.Viagens.border}`, borderRadius:8, padding:'1px 5px', marginLeft:4, fontWeight:700 }}>{m.Viagens.length}</span>}</>
                              : <span style={{ color:'#cbd5e1', fontSize:'0.82rem' }}>—</span>}
                          </div>
                          {/* Dispensados */}
                          <div style={{ textAlign:'right', paddingRight:16 }}>
                            {dispTotal !== 0
                              ? <><span style={{ fontVariantNumeric:'tabular-nums', fontSize:'0.85rem', fontWeight:600, color:CAT_STYLE.Dispensado.color }}>{formatBRL(dispTotal)}</span>
                                  {m.Dispensado.length>0 && <span style={{ fontSize:'0.6rem', background:CAT_STYLE.Dispensado.bg, color:CAT_STYLE.Dispensado.color, border:`1px solid ${CAT_STYLE.Dispensado.border}`, borderRadius:8, padding:'1px 5px', marginLeft:4, fontWeight:700 }}>{m.Dispensado.length}</span>}</>
                              : <span style={{ color:'#cbd5e1', fontSize:'0.82rem' }}>—</span>}
                          </div>
                          {/* Expand toggle */}
                          <div style={{ textAlign:'center', color:'#94a3b8', fontSize:'0.7rem', fontWeight:700, userSelect:'none' }}>
                            {isExp ? '▲' : '▼'}
                          </div>
                        </div>

                        {/* Expanded items — nested table */}
                        {isExp && (
                          <div style={{ background:'#f8fafc', borderTop:'1px solid #e2e8f0' }}>
                            {['Contratos', 'Viagens', 'Dispensado'].map(cat => {
                              const items = m[cat];
                              if (!items.length) return null;
                              const cs = CAT_STYLE[cat];
                              const allOn  = items.every((_, i) => itemSel[`${monthKey}|${cat}|${i}`]);
                              const someOn = items.some((_, i)  => itemSel[`${monthKey}|${cat}|${i}`]);
                              return (
                                <div key={cat}>
                                  {/* Cat sub-header */}
                                  <div style={{ display:'grid', gridTemplateColumns:'28px 20px 1fr 1fr 130px', alignItems:'center', gap:8, padding:'6px 14px 6px 28px', background:cs.bg, borderBottom:`1px solid ${cs.border}` }}>
                                    <input type="checkbox" checked={allOn}
                                      ref={el => { if (el) el.indeterminate = !allOn && someOn; }}
                                      onChange={() => toggleCatMonth(monthKey, cat, items)}
                                      style={{ accentColor:cs.color, width:13, height:13, cursor:'pointer' }}
                                    />
                                    <span style={{ fontSize:'0.9rem' }}>{cs.emoji}</span>
                                    <span style={{ fontSize:'0.68rem', fontWeight:700, textTransform:'uppercase', color:cs.color, letterSpacing:'0.05em' }}>{cs.label} <span style={{ opacity:0.6, fontWeight:400 }}>({items.length})</span></span>
                                    <span style={{ fontSize:'0.65rem', color:'#94a3b8', fontStyle:'italic' }}>Denominação</span>
                                    <span style={{ fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', color:cs.color, textAlign:'right' }}>Valor</span>
                                  </div>
                                  {/* Item rows */}
                                  {items.map((it, i) => {
                                    const itemKey = `${monthKey}|${cat}|${i}`;
                                    const sel = !!itemSel[itemKey];
                                    return (
                                      <label key={i} style={{ display:'grid', gridTemplateColumns:'28px 20px 1fr 1fr 130px', alignItems:'center', gap:8, padding:'6px 14px 6px 28px', borderBottom:'1px solid #f0f4f8', cursor:'pointer', background: sel ? cs.bg+'99' : 'transparent', transition:'background 0.1s' }}>
                                        <input type="checkbox" checked={sel}
                                          onChange={() => toggleItem(itemKey)}
                                          style={{ accentColor:cs.color, width:13, height:13, cursor:'pointer' }}
                                        />
                                        <span></span>
                                        <span style={{ fontSize:'0.78rem', color:'var(--text-primary)', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={it.descr}>{it.descr}</span>
                                        <span style={{ fontSize:'0.75rem', color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={it.denom}>{it.denom || '—'}</span>
                                        <span style={{ fontSize:'0.83rem', fontWeight:700, textAlign:'right', fontVariantNumeric:'tabular-nums', color: it.valor < 0 ? '#dc2626' : cs.color }}>{formatBRL(it.valor)}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>

              {/* Summary cards — Contratos | Viagens | Total | Dispensados */}
              {(() => {
                let totalDisp = 0;
                Object.entries(preview.months).forEach(([key, m]) => {
                  totalDisp += computeRawTotal(m.Dispensado);
                });
                return (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10, marginBottom:8 }}>
                    {[
                      { label:'📄 Contratos',   value:totalContr,              color:CAT_STYLE.Contratos.color,  bg:CAT_STYLE.Contratos.bg,  border:CAT_STYLE.Contratos.border },
                      { label:'✈️ Viagens',      value:totalViag,               color:CAT_STYLE.Viagens.color,    bg:CAT_STYLE.Viagens.bg,    border:CAT_STYLE.Viagens.border },
                      { label: isConsolidated ? '∑ Total Consol.' : '∑ Total', value:totalContr+totalViag,        color:theme.color,            bg:'#f8fafc',               border:theme.color+'44' },
                      { label:'🚫 Dispensados',  value:totalDisp,               color:CAT_STYLE.Dispensado.color, bg:CAT_STYLE.Dispensado.bg, border:CAT_STYLE.Dispensado.border },
                    ].map(c => (
                      <div key={c.label} style={{ background:c.bg, border:`1.5px solid ${c.border}`, borderRadius:10, padding:'11px 14px', textAlign:'center' }}>
                        <div style={{ fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', color:c.color, marginBottom:4, letterSpacing:'0.04em' }}>{c.label}</div>
                        <div style={{ fontVariantNumeric:'tabular-nums', fontWeight:700, fontSize:'0.98rem', color:c.color }}>{formatBRL(c.value)}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {preview && (
          <div style={{ padding:'14px 22px', borderTop:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, background:'#f8fafc' }}>
            <div style={{ fontSize:'0.78rem', color:'var(--text-muted)' }}>
              {isConsolidated
                ? `Soma = ${formatBRL(totalContr + totalViag)} aplicado como Realizado consolidado`
                : `Valores serão inseridos em Contratos e Viagens nos meses correspondentes`}
            </div>
            <button
              onClick={handleApplyClick}
              disabled={applying || parsing}
              style={{ padding:'10px 24px', borderRadius:8, border:'none', background: applying ? '#64748b' : theme.color, color:'#fff', fontWeight:700, fontSize:'0.9rem', cursor: applying ? 'wait' : 'pointer', display:'flex', alignItems:'center', gap:8 }}
            >
              {applying ? (
                <><span style={{ width:14, height:14, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite', display:'inline-block' }} />Salvando...</>
              ) : '✓ Aplicar e Salvar'}
            </button>
          </div>
        )}
      </div>

      {/* Confirm overwrite dialog */}
      {confirmData && (
        <div style={{ position:'fixed', inset:0, zIndex:4000, background:'rgba(15,23,42,0.75)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }} onClick={e => e.stopPropagation()}>
          <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:460, padding:28, boxShadow:'0 16px 48px rgba(0,0,0,0.3)' }}>
            <div style={{ fontSize:'1.4rem', marginBottom:10 }}>⚠️</div>
            <div style={{ fontWeight:700, fontSize:'1rem', color:'var(--ctg-navy)', marginBottom:8 }}>Sobrescrever dados existentes?</div>
            <div style={{ fontSize:'0.83rem', color:'#64748b', marginBottom:16, lineHeight:1.5 }}>
              Os seguintes campos já possuem valores de Realizado e serão <strong>sobrescritos</strong>:
              <ul style={{ marginTop:8, paddingLeft:18 }}>
                {confirmData.conflicts.map(({ cat, mo, year: conflictYear }, i) => (
                  <li key={i} style={{ marginBottom:3 }}>
                    <strong>{cat}</strong> — {MONTHS_FULL_PT[mo-1]}{conflictYear ? ` / ${conflictYear}` : ''}
                  </li>
                ))}
              </ul>
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => setConfirmData(null)} style={{ padding:'8px 18px', borderRadius:8, border:'1.5px solid #e2e8f0', background:'#fff', color:'#374151', fontWeight:600, fontSize:'0.85rem', cursor:'pointer' }}>Cancelar</button>
              <button onClick={confirmOverwrite} disabled={applying} style={{ padding:'8px 18px', borderRadius:8, border:'none', background: applying ? '#64748b' : '#dc2626', color:'#fff', fontWeight:700, fontSize:'0.85rem', cursor: applying ? 'wait' : 'pointer', display:'flex', alignItems:'center', gap:8 }}>
                {applying ? <><span style={{ width:12, height:12, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.8s linear infinite', display:'inline-block' }} />Salvando...</> : 'Sobrescrever e Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CATEGORIES = ['Viagens', 'Contratos', 'POs'];
const CAT_DESCRIPTIONS = {
  Viagens:   'Despesas com deslocamentos, hospedagem, alimentação e transporte.',
  Contratos: 'Pagamentos previstos a fornecedores contratados — medições, parcelas e marcos.',
  POs:       'Ordens de compra — materiais, equipamentos e serviços pontuais.',
};
const CAT_ICONS = { Viagens: 'VGS', Contratos: 'CTR', POs: 'POs' };

function getTypeTheme(C) {
  return {
    Budget:   { label:'Budget',    color:C.budget,   light:C.budget+'18',   border:C.budget+'55',   row:C.budget+'28',   text:C.budget },
    Forecast: { label:'Forecast',  color:C.forecast, light:C.forecast+'18', border:C.forecast+'55', row:C.forecast+'28', text:C.forecast },
    Actual:   { label:'Realizado', color:C.actual,   light:C.actual+'18',   border:C.actual+'55',   row:C.actual+'28',   text:C.actual },
    Meta:     { label:'Meta',      color:C.meta,     light:C.meta+'18',     border:C.meta+'55',     row:C.meta+'28',     text:C.meta },
    Pool:     { label:'Pool',      color:C.pool,     light:C.pool+'18',     border:C.pool+'55',     row:C.pool+'28',     text:C.pool },
  };
}
const TYPE_THEME = getTypeTheme({ budget:'#15803D', forecast:'#0EA5E9', actual:'#1E40AF', meta:'#7C3AED', pool:'#0891B2' });
const REF_TYPE = { Budget:'Forecast', Forecast:'Budget', Actual:'Forecast', Meta:'Budget', Pool:'Budget' };

function fmtInput(val) {
  if (!val || val === 0) return '';
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseInput(str) {
  if (!str) return 0;
  return Math.max(0, parseFloat(String(str).replace(/\./g,'').replace(',','.')) || 0);
}
function fmtNum(v) {
  return v > 0 ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
}

// ── Month input row ───────────────────────────────────────────────────────────
function MonthRow({ month, year, value, comment, onChange, refValue, refLabel, theme, otherComments, lockedByActual, activeType }) {
  const [localVal, setLocalVal] = useState(fmtInput(value));
  const [localCmt, setLocalCmt] = useState(comment);
  const didMount = useRef(false);

  // Lock Forecast fields for months <= last actual month
  const isLocked = activeType === 'Forecast' && lockedByActual;

  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    setLocalVal(fmtInput(value));
    setLocalCmt(comment);
  }, [value, comment]);

  const isCurrent = new Date().getMonth() + 1 === month && new Date().getFullYear() === parseInt(year);
  const parsed = parseInput(localVal);
  const diff   = refValue != null ? parsed - refValue : null;
  const isOver  = diff != null && diff > 0.01;
  const isUnder = diff != null && diff < -0.01;

  const commitVal = () => { const p = parseInput(localVal); setLocalVal(fmtInput(p)); onChange(month, p, localCmt); };
  const commitCmt = () => onChange(month, parseInput(localVal), localCmt);
  const visibleOtherComments = (otherComments || []).filter(c => c.comment && c.comment.trim());

  return (
    <div className="wz-month-row" style={{ display:'flex', flexDirection:'column', borderBottom:`1px solid ${theme.border}`, background: isCurrent ? theme.row : 'transparent' }}>
      <div className="wz-month-grid" style={{ display:'grid', gridTemplateColumns:'110px 1fr 1fr', gap:12, padding:'10px 16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
          <span style={{ fontSize:'0.84rem', fontWeight:600, color:'var(--text-primary)' }}>{MONTHS_FULL_PT[month-1]}</span>
          {isCurrent && <span style={{ fontSize:'0.55rem', fontWeight:700, background:theme.color, color:'#fff', padding:'1px 5px', borderRadius:8, flexShrink:0 }}>Atual</span>}
        </div>
        {isLocked ? (
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 10px', background:'#F1F5F9', borderRadius:'var(--radius-sm)', border:'1.5px solid #CBD5E1', gridColumn:'span 2' }}>
            <span style={{ fontSize:'0.72rem', color:'#64748B', fontStyle:'italic' }}>
              🔒 Mês já realizado — Forecast bloqueado
            </span>
          </div>
        ) : (
          <>
            <div style={{ display:'flex', flexDirection:'column', gap:3, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <span style={{ fontSize:'0.72rem', color:'var(--text-muted)', fontWeight:600, flexShrink:0 }}>R$</span>
                <input style={{ flex:1, minWidth:0, border:`1.5px solid ${isOver?'#FCA5A5':isUnder?'#BBF7D0':'var(--border-strong)'}`, borderRadius:'var(--radius-sm)', padding:'7px 10px', fontFamily:'var(--font-body)', fontSize:'0.9rem', textAlign:'right', outline:'none', fontVariantNumeric:'tabular-nums', background:isOver?'#FEF2F2':'transparent', transition:'border-color 0.15s', boxSizing:'border-box' }}
                  type="text" inputMode="decimal" placeholder="0,00"
                  value={localVal}
                  onChange={e => setLocalVal(e.target.value)}
                  onFocus={e => e.target.select()}
                  onBlur={commitVal}
                  onKeyDown={e => { if (e.key==='Enter') e.target.blur(); }}
                />
                {diff != null && Math.abs(diff) > 0.01 && (
                  <span style={{ fontSize:'0.65rem', fontWeight:700, flexShrink:0, color:isOver?'#DC2626':'#166534', whiteSpace:'nowrap' }}>
                    {isOver?'▲':'▼'} {formatBRL(Math.abs(diff))}
                  </span>
                )}
              </div>
              {refValue != null && <div style={{ fontSize:'0.6rem', color:'var(--text-muted)', textAlign:'right', paddingRight:4 }}>{refLabel}: {refValue===0?'—':formatBRL(refValue)}</div>}
            </div>
            <input className="wz-month-comment" style={{ width:'100%', minWidth:0, border:`1.5px solid ${theme.border}`, borderRadius:'var(--radius-sm)', padding:'7px 10px', fontFamily:'var(--font-body)', fontSize:'0.82rem', outline:'none', background:'transparent', color:'var(--text-secondary)', boxSizing:'border-box' }}
              type="text" placeholder="Observação..."
              value={localCmt}
              onChange={e => setLocalCmt(e.target.value)}
              onBlur={commitCmt}
              onKeyDown={e => { if (e.key==='Enter') e.target.blur(); }}
            />
          </>
        )}
      </div>
      {visibleOtherComments.length > 0 && (
        <div className="wz-other-comments" style={{ padding:'0 16px 8px', paddingLeft:138, display:'flex', flexDirection:'column', gap:3 }}>
          {visibleOtherComments.map((c, i) => (
            <div key={i} style={{ display:'flex', alignItems:'baseline', gap:6, fontSize:'0.7rem', color:'var(--text-muted)', lineHeight:1.4, flexWrap:'wrap' }}>
              <span style={{ fontSize:'0.58rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.04em', color: c.typeColor||'#6B7280', background:(c.typeColor||'#6B7280')+'18', padding:'1px 5px', borderRadius:4, flexShrink:0, whiteSpace:'nowrap' }}>{c.typeLabel}</span>
              <span style={{ fontStyle:'italic', color:'var(--text-secondary)', wordBreak:'break-word' }}>"{c.comment}"</span>
              {c.updatedBy && <span style={{ fontSize:'0.58rem', color:'var(--text-muted)', flexShrink:0, whiteSpace:'nowrap' }}>— {c.updatedBy}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConsInputRow({ cat, value, theme, onChange, disabled = false }) {
  const [localVal, setLocalVal] = useState(value ? fmtInput(value) : '');
  const didMount = useRef(false);

  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    const parentNum = value || 0;
    const localNum  = parseInput(localVal);
    if (Math.abs(parentNum - localNum) > 0.001) setLocalVal(parentNum ? fmtInput(parentNum) : '');
  }, [value]);

  const commit = () => { const p = parseInput(localVal); setLocalVal(p ? fmtInput(p) : ''); onChange(p); };

  return (
    <div style={{ display:'grid', gridTemplateColumns:'140px 1fr', gap:12, padding:'10px 16px', borderBottom:`1px solid ${theme.border}`, alignItems:'center' }}>
      <span style={{ fontSize:'0.85rem', fontWeight:600, color:'var(--text-primary)' }}>{cat}</span>
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <span style={{ fontSize:'0.75rem', color:'var(--text-muted)', fontWeight:600, flexShrink:0 }}>R$</span>
        <input type="text" inputMode="decimal" placeholder="0,00" value={localVal}
          onChange={e => !disabled && setLocalVal(e.target.value)}
          onFocus={e => !disabled && e.target.select()}
          onBlur={() => !disabled && commit()}
          onKeyDown={e => { if (e.key==='Enter' && !disabled) e.target.blur(); }}
          readOnly={disabled}
          style={{ flex:1, border:`1.5px solid ${theme.border}`, borderRadius:'var(--radius-sm)', padding:'8px 12px', fontFamily:'var(--font-body)', fontSize:'0.9rem', textAlign:'right', outline:'none', background: disabled ? '#F1F5F9' : 'rgba(255,255,255,0.8)', color: disabled ? '#94A3B8' : theme.text, fontWeight:600, fontVariantNumeric:'tabular-nums', cursor: disabled ? 'not-allowed' : 'text' }}
        />
      </div>
    </div>
  );
}

function SIWarning({ si, projection }) {
  const over = parseFloat(projection||0) - si;
  if (!si || over <= 0) return null;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 20px', background:'#FEF2F2', borderBottom:'1.5px solid #FCA5A5', fontSize:'0.78rem', color:'#991B1B', fontWeight:600 }}>
      ⚠ Projeção (Realizado + Forecast restante) excede a SI ({formatBRL(si)}) em {formatBRL(over)}
    </div>
  );
}

// ── Botão Importar SAP (reutilizável) ─────────────────────────────────────────
function BtnImportSAP({ onClick }) {
  return (
    <button onClick={onClick} title="Importar realizados do SAP (Excel)"
      style={{
        padding:'8px 16px', border:'2px solid rgba(255,255,255,0.35)', cursor:'pointer',
        background:'rgba(255,255,255,0.15)',
        color:'#fff', fontWeight:700, fontSize:'0.8rem', fontFamily:'var(--font-body)',
        borderRadius:20, transition:'all 0.18s', display:'flex', alignItems:'center', gap:7,
        whiteSpace:'nowrap', letterSpacing:'0.02em', boxShadow:'0 2px 8px rgba(0,0,0,0.15)',
        marginLeft:4, marginBottom:4, marginTop:4,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.28)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.7)';
        e.currentTarget.style.boxShadow = '0 3px 12px rgba(0,0,0,0.25)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" style={{ flexShrink:0 }}>
        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd"/>
      </svg>
      Importar SAP
    </button>
  );
}

// ── Main ForecastWizard ───────────────────────────────────────────────────────
export default function ForecastWizard({
  projectId, entries, year, onYearChange, onSaved,
  editType = 'Forecast', availableTypes,
  siValue = 0, consolidatedActual = 0, siProjection = 0, yearConfig,
}) {
  const C = useTypeColors();
  const TYPE_THEME = getTypeTheme(C);
  const { user } = useAuth();
  const role = user?.role;
  const isGerente = role === 'gerente';
  const types = availableTypes?.length ? availableTypes : [editType];

  const activeStart = yearConfig?.activeStart || 2026;
  const activeEnd   = yearConfig?.activeEnd   || 2031;
  const YEARS = [];
  for (let y = activeStart; y <= activeEnd; y++) YEARS.push(y);

  const consolidatedYears  = yearConfig?.consolidatedYears || [activeStart - 1];
  const isConsolidatedYear = consolidatedYears.includes(parseInt(year));

  const [activeType, setActiveType] = useState(types.includes(editType) ? editType : types[0]);
  const [step,       setStep]       = useState(0);
  const [localData,  setLocalData]  = useState({});
  const [consData,   setConsData]   = useState({});
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { toast } = useToast();

  const theme = TYPE_THEME[activeType] || TYPE_THEME.Forecast;

  useEffect(() => { setLocalData(buildAll(entries, year)); setStep(0); setSaved(false); }, [entries, year]);

  // Last month with Actual data in current year — all months <= this are locked for Forecast
  let lastActualMonth = 0;
  for (const e of entries) {
    if (e.type !== 'Actual' || parseInt(e.year) !== parseInt(year)) continue;
    if (parseFloat(e.value) > 0 && parseInt(e.month) > lastActualMonth) lastActualMonth = parseInt(e.month);
  }



  useEffect(() => {
    if (!isConsolidatedYear) return;
    api.get(`/forecast/project/${projectId}/year-consolidated?year=${year}`)
      .then(r => { const map = {}; (r.data||[]).forEach(e => { map[`${e.type}|${e.category}`] = parseFloat(e.value)||0; }); setConsData(map); })
      .catch(() => {});
  }, [projectId, year, isConsolidatedYear]);

  useEffect(() => { if (types.includes(editType)) setActiveType(editType); }, [editType]);

  function buildAll(entries, year) {
    const map = {};
    for (const e of entries) {
      if (parseInt(e.year) !== parseInt(year)) continue;
      map[`${e.type}|${e.category}|${e.month}`] = { value: parseFloat(e.value)||0, comment: e.comment||'' };
    }
    return map;
  }

  const getValue   = (type, cat, month) => localData[`${type}|${cat}|${month}`]?.value   ?? 0;
  const getComment = (type, cat, month) => localData[`${type}|${cat}|${month}`]?.comment ?? '';
  const getRef     = useCallback((type, cat, month) => {
    const rt = REF_TYPE[type];
    const e  = entries.find(e => e.category===cat && e.type===rt && parseInt(e.year)===parseInt(year) && parseInt(e.month)===month);
    return e ? parseFloat(e.value) : null;
  }, [entries, year]);

  const getOtherComments = useCallback((currentType, cat, month) => {
    return entries
      .filter(e => e.category===cat && e.type!==currentType && parseInt(e.year)===parseInt(year) && parseInt(e.month)===month && e.comment?.trim())
      .map(e => { const tt = TYPE_THEME[e.type]; return { type:e.type, typeLabel:tt?.label||e.type, typeColor:tt?.color||'#6B7280', comment:e.comment, updatedBy:e.updated_by_name||'' }; });
  }, [entries, year]);

  const handleChange = (type, cat, month, value, comment) => {
    setLocalData(prev => ({ ...prev, [`${type}|${cat}|${month}`]: { value, comment } }));
    setSaved(false);
  };

  // Aplica E SALVA dados importados do SAP diretamente no banco
  // importedData: { Contratos: { "year|month": { value, comment, year, month } }, Viagens: {...} }
  const handleImportApply = async (importedData) => {
    setSaving(true);
    try {
      // ── 1. Separar entradas por tipo de ano: consolidado vs mensal ──────────
      // consolidadoByYear: { year: total } — soma de Contratos+Viagens para anos consolidados
      const consolidadoByYear = {};
      // mensaisBulk: array de { category, type, year, month, value, comment }
      const mensaisBulk = [];

      Object.entries(importedData).forEach(([cat, entries]) => {
        Object.entries(entries).forEach(([, entry]) => {
          const entryYear  = parseInt(entry.year);
          const entryMonth = parseInt(entry.month);
          const value      = entry?.value   ?? 0;
          const comment    = entry?.comment ?? '';

          if (consolidatedYears.includes(entryYear)) {
            // Acumula por ano consolidado (soma Contratos + Viagens)
            consolidadoByYear[entryYear] = (consolidadoByYear[entryYear] ?? 0) + value;
          } else {
            // Entrada mensal normal — salva no mês/ano exato
            mensaisBulk.push({ category: cat, type: 'Actual', year: entryYear, month: entryMonth, value, comment });
          }
        });
      });

      // ── 2. Salvar entradas mensais via /bulk ─────────────────────────────────
      if (mensaisBulk.length > 0) {
        await api.post(`/forecast/project/${projectId}/bulk`, { entries: mensaisBulk });

        // Atualiza localData apenas com entradas do ano atualmente exibido
        setLocalData(prev => {
          const next = { ...prev };
          mensaisBulk
            .filter(e => e.year === parseInt(year))
            .forEach(e => {
              next[`Actual|${e.category}|${e.month}`] = { value: e.value, comment: e.comment };
            });
          return next;
        });
      }

      // ── 3. Salvar anos consolidados via /year-consolidated/bulk ─────────────
      if (Object.keys(consolidadoByYear).length > 0) {
        const consEntries = Object.entries(consolidadoByYear).map(([yr, total]) => ({
          year: parseInt(yr), category: 'Total', type: 'Actual', value: total,
        }));
        await api.post(`/forecast/project/${projectId}/year-consolidated/bulk`, { entries: consEntries });

        // Atualiza consData se o ano exibido for consolidado
        Object.entries(consolidadoByYear).forEach(([yr, total]) => {
          if (parseInt(yr) === parseInt(year)) {
            setConsData(prev => ({ ...prev, ['Actual|Total']: total }));
          }
        });
      }

      // ── 4. Feedback ao usuário ───────────────────────────────────────────────
      const totalMeses   = mensaisBulk.length;
      const totalConsAno = Object.keys(consolidadoByYear).length;
      const parts = [];
      if (totalMeses > 0)   parts.push(`${totalMeses} entr. mensais`);
      if (totalConsAno > 0) parts.push(`${totalConsAno} ano(s) consolidado(s)`);
      toast(`✅ SAP importado e salvo: ${parts.join(' + ')}`, 'success');

      setSaved(true);
      onSaved?.();
      if (types.includes('Actual')) setActiveType('Actual');
      setStep(4);
    } catch (err) {
      console.error('[handleImportApply]', err);
      toast('Erro ao salvar dados do SAP. Tente novamente.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const getCatTotal  = (type, cat) => Array.from({length:12},(_,i)=>i+1).reduce((s,m) => s+getValue(type,cat,m), 0);
  const getTypeTotal = (type)      => CATEGORIES.reduce((s,c) => s+getCatTotal(type,c), 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      const bulk = [];
      types.forEach(type => CATEGORIES.forEach(cat => {
        for (let m=1; m<=12; m++) bulk.push({ category:cat, type, year:parseInt(year), month:m, value:getValue(type,cat,m), comment:getComment(type,cat,m) });
      }));
      await api.post(`/forecast/project/${projectId}/bulk`, { entries: bulk });
      setSaved(true); toast('Dados salvos com sucesso!', 'success'); onSaved?.();
    } catch { toast('Erro ao salvar.', 'error'); }
    finally { setSaving(false); }
  };

  const si = parseFloat(siValue)||0;
  const hasData = (type) => CATEGORIES.some(cat => Array.from({length:12},(_,i)=>i+1).some(m => getValue(type,cat,m)>0));

  const consGetVal = (type = 'Actual') => consData[`${type}|Total`] ?? 0;
  const handleConsChange = (type, val) => { setConsData(prev => ({ ...prev, [`${type}|Total`]: val })); setSaved(false); };
  const handleConsSave = async () => {
    setSaving(true);
    try {
      const ents = [
        { year:parseInt(year), category:'Total', type:'Actual', value:consGetVal('Actual') },
      ];
      await api.post(`/forecast/project/${projectId}/year-consolidated/bulk`, { entries: ents });
      setSaved(true); toast(`Valor consolidado de ${year} salvo!`, 'success'); onSaved?.();
    } catch { toast('Erro ao salvar.', 'error'); }
    finally { setSaving(false); }
  };

  const activeSave = isConsolidatedYear ? handleConsSave : handleSave;

  // Note: beforeunload handler removed — caused PWA to minimize unexpectedly

  const WrapperWithTypeBar = ({ children }) => (
    <div style={{ width:'100%', background:theme.light, border:`1.5px solid ${theme.border}`, borderRadius:'var(--radius-lg)', overflow:'hidden', transition:'background 0.2s, border-color 0.2s', position:'relative' }}>
      {saving && (
        <div style={{ position:'absolute', inset:0, zIndex:50, background:'rgba(255,255,255,0.7)', backdropFilter:'blur(2px)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12 }}>
          <div style={{ width:40, height:40, border:`3.5px solid ${theme.border}`, borderTopColor:theme.color, borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
          <span style={{ fontSize:'0.9rem', fontWeight:700, color:theme.color }}>Salvando dados…</span>
          <span style={{ fontSize:'0.72rem', color:'var(--text-muted)' }}>Não feche a página.</span>
        </div>
      )}

      {/* Abas de ano */}
      <div className="wizard-year-row" style={{ display:'flex', alignItems:'stretch', background:'var(--ctg-navy)', borderBottom:'1px solid rgba(255,255,255,0.1)', overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
        {consolidatedYears.map(y => {
          const isActive = parseInt(year) === y;
          return (
            <button key={y} onClick={() => { onYearChange?.(y, 'consolidated'); setStep(0); }} style={{ padding:'9px 14px', border:'none', cursor:'pointer', background:isActive?'rgba(255,200,50,0.2)':'transparent', color:isActive?'#FCD34D':'rgba(255,255,255,0.35)', fontWeight:isActive?700:400, fontSize:'0.82rem', fontFamily:'var(--font-display)', borderBottom:isActive?'3px solid #FCD34D':'3px solid transparent', transition:'all 0.15s', whiteSpace:'nowrap', flexShrink:0 }}>
              {y} <span style={{ fontSize:'0.58rem', opacity:0.7 }}>consolidado</span>
            </button>
          );
        })}
        {consolidatedYears.length > 0 && <div style={{ width:1, background:'rgba(255,255,255,0.15)', margin:'6px 2px', flexShrink:0 }} />}
        {YEARS.map(y => {
          const isActive = parseInt(year) === y;
          return (
            <button key={y} onClick={() => { onYearChange?.(y); setStep(0); }} style={{ padding:'9px 18px', border:'none', cursor:'pointer', background:isActive?'rgba(255,255,255,0.15)':'transparent', color:isActive?'#fff':'rgba(255,255,255,0.5)', fontWeight:isActive?700:400, fontSize:'0.88rem', fontFamily:'var(--font-display)', borderBottom:isActive?'3px solid #fff':'3px solid transparent', transition:'all 0.15s', whiteSpace:'nowrap', flexShrink:0 }}>{y}</button>
          );
        })}
      </div>

      {/* Barra de tipo / ações */}
      {isConsolidatedYear ? (
        <div className="wizard-type-row" style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:'linear-gradient(135deg, var(--ctg-navy), #0F3460)', padding:'10px 20px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ color:'#fff', fontWeight:700, fontSize:'0.9rem' }}>📦 {year} — Consolidado</span>
            <BtnImportSAP onClick={() => setImportOpen(true)} />
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:18 }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:'0.56rem', fontWeight:700, color:'rgba(255,255,255,0.55)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Realizado</div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:'1rem', color:'#fff', fontWeight:600 }}>{formatBRL(consGetVal('Actual'))}</div>
            </div>
            {isGerente
              ? <span style={{fontSize:'0.72rem',color:'rgba(255,255,255,0.5)',fontStyle:'italic',padding:'8px 12px'}}>Somente leitura</span>
              : <button onClick={activeSave} disabled={saving} style={{ padding:'8px 22px', border:'none', cursor:saving?'wait':'pointer', background:saved?'rgba(255,255,255,0.22)':'rgba(255,255,255,0.12)', color:'#fff', fontWeight:700, fontSize:'0.82rem', fontFamily:'var(--font-body)', borderRadius:'var(--radius-sm)', whiteSpace:'nowrap', transition:'background 0.15s' }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.28)'}
                onMouseLeave={e=>e.currentTarget.style.background=saved?'rgba(255,255,255,0.22)':'rgba(255,255,255,0.12)'}
              >{saving?'Salvando...':saved?'✓ Salvo':'💾 Salvar'}</button>
            }
          </div>
        </div>
      ) : (
        <div className="wizard-type-row" style={{ display:'flex', alignItems:'stretch', background:`linear-gradient(135deg, ${theme.color}EE, ${theme.color}BB)`, flexWrap:'wrap' }}>
          {types.map(t => {
            const th = TYPE_THEME[t], isActive = activeType===t;
            return (
              <button key={t} onClick={()=>{ setActiveType(t); setStep(0); }} style={{ padding:'10px 20px', border:'none', cursor:'pointer', background:isActive?'rgba(255,255,255,0.2)':'transparent', color:isActive?'#fff':'rgba(255,255,255,0.6)', fontWeight:isActive?700:500, fontSize:'0.86rem', fontFamily:'var(--font-body)', borderBottom:isActive?'3px solid #fff':'3px solid transparent', transition:'all 0.15s', display:'flex', flexDirection:'column', alignItems:'center', gap:1 }}>
                <span>{th.label}</span>
                {hasData(t) && <span style={{ fontSize:'0.55rem', color:isActive?'rgba(255,255,255,0.8)':'rgba(255,255,255,0.5)' }}>✓ preenchido</span>}
              </button>
            );
          })}
          {types.includes('Actual') && <BtnImportSAP onClick={() => setImportOpen(true)} />}
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:0 }}>
            <div className="wizard-totals-bar" style={{ display:'flex', alignItems:'center', gap:18, padding:'0 20px', flexWrap:'wrap' }}>
              {CATEGORIES.map(cat => (
                <div key={cat} style={{ textAlign:'center' }}>
                  <div className="wizard-cat-label" style={{ fontSize:'0.56rem', fontWeight:700, color:'rgba(255,255,255,0.55)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{cat}</div>
                  <div className="wizard-cat-value" style={{ fontFamily:'var(--font-display)', fontSize:'0.9rem', color:'#fff' }}>{formatBRL(getCatTotal(activeType,cat))}</div>
                </div>
              ))}
              <div style={{ borderLeft:'1px solid rgba(255,255,255,0.25)', paddingLeft:16, textAlign:'center' }}>
                <div style={{ fontSize:'0.56rem', fontWeight:700, color:'rgba(255,255,255,0.55)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Total</div>
                <div style={{ fontFamily:'var(--font-display)', fontSize:'1rem', color:'#fff', fontWeight:600 }}>{formatBRL(getTypeTotal(activeType))}</div>
              </div>
            </div>
            <button onClick={activeSave} disabled={saving} style={{ padding:'0 22px', alignSelf:'stretch', border:'none', cursor:saving?'wait':'pointer', background:saved?'rgba(255,255,255,0.22)':'rgba(255,255,255,0.12)', color:'#fff', fontWeight:700, fontSize:'0.82rem', fontFamily:'var(--font-body)', borderLeft:'1px solid rgba(255,255,255,0.2)', whiteSpace:'nowrap', transition:'background 0.15s' }}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.28)'}
              onMouseLeave={e=>e.currentTarget.style.background=saved?'rgba(255,255,255,0.22)':'rgba(255,255,255,0.12)'}
            >{saving?'Salvando...':saved?'✓ Salvo':'💾 Salvar'}</button>
          </div>
        </div>
      )}

      <SIWarning si={si} projection={siProjection}/>
      {children}
    </div>
  );

  // ── CONSOLIDATED YEAR ──────────────────────────────────────────────────────
  if (isConsolidatedYear) {
    const thA = TYPE_THEME['Actual'];
    return (
      <>
      <WrapperWithTypeBar>
        <div style={{ padding:'24px 28px', background:'rgba(255,255,255,0.65)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
            <div style={{ width:44, height:44, borderRadius:'var(--radius-md)', background:'#FEF3C7', border:'2px solid #F59E0B', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.2rem', flexShrink:0 }}>📦</div>
            <div>
              <h2 style={{ fontFamily:'var(--font-display)', fontSize:'1.4rem', color:'var(--ctg-navy)', marginBottom:2 }}>{year} — Valor Consolidado</h2>
              <p style={{ fontSize:'0.82rem', color:'var(--text-secondary)', lineHeight:1.5 }}>Ano encerrado — insira o valor total realizado consolidado do ano (sem detalhamento mensal).</p>
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ borderRadius:'var(--radius-md)', border:`1.5px solid ${thA.border}`, overflow:'hidden' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 18px', background:`linear-gradient(135deg, ${thA.color}EE, ${thA.color}BB)`, color:'#fff' }}>
                <span style={{ fontWeight:700, fontSize:'0.95rem' }}>Realizado Total</span>
                <span style={{ fontFamily:'var(--font-display)', fontSize:'1.2rem' }}>{formatBRL(consGetVal('Actual'))}</span>
              </div>
              <div style={{ padding:'16px 18px', background:thA.light }}>
                <label style={{ fontSize:'0.78rem', fontWeight:600, color:'var(--text-secondary)', marginBottom:6, display:'block' }}>Valor total realizado em {year} (R$)</label>
                <ConsInputRow cat="Realizado" value={consGetVal('Actual')} theme={thA} onChange={isGerente ? ()=>{} : (val => handleConsChange('Actual', val))} disabled={isGerente} />
              </div>
            </div>
          </div>
        </div>
      </WrapperWithTypeBar>
      <ImportActualModal open={importOpen} onClose={() => setImportOpen(false)} onApply={handleImportApply} currentYear={year} theme={TYPE_THEME['Actual']||theme} isConsolidated={true} existingData={localData} />
      </>
    );
  }

  // ── STEP 0: Intro ──────────────────────────────────────────────────────────
  if (step === 0) {
    const hasExisting = types.some(t => hasData(t));
    return (
      <>
      <WrapperWithTypeBar>
        <div style={{ padding:'36px 40px', textAlign:'center', background:'rgba(255,255,255,0.6)' }}>
          <h2 style={{ fontFamily:'var(--font-display)', fontSize:'1.7rem', color:'var(--ctg-navy)', marginBottom:10 }}>
            {hasExisting ? `Editar ${theme.label} ${year}` : `Preenchimento do ${theme.label} ${year}`}
          </h2>
          <p style={{ fontSize:'0.9rem', color:'var(--text-secondary)', lineHeight:1.7, maxWidth:500, margin:'0 auto 24px' }}>
            {hasExisting ? 'Seus valores já salvos estão carregados. Altere o que precisar e salve.' : `Preencha o ${theme.label} mês a mês para cada categoria de custo do projeto.`}
          </p>
          <div style={{ background:'rgba(255,255,255,0.7)', borderRadius:'var(--radius-lg)', padding:'16px 20px', marginBottom:28, textAlign:'left', maxWidth:560, margin:'0 auto 24px', border:`1px solid ${theme.border}` }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:10 }}>
              <span style={{ background:theme.light, color:theme.text, border:`1px solid ${theme.border}`, padding:'3px 10px', borderRadius:12, fontSize:'0.75rem', fontWeight:700, flexShrink:0 }}>{theme.label}</span>
              <span style={{ fontSize:'0.83rem', color:'var(--text-secondary)' }}>{TYPE_THEME[activeType]?.description || ''}</span>
            </div>
            {REF_TYPE[activeType] && (
              <div style={{ display:'flex', alignItems:'flex-start', gap:12, paddingTop:10, borderTop:`1px solid ${theme.border}` }}>
                <span style={{ background:TYPE_THEME[REF_TYPE[activeType]]?.light, color:TYPE_THEME[REF_TYPE[activeType]]?.text, border:`1px solid ${TYPE_THEME[REF_TYPE[activeType]]?.border}`, padding:'3px 10px', borderRadius:12, fontSize:'0.75rem', fontWeight:700, flexShrink:0, whiteSpace:'nowrap' }}>{TYPE_THEME[REF_TYPE[activeType]]?.label} — ref.</span>
                <span style={{ fontSize:'0.83rem', color:'var(--text-secondary)' }}>Exibido como referência em cada linha para facilitar o preenchimento.</span>
              </div>
            )}
          </div>
          {hasExisting && (
            <div style={{ display:'flex', gap:12, justifyContent:'center', marginBottom:28, flexWrap:'wrap' }}>
              {CATEGORIES.map((cat,i) => {
                const total = getCatTotal(activeType, cat);
                return (
                  <div key={cat} onClick={()=>setStep(i+1)} style={{ padding:'14px 20px', borderRadius:'var(--radius-md)', cursor:'pointer', background:total>0?theme.row:'rgba(255,255,255,0.5)', border:`2px solid ${total>0?theme.color:theme.border}`, minWidth:140, textAlign:'center', transition:'all 0.15s' }}>
                    <div style={{ fontSize:'0.65rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:theme.text, marginBottom:4 }}>{cat}</div>
                    <div style={{ fontFamily:'var(--font-display)', fontSize:'1.1rem', color:total>0?theme.color:'var(--text-muted)' }}>{total>0?formatBRL(total):'—'}</div>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ display:'flex', gap:8, justifyContent:'center', marginBottom:28, flexWrap:'wrap' }}>
            {CATEGORIES.map((cat,i)=>(
              <div key={cat} onClick={()=>setStep(i+1)} style={{ padding:'10px 16px', borderRadius:'var(--radius-md)', cursor:'pointer', background:getCatTotal(activeType,cat)>0?theme.color:'rgba(255,255,255,0.6)', border:`1px solid ${theme.border}`, display:'flex', flexDirection:'column', alignItems:'center', gap:3, transition:'all 0.15s', minWidth:100 }}>
                <div style={{ width:26, height:26, borderRadius:'50%', background:getCatTotal(activeType,cat)>0?'rgba(255,255,255,0.25)':theme.light, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.8rem', fontWeight:700, color:getCatTotal(activeType,cat)>0?'#fff':theme.color }}>{getCatTotal(activeType,cat)>0?'✓':i+1}</div>
                <span style={{ fontSize:'0.78rem', fontWeight:600, color:getCatTotal(activeType,cat)>0?'#fff':theme.text }}>{cat}</span>
              </div>
            ))}
            <div onClick={()=>setStep(4)} style={{ padding:'10px 16px', borderRadius:'var(--radius-md)', cursor:'pointer', background:'rgba(255,255,255,0.6)', border:`1px solid ${theme.border}`, display:'flex', flexDirection:'column', alignItems:'center', gap:3, minWidth:100 }}>
              <div style={{ width:26, height:26, borderRadius:'50%', background:theme.light, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.8rem', fontWeight:700, color:theme.color }}>4</div>
              <span style={{ fontSize:'0.78rem', fontWeight:600, color:theme.text }}>Revisão</span>
            </div>
          </div>
          <button style={{ padding:'13px 36px', borderRadius:'var(--radius-md)', border:'none', cursor:'pointer', background:theme.color, color:'#fff', fontWeight:700, fontSize:'1rem', fontFamily:'var(--font-body)', transition:'opacity 0.15s' }}
            onClick={()=>setStep(1)}
            onMouseEnter={e=>e.currentTarget.style.opacity='0.88'}
            onMouseLeave={e=>e.currentTarget.style.opacity='1'}
          >{hasExisting ? `Editar ${theme.label} →` : `Iniciar preenchimento →`}</button>
        </div>
      </WrapperWithTypeBar>
      <ImportActualModal open={importOpen} onClose={() => setImportOpen(false)} onApply={handleImportApply} currentYear={year} theme={TYPE_THEME['Actual']||theme} isConsolidated={false} existingData={localData} />
      </>
    );
  }

  // ── STEPS 1-3: Category input ──────────────────────────────────────────────
  if (step >= 1 && step <= 3) {
    const cat = CATEGORIES[step-1];
    const catTotal    = getCatTotal(activeType, cat);
    const refTotalCat = Array.from({length:12},(_,i)=>i+1).reduce((s,m) => s+(getRef(activeType,cat,m)??0), 0);
    const diff = catTotal - refTotalCat;
    return (
      <>
      <WrapperWithTypeBar>
        <div style={{ display:'flex', alignItems:'center', padding:'14px 20px', background:'rgba(255,255,255,0.5)', borderBottom:`1px solid ${theme.border}`, gap:8, flexWrap:'wrap' }}>
          {[1,2,3,4].map(s => {
            const done = s < step, active = s === step, label = s<=3 ? CATEGORIES[s-1] : 'Revisão';
            return (
              <div key={s} onClick={()=>setStep(s)} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer', opacity:done||active?1:0.45 }}>
                <div style={{ width:26, height:26, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', background:done||active?theme.color:'var(--bg-app)', color:done||active?'#fff':theme.text, fontWeight:700, fontSize:'0.78rem', border:`2px solid ${done||active?theme.color:theme.border}`, flexShrink:0 }}>{done?'✓':s}</div>
                <span style={{ fontSize:'0.82rem', fontWeight:active?700:500, color:active?theme.color:'var(--text-secondary)' }}>{label}</span>
                {s<4 && <span style={{ color:'var(--text-muted)', fontSize:'0.8rem', marginRight:4 }}>›</span>}
              </div>
            );
          })}
        </div>
        <div style={{ display:'flex', alignItems:'flex-start', gap:14, padding:'16px 20px', background:`${theme.color}10`, borderBottom:`1px solid ${theme.border}`, flexWrap:'wrap' }}>
          <div style={{ width:42, height:42, borderRadius:'var(--radius-sm)', background:theme.light, border:`2px solid ${theme.color}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.65rem', fontWeight:800, color:theme.color, flexShrink:0 }}>{CAT_ICONS[cat]}</div>
          <div style={{ flex:1 }}>
            <h2 style={{ fontFamily:'var(--font-display)', fontSize:'1.2rem', color:'var(--ctg-navy)', marginBottom:2 }}>{cat}</h2>
            <p style={{ fontSize:'0.8rem', color:'var(--text-secondary)', lineHeight:1.5 }}>{CAT_DESCRIPTIONS[cat]}</p>
          </div>
          <div style={{ textAlign:'right', flexShrink:0 }}>
            <div style={{ fontSize:'0.62rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:theme.text, marginBottom:2 }}>Total {year}</div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:'1.3rem', color:theme.color }}>{formatBRL(catTotal)}</div>
            {refTotalCat>0 && <div style={{ fontSize:'0.68rem', color:diff>0?'#DC2626':diff<0?'#166534':'var(--text-muted)', fontWeight:600 }}>{diff===0?`= ${TYPE_THEME[REF_TYPE[activeType]]?.label}`:diff>0?`▲ ${formatBRL(Math.abs(diff))} acima`:`▼ ${formatBRL(Math.abs(diff))} abaixo`}</div>}
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'110px 1fr 1fr', gap:12, padding:'8px 16px', background:`${theme.color}12`, borderBottom:`1px solid ${theme.border}`, fontSize:'0.68rem', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:theme.color }}>
          <span>Mês</span><span>Valor {theme.label} (R$)</span><span>Observação</span>
        </div>
        <div style={{ background:'rgba(255,255,255,0.65)' }}>
          {Array.from({length:12},(_,i)=>i+1).map(month=>(
            <MonthRow key={`${activeType}|${cat}|${month}|${year}|${getValue(activeType,cat,month)}`}
              month={month} year={year}
              value={getValue(activeType,cat,month)} comment={getComment(activeType,cat,month)}
              refValue={getRef(activeType,cat,month)} refLabel={`Ref. ${TYPE_THEME[REF_TYPE[activeType]]?.label||''}`}
              theme={theme} onChange={(m,v,c)=>handleChange(activeType,cat,m,v,c)}
              otherComments={getOtherComments(activeType,cat,month)}
              lockedByActual={lastActualMonth > 0 && month <= lastActualMonth}
              activeType={activeType}
            />
          ))}
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', padding:'12px 20px', background:'rgba(255,255,255,0.5)', borderTop:`1px solid ${theme.border}` }}>
          <button onClick={()=>setStep(s=>s-1)} style={{ padding:'9px 20px', borderRadius:'var(--radius-sm)', border:`1.5px solid ${theme.border}`, background:'transparent', cursor:'pointer', color:theme.text, fontWeight:600, fontSize:'0.85rem', fontFamily:'var(--font-body)' }}>← {step===1?'Início':CATEGORIES[step-2]}</button>
          <button onClick={()=>setStep(s=>s+1)} style={{ padding:'9px 24px', borderRadius:'var(--radius-sm)', border:'none', background:theme.color, cursor:'pointer', color:'#fff', fontWeight:700, fontSize:'0.85rem', fontFamily:'var(--font-body)' }}>{step===3?'Revisar →':`${CATEGORIES[step]} →`}</button>
        </div>
      </WrapperWithTypeBar>
      <ImportActualModal open={importOpen} onClose={() => setImportOpen(false)} onApply={handleImportApply} currentYear={year} theme={TYPE_THEME['Actual']||theme} isConsolidated={false} existingData={localData} />
      </>
    );
  }

  // ── STEP 4: Revisão ────────────────────────────────────────────────────────
  const totalValue = getTypeTotal(activeType);
  return (
    <>
    <WrapperWithTypeBar>
      <div style={{ display:'flex', alignItems:'center', padding:'14px 20px', background:'rgba(255,255,255,0.5)', borderBottom:`1px solid ${theme.border}`, gap:8, flexWrap:'wrap' }}>
        {[1,2,3,4].map(s => {
          const done = s < 4, active = s === 4, label = s<=3 ? CATEGORIES[s-1] : 'Revisão';
          return (
            <div key={s} onClick={()=>setStep(s)} style={{ display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
              <div style={{ width:26, height:26, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', background:done||active?theme.color:'var(--bg-app)', color:'#fff', fontWeight:700, fontSize:'0.78rem', border:`2px solid ${theme.color}`, flexShrink:0 }}>{done?'✓':s}</div>
              <span style={{ fontSize:'0.82rem', fontWeight:active?700:500, color:active?theme.color:'var(--text-secondary)' }}>{label}</span>
              {s<4 && <span style={{ color:'var(--text-muted)', fontSize:'0.8rem', marginRight:4 }}>›</span>}
            </div>
          );
        })}
      </div>
      <div style={{ padding:'24px 28px', background:'rgba(255,255,255,0.65)' }}>
        <h2 style={{ fontFamily:'var(--font-display)', fontSize:'1.4rem', color:'var(--ctg-navy)', marginBottom:4 }}>Revisão do {theme.label} {year}</h2>
        <p style={{ color:'var(--text-muted)', fontSize:'0.85rem', marginBottom:20 }}>Confira os totais antes de salvar. Clique em uma categoria para voltar e editar.</p>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:22 }}>
          {CATEGORIES.map(cat => {
            const total = getCatTotal(activeType,cat);
            const refT  = Array.from({length:12},(_,i)=>i+1).reduce((s,m) => s+(getRef(activeType,cat,m)??0), 0);
            return (
              <div key={cat} onClick={()=>setStep(CATEGORIES.indexOf(cat)+1)} style={{ padding:'14px 16px', borderRadius:'var(--radius-md)', cursor:'pointer', background:total>0?theme.row:theme.light, border:`1.5px solid ${total>0?theme.color:theme.border}`, display:'flex', alignItems:'center', gap:12, transition:'all 0.15s' }}>
                <div style={{ width:36, height:36, borderRadius:'var(--radius-sm)', background:theme.light, border:`2px solid ${theme.color}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.6rem', fontWeight:800, color:theme.color, flexShrink:0 }}>{CAT_ICONS[cat]}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'0.72rem', fontWeight:700, color:theme.text, marginBottom:2 }}>{cat}</div>
                  <div style={{ fontFamily:'var(--font-display)', fontSize:'1rem', color:total>0?theme.color:'var(--text-muted)' }}>{formatBRL(total)}</div>
                  {refT>0 && <div style={{ fontSize:'0.62rem', color:'var(--text-muted)' }}>{TYPE_THEME[REF_TYPE[activeType]]?.label}: {formatBRL(refT)}</div>}
                </div>
                <span style={{ color:theme.color, opacity:0.5, fontSize:'0.8rem' }}>✎</span>
              </div>
            );
          })}
        </div>
        <div style={{ background:`linear-gradient(135deg, ${theme.color}, ${theme.color}CC)`, borderRadius:'var(--radius-md)', padding:'16px 22px', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, color:'#fff' }}>
          <div>
            <div style={{ fontSize:'0.72rem', opacity:0.75, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em' }}>Total {theme.label.toUpperCase()} {year}</div>
            <div style={{ fontFamily:'var(--font-display)', fontSize:'2rem', lineHeight:1 }}>{formatBRL(totalValue)}</div>
          </div>
          {saved && <span style={{ fontSize:'0.9rem', opacity:0.9, fontWeight:700 }}>✓ Salvo</span>}
        </div>
        <div style={{ overflowX:'auto', borderRadius:'var(--radius-md)', border:`1px solid ${theme.border}`, marginBottom:20 }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8rem' }}>
            <thead>
              <tr>
                <th style={{ background:theme.color, color:'#fff', padding:'7px 14px', textAlign:'left', fontWeight:700, fontSize:'0.7rem', textTransform:'uppercase' }}>Categoria</th>
                {MONTHS_PT.map(m=><th key={m} style={{ background:theme.color, color:'rgba(255,255,255,0.85)', padding:'7px 6px', textAlign:'right', fontSize:'0.68rem', fontWeight:600 }}>{m}</th>)}
                <th style={{ background:theme.color, color:'#fff', padding:'7px 12px', textAlign:'right', fontWeight:700, fontSize:'0.7rem' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map(cat=>(
                <tr key={cat} onClick={()=>setStep(CATEGORIES.indexOf(cat)+1)} style={{ cursor:'pointer', background:theme.light }}>
                  <td style={{ padding:'7px 14px', fontWeight:600, color:theme.text, borderBottom:`1px solid ${theme.border}`, borderLeft:`3px solid ${theme.color}` }}>{cat}</td>
                  {Array.from({length:12},(_,i)=>i+1).map(m=>(
                    <td key={m} style={{ padding:'7px 6px', textAlign:'right', fontVariantNumeric:'tabular-nums', color:getValue(activeType,cat,m)>0?theme.text:'var(--text-muted)', borderBottom:`1px solid ${theme.border}`, fontSize:'0.78rem' }}>{fmtNum(getValue(activeType,cat,m))}</td>
                  ))}
                  <td style={{ padding:'7px 12px', textAlign:'right', fontWeight:700, color:theme.text, borderBottom:`1px solid ${theme.border}`, fontVariantNumeric:'tabular-nums' }}>{fmtNum(getCatTotal(activeType,cat))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <button onClick={()=>setStep(3)} style={{ padding:'9px 20px', borderRadius:'var(--radius-sm)', border:`1.5px solid ${theme.border}`, background:'transparent', cursor:'pointer', color:theme.text, fontWeight:600, fontSize:'0.85rem', fontFamily:'var(--font-body)' }}>← Voltar</button>
          <button onClick={handleSave} disabled={saving} style={{ padding:'12px 32px', borderRadius:'var(--radius-sm)', border:'none', background:theme.color, cursor:saving?'wait':'pointer', color:'#fff', fontWeight:700, fontSize:'0.95rem', fontFamily:'var(--font-body)' }}>{saving?'Salvando...':saved?`✓ ${theme.label} Salvo!`:`💾 Salvar ${theme.label}`}</button>
        </div>
      </div>
    </WrapperWithTypeBar>
    <ImportActualModal open={importOpen} onClose={() => setImportOpen(false)} onApply={handleImportApply} currentYear={year} theme={TYPE_THEME['Actual']||theme} isConsolidated={false} existingData={localData} />
    </>
  );
}