// ── SAP Excel Import Modal ────────────────────────────────────────────────────
import { useState, useEffect, useRef } from 'react';
import api from '../utils/api.js';
import { MONTHS_FULL_PT, formatBRL } from '../utils/format.js';

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

export default function ImportActualModal({ open, onClose, onApply, currentYear, theme, isConsolidated, existingData }) {
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
