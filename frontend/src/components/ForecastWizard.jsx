import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../utils/api.js';
import { useTypeColors } from '../context/SettingsContext.jsx';
import { useToast } from './ui/Toast.jsx';
import { MONTHS_FULL_PT, MONTHS_PT, formatBRL } from '../utils/format.js';

const CATEGORIES = ['Viagens', 'Contratos', 'POs'];
const CAT_DESCRIPTIONS = {
  Viagens:   'Despesas com deslocamentos, hospedagem, alimentação e transporte.',
  Contratos: 'Pagamentos previstos a fornecedores contratados — medições, parcelas e marcos.',
  POs:       'Ordens de compra — materiais, equipamentos e serviços pontuais.',
};
const CAT_ICONS = { Viagens: 'VGS', Contratos: 'CTR', POs: 'POs' };

// ── Theme per type ────────────────────────────────────────────────────────────
function getTypeTheme(C) {
  return {
    Budget:   { label:'Budget',    color:C.budget,   light:C.budget+'18',   border:C.budget+'55',   row:C.budget+'28',   text:C.budget },
    Forecast: { label:'Forecast',  color:C.forecast, light:C.forecast+'18', border:C.forecast+'55', row:C.forecast+'28', text:C.forecast },
    Actual:   { label:'Realizado', color:C.actual,   light:C.actual+'18',   border:C.actual+'55',   row:C.actual+'28',   text:C.actual },
    Meta:     { label:'Meta',      color:C.meta,     light:C.meta+'18',     border:C.meta+'55',     row:C.meta+'28',     text:C.meta },
    Pool:     { label:'Pool',      color:C.pool,     light:C.pool+'18',     border:C.pool+'55',     row:C.pool+'28',     text:C.pool },
  };
}
// Static fallback (for non-hook contexts)
const TYPE_THEME = getTypeTheme({ budget:'#15803D', forecast:'#0EA5E9', actual:'#1E40AF', meta:'#7C3AED', pool:'#0891B2' });

const REF_TYPE = { Budget:'Forecast', Forecast:'Budget', Actual:'Forecast', Meta:'Budget', Pool:'Budget' };

function fmtInput(val) {
  if (!val || val === 0) return '';
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function parseInput(str) {
  if (!str) return 0;
  const val = parseFloat(String(str).replace(/\./g,'').replace(',','.')) || 0;
  return Math.max(0, val);
}
function fmtNum(v) {
  return v > 0 ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';
}

// ── Month input row ───────────────────────────────────────────────────────────
function MonthRow({ month, year, value, comment, onChange, refValue, refLabel, theme, otherComments }) {
  const [localVal, setLocalVal]   = useState(fmtInput(value));
  const [localCmt, setLocalCmt]   = useState(comment);
  const didMount                  = useRef(false);

  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    setLocalVal(fmtInput(value));
    setLocalCmt(comment);
  }, [value, comment]);

  const isCurrent = new Date().getMonth() + 1 === month && new Date().getFullYear() === parseInt(year);
  const parsed    = parseInput(localVal);
  const diff      = refValue != null ? parsed - refValue : null;
  const isOver    = diff != null && diff > 0.01;
  const isUnder   = diff != null && diff < -0.01;

  const commitVal = () => { const p = parseInput(localVal); setLocalVal(fmtInput(p)); onChange(month, p, localCmt); };
  const commitCmt = () => onChange(month, parseInput(localVal), localCmt);

  // Filter other comments that actually have content
  const visibleOtherComments = (otherComments || []).filter(c => c.comment && c.comment.trim());

  return (
    <div style={{
      display:'flex', flexDirection:'column',
      borderBottom:`1px solid ${theme.border}`,
      background: isCurrent ? theme.row : 'transparent',
    }}>
      <div style={{
        display:'grid', gridTemplateColumns:'140px 1fr 1fr', gap:12,
        padding:'10px 20px',
      }}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <span style={{fontSize:'0.86rem',fontWeight:600,color:'var(--text-primary)'}}>{MONTHS_FULL_PT[month-1]}</span>
          {isCurrent && (
            <span style={{fontSize:'0.58rem',fontWeight:700,background:theme.color,color:'#fff',padding:'1px 5px',borderRadius:8}}>Atual</span>
          )}
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:3}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontSize:'0.72rem',color:'var(--text-muted)',fontWeight:600,flexShrink:0}}>R$</span>
            <input
              style={{
                flex:1,border:`1.5px solid ${isOver?'#FCA5A5':isUnder?'#BBF7D0':'var(--border-strong)'}`,
                borderRadius:'var(--radius-sm)',padding:'7px 10px',
                fontFamily:'var(--font-body)',fontSize:'0.9rem',
                textAlign:'right',outline:'none',fontVariantNumeric:'tabular-nums',
                background:isOver?'#FEF2F2':'transparent',transition:'border-color 0.15s',
              }}
              type="text" inputMode="decimal" placeholder="0,00"
              value={localVal}
              onChange={e => setLocalVal(e.target.value)}
              onFocus={e => e.target.select()}
              onBlur={commitVal}
              onKeyDown={e => { if (e.key==='Enter') e.target.blur(); }}
            />
            {diff != null && Math.abs(diff) > 0.01 && (
              <span style={{fontSize:'0.68rem',fontWeight:700,flexShrink:0,color:isOver?'#DC2626':'#166534'}}>
                {isOver?'▲':'▼'} {formatBRL(Math.abs(diff))}
              </span>
            )}
          </div>
          {refValue != null && (
            <div style={{fontSize:'0.62rem',color:'var(--text-muted)',textAlign:'right',paddingRight:4}}>
              {refLabel}: {refValue===0?'—':formatBRL(refValue)}
            </div>
          )}
        </div>
        <input
          style={{
            width:'100%',border:`1.5px solid ${theme.border}`,borderRadius:'var(--radius-sm)',
            padding:'7px 10px',fontFamily:'var(--font-body)',fontSize:'0.82rem',
            outline:'none',background:'transparent',color:'var(--text-secondary)',
          }}
          type="text" placeholder="Observação (opcional)..."
          value={localCmt}
          onChange={e => setLocalCmt(e.target.value)}
          onBlur={commitCmt}
          onKeyDown={e => { if (e.key==='Enter') e.target.blur(); }}
        />
      </div>
      {/* Other users' comments for this same month/category (read-only) */}
      {visibleOtherComments.length > 0 && (
        <div style={{ padding:'0 20px 8px', paddingLeft:172, display:'flex', flexDirection:'column', gap:3 }}>
          {visibleOtherComments.map((c, i) => (
            <div key={i} style={{
              display:'flex', alignItems:'baseline', gap:6,
              fontSize:'0.72rem', color:'var(--text-muted)', lineHeight:1.4,
            }}>
              <span style={{
                fontSize:'0.6rem', fontWeight:700, textTransform:'uppercase',
                letterSpacing:'0.04em', color: c.typeColor || '#6B7280',
                background: (c.typeColor || '#6B7280') + '18',
                padding:'1px 5px', borderRadius:4, flexShrink:0, whiteSpace:'nowrap',
              }}>
                {c.typeLabel}
              </span>
              <span style={{ fontStyle:'italic', color:'var(--text-secondary)', wordBreak:'break-word' }}>
                "{c.comment}"
              </span>
              {c.updatedBy && (
                <span style={{ fontSize:'0.6rem', color:'var(--text-muted)', flexShrink:0, whiteSpace:'nowrap' }}>
                  — {c.updatedBy}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Detail table (shown in bottom "Tabela" tab) ───────────────────────────────
// ── Consolidated input row — local state keeps focus & accepts comma ──────────
function ConsInputRow({ cat, value, theme, onChange }) {
  const [localVal, setLocalVal] = useState(value ? fmtInput(value) : '');
  const didMount = useRef(false);

  useEffect(() => {
    if (!didMount.current) { didMount.current = true; return; }
    // Only sync from parent when the parsed numeric value actually changed
    const parentNum = value || 0;
    const localNum  = parseInput(localVal);
    if (Math.abs(parentNum - localNum) > 0.001) {
      setLocalVal(parentNum ? fmtInput(parentNum) : '');
    }
  }, [value]);

  const commit = () => {
    const parsed = parseInput(localVal);
    setLocalVal(parsed ? fmtInput(parsed) : '');
    onChange(parsed);
  };

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12,
      padding: '10px 16px', borderBottom: `1px solid ${theme.border}`,
      alignItems: 'center',
    }}>
      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
        {cat}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>R$</span>
        <input
          type="text"
          inputMode="decimal"
          placeholder="0,00"
          value={localVal}
          onChange={e => setLocalVal(e.target.value)}
          onFocus={e => e.target.select()}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
          style={{
            flex: 1, border: `1.5px solid ${theme.border}`, borderRadius: 'var(--radius-sm)',
            padding: '8px 12px', fontFamily: 'var(--font-body)', fontSize: '0.9rem',
            textAlign: 'right', outline: 'none', background: 'rgba(255,255,255,0.8)', color: theme.text,
            fontWeight: 600, fontVariantNumeric: 'tabular-nums',
          }}
        />
      </div>
    </div>
  );
}

// ── SI Warning ────────────────────────────────────────────────────────────────
function SIWarning({ si, projection }) {
  const over = parseFloat(projection||0) - si;
  if (!si || over <= 0) return null;
  return (
    <div style={{display:'flex',alignItems:'center',gap:8,padding:'8px 20px',background:'#FEF2F2',borderBottom:'1.5px solid #FCA5A5',fontSize:'0.78rem',color:'#991B1B',fontWeight:600}}>
      ⚠ Proje\u00e7\u00e3o (Realizado + Forecast restante) excede a SI ({formatBRL(si)}) em {formatBRL(over)}
    </div>
  );
}

// ── Main ForecastWizard ───────────────────────────────────────────────────────
export default function ForecastWizard({
  projectId, entries, year, onYearChange, onSaved,
  editType = 'Forecast',
  availableTypes,
  siValue = 0,
  consolidatedActual = 0,
  siProjection = 0,
  yearConfig,
}) {
  const C = useTypeColors();
  const TYPE_THEME = getTypeTheme(C);
  const types = availableTypes?.length ? availableTypes : [editType];

  // Year configuration from settings
  const activeStart = yearConfig?.activeStart || 2026;
  const activeEnd   = yearConfig?.activeEnd   || 2031;
  const YEARS = [];
  for (let y = activeStart; y <= activeEnd; y++) YEARS.push(y);

  // Consolidated (past) years = years before activeStart that have data or activeStart-1
  const consolidatedYears = yearConfig?.consolidatedYears || [activeStart - 1];
  const isConsolidatedYear = consolidatedYears.includes(parseInt(year));

  // ── state ──
  const [activeType, setActiveType] = useState(types.includes(editType) ? editType : types[0]);
  const [step,       setStep]       = useState(0);
  const [localData,  setLocalData]  = useState({});
  const [consData,   setConsData]   = useState({}); // consolidated year data: { "type|cat": value }
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const { toast } = useToast();

  const theme = TYPE_THEME[activeType] || TYPE_THEME.Forecast;

  // Reset on year/editType change
  useEffect(() => {
    setLocalData(buildAll(entries, year));
    setStep(0);
    setSaved(false);
  }, [entries, year]);

  // Load consolidated year data when switching to a consolidated year
  useEffect(() => {
    if (!isConsolidatedYear) return;
    api.get(`/forecast/project/${projectId}/year-consolidated?year=${year}`)
      .then(r => {
        const map = {};
        (r.data || []).forEach(e => { map[`${e.type}|${e.category}`] = parseFloat(e.value) || 0; });
        setConsData(map);
      })
      .catch(() => {});
  }, [projectId, year, isConsolidatedYear]);

  useEffect(() => {
    if (types.includes(editType)) setActiveType(editType);
  }, [editType]);

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
    const e  = entries.find(e=>e.category===cat&&e.type===rt&&parseInt(e.year)===parseInt(year)&&parseInt(e.month)===month);
    return e ? parseFloat(e.value) : null;
  }, [entries, year]);

  // Get comments from OTHER types for the same (category, year, month) — read-only cross-visibility
  const getOtherComments = useCallback((currentType, cat, month) => {
    return entries
      .filter(e =>
        e.category === cat &&
        e.type !== currentType &&
        parseInt(e.year) === parseInt(year) &&
        parseInt(e.month) === month &&
        e.comment && e.comment.trim()
      )
      .map(e => {
        const tt = TYPE_THEME[e.type];
        return {
          type: e.type,
          typeLabel: tt?.label || e.type,
          typeColor: tt?.color || '#6B7280',
          comment: e.comment,
          updatedBy: e.updated_by_name || '',
        };
      });
  }, [entries, year]);

  const handleChange = (type, cat, month, value, comment) => {
    setLocalData(prev => ({ ...prev, [`${type}|${cat}|${month}`]: { value, comment } }));
    setSaved(false);
  };

  const getCatTotal  = (type, cat) => Array.from({length:12},(_,i)=>i+1).reduce((s,m)=>s+getValue(type,cat,m),0);
  const getTypeTotal = (type)      => CATEGORIES.reduce((s,c)=>s+getCatTotal(type,c),0);

  const handleSave = async () => {
    setSaving(true);
    try {
      const bulk = [];
      types.forEach(type => CATEGORIES.forEach(cat => {
        for (let m=1; m<=12; m++) bulk.push({
          category:cat, type, year:parseInt(year), month:m,
          value:getValue(type,cat,m), comment:getComment(type,cat,m),
        });
      }));
      await api.post(`/forecast/project/${projectId}/bulk`, { entries: bulk });
      setSaved(true);
      toast('Dados salvos com sucesso!', 'success');
      onSaved?.();
    } catch { toast('Erro ao salvar.', 'error'); }
    finally { setSaving(false); }
  };

  // SI
  const si = parseFloat(siValue)||0;
  const totalForecast = types.includes('Forecast') ? getTypeTotal('Forecast') : entries.filter(e=>e.type==='Forecast').reduce((s,e)=>s+parseFloat(e.value||0),0);
  const totalActual   = types.includes('Actual')   ? getTypeTotal('Actual')   : entries.filter(e=>e.type==='Actual').reduce((s,e)=>s+parseFloat(e.value||0),0);

  const hasData = (type) => CATEGORIES.some(cat => Array.from({length:12},(_,i)=>i+1).some(m => getValue(type,cat,m)>0));

  // ── Consolidated helpers — Actual + Forecast values per consolidated year ──
  const consGetVal = (type = 'Actual') => consData[`${type}|Total`] ?? 0;

  const handleConsChange = (type, val) => {
    setConsData(prev => ({ ...prev, [`${type}|Total`]: val }));
    setSaved(false);
  };

  const handleConsSave = async () => {
    setSaving(true);
    try {
      const entries = [
        { year: parseInt(year), category: 'Total', type: 'Actual', value: consGetVal('Actual') },
        { year: parseInt(year), category: 'Total', type: 'Forecast', value: consGetVal('Forecast') },
      ];
      await api.post(`/forecast/project/${projectId}/year-consolidated/bulk`, { entries });
      setSaved(true);
      toast(`Valores consolidados de ${year} salvos!`, 'success');
      onSaved?.();
    } catch { toast('Erro ao salvar.', 'error'); }
    finally { setSaving(false); }
  };

  // Determine which save to use
  const activeSave = isConsolidatedYear ? handleConsSave : handleSave;

  // ── Block browser navigation while saving ──────────────────────────────────
  useEffect(() => {
    if (!saving) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saving]);

  // ── WRAPPER com barra de tipo no topo ─────────────────────────────────────
  const WrapperWithTypeBar = ({ children }) => (
    <div style={{
      width:'100%', background:theme.light, border:`1.5px solid ${theme.border}`,
      borderRadius:'var(--radius-lg)', overflow:'hidden',
      transition:'background 0.2s, border-color 0.2s',
      position:'relative',
    }}>
      {/* Saving overlay */}
      {saving && (
        <div style={{
          position:'absolute', inset:0, zIndex:50,
          background:'rgba(255,255,255,0.7)', backdropFilter:'blur(2px)',
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          gap:12,
        }}>
          <div style={{
            width:40, height:40, border:`3.5px solid ${theme.border}`,
            borderTopColor: theme.color,
            borderRadius:'50%',
            animation:'spin 0.8s linear infinite',
          }}/>
          <span style={{ fontSize:'0.9rem', fontWeight:700, color: theme.color }}>Salvando dados…</span>
          <span style={{ fontSize:'0.72rem', color:'var(--text-muted)' }}>Não feche a página.</span>
        </div>
      )}
      {/* Row 1: Year tabs */}
      <div className="wizard-year-row" style={{
        display:'flex', alignItems:'stretch',
        background:'var(--ctg-navy)',
        borderBottom:'1px solid rgba(255,255,255,0.1)',
        overflowX:'auto', WebkitOverflowScrolling:'touch',
      }}>
        {/* Consolidated past years */}
        {consolidatedYears.map(y => {
          const isActive = parseInt(year) === y;
          return (
            <button key={y} onClick={() => { onYearChange?.(y, 'consolidated'); setStep(0); }} style={{
              padding:'9px 14px', border:'none', cursor:'pointer',
              background: isActive ? 'rgba(255,200,50,0.2)' : 'transparent',
              color: isActive ? '#FCD34D' : 'rgba(255,255,255,0.35)',
              fontWeight: isActive ? 700 : 400,
              fontSize:'0.82rem', fontFamily:'var(--font-display)',
              borderBottom: isActive ? '3px solid #FCD34D' : '3px solid transparent',
              transition:'all 0.15s', whiteSpace:'nowrap', flexShrink:0,
            }}>
              {y} <span style={{fontSize:'0.58rem',opacity:0.7}}>consolidado</span>
            </button>
          );
        })}
        {/* Separator */}
        {consolidatedYears.length > 0 && (
          <div style={{width:1,background:'rgba(255,255,255,0.15)',margin:'6px 2px',flexShrink:0}} />
        )}
        {/* Active years (monthly detail) */}
        {YEARS.map(y => {
          const isActive = parseInt(year) === y;
          return (
            <button key={y} onClick={() => { onYearChange?.(y); setStep(0); }} style={{
              padding:'9px 18px', border:'none', cursor:'pointer',
              background: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
              color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
              fontWeight: isActive ? 700 : 400,
              fontSize:'0.88rem', fontFamily:'var(--font-display)',
              borderBottom: isActive ? '3px solid #fff' : '3px solid transparent',
              transition:'all 0.15s', whiteSpace:'nowrap', flexShrink:0,
            }}>{y}</button>
          );
        })}
      </div>

      {/* Row 2: Type tabs + totals + save */}
      {/* For consolidated years: single "Realizado Consolidado" header, no type tabs */}
      {isConsolidatedYear ? (
        <div className="wizard-type-row" style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          background:`linear-gradient(135deg, var(--ctg-navy), #0F3460)`,
          padding:'10px 20px',
        }}>
          <span style={{color:'#fff',fontWeight:700,fontSize:'0.9rem'}}>📦 {year} — Consolidado</span>
          <div style={{display:'flex',alignItems:'center',gap:18}}>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:'0.56rem',fontWeight:700,color:'rgba(255,255,255,0.55)',textTransform:'uppercase',letterSpacing:'0.08em'}}>Realizado</div>
              <div style={{fontFamily:'var(--font-display)',fontSize:'1rem',color:'#fff',fontWeight:600}}>{formatBRL(consGetVal('Actual'))}</div>
            </div>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:'0.56rem',fontWeight:700,color:'rgba(255,255,255,0.55)',textTransform:'uppercase',letterSpacing:'0.08em'}}>Forecast</div>
              <div style={{fontFamily:'var(--font-display)',fontSize:'1rem',color:'#fff',fontWeight:600}}>{formatBRL(consGetVal('Forecast'))}</div>
            </div>
            <button onClick={activeSave} disabled={saving} style={{
              padding:'8px 22px', border:'none', cursor:saving?'wait':'pointer',
              background:saved?'rgba(255,255,255,0.22)':'rgba(255,255,255,0.12)',
              color:'#fff', fontWeight:700, fontSize:'0.82rem', fontFamily:'var(--font-body)',
              borderRadius:'var(--radius-sm)', whiteSpace:'nowrap', transition:'background 0.15s',
            }}
            onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.28)'}
            onMouseLeave={e=>e.currentTarget.style.background=saved?'rgba(255,255,255,0.22)':'rgba(255,255,255,0.12)'}
            >{saving?'Salvando...':saved?'✓ Salvo':'💾 Salvar'}</button>
          </div>
        </div>
      ) : (
      <div className="wizard-type-row" style={{
        display:'flex', alignItems:'stretch',
        background:`linear-gradient(135deg, ${theme.color}EE, ${theme.color}BB)`,
        flexWrap:'wrap',
      }}>
        {types.map(t => {
          const th = TYPE_THEME[t], isActive = activeType===t;
          return (
            <button key={t} onClick={()=>{ setActiveType(t); setStep(0); }} style={{
              padding:'10px 20px', border:'none', cursor:'pointer',
              background: isActive?'rgba(255,255,255,0.2)':'transparent',
              color: isActive?'#fff':'rgba(255,255,255,0.6)',
              fontWeight: isActive?700:500, fontSize:'0.86rem',
              fontFamily:'var(--font-body)',
              borderBottom: isActive?'3px solid #fff':'3px solid transparent',
              transition:'all 0.15s', display:'flex', flexDirection:'column', alignItems:'center', gap:1,
            }}>
              <span>{th.label}</span>
              {hasData(t) && <span style={{fontSize:'0.55rem',color:isActive?'rgba(255,255,255,0.8)':'rgba(255,255,255,0.5)'}}>✓ preenchido</span>}
            </button>
          );
        })}
        {/* Totals + Save */}
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:0}}>
          <div className="wizard-totals-bar" style={{display:'flex',alignItems:'center',gap:18,padding:'0 20px',flexWrap:'wrap'}}>
            {CATEGORIES.map(cat => (
              <div key={cat} style={{textAlign:'center'}}>
                <div className="wizard-cat-label" style={{fontSize:'0.56rem',fontWeight:700,color:'rgba(255,255,255,0.55)',textTransform:'uppercase',letterSpacing:'0.08em'}}>{cat}</div>
                <div className="wizard-cat-value" style={{fontFamily:'var(--font-display)',fontSize:'0.9rem',color:'#fff'}}>{formatBRL(isConsolidatedYear ? consGetVal(activeType) : getCatTotal(activeType,cat))}</div>
              </div>
            ))}
            <div style={{borderLeft:'1px solid rgba(255,255,255,0.25)',paddingLeft:16,textAlign:'center'}}>
              <div style={{fontSize:'0.56rem',fontWeight:700,color:'rgba(255,255,255,0.55)',textTransform:'uppercase',letterSpacing:'0.08em'}}>Total</div>
              <div style={{fontFamily:'var(--font-display)',fontSize:'1rem',color:'#fff',fontWeight:600}}>{formatBRL(isConsolidatedYear ? consGetVal(activeType) : getTypeTotal(activeType))}</div>
            </div>
          </div>
          <button onClick={activeSave} disabled={saving} style={{
            padding:'0 22px', alignSelf:'stretch', border:'none', cursor:saving?'wait':'pointer',
            background:saved?'rgba(255,255,255,0.22)':'rgba(255,255,255,0.12)',
            color:'#fff', fontWeight:700, fontSize:'0.82rem', fontFamily:'var(--font-body)',
            borderLeft:'1px solid rgba(255,255,255,0.2)', whiteSpace:'nowrap',
            transition:'background 0.15s',
          }}
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

  // ── CONSOLIDATED YEAR: Actual + Forecast inputs ────────────────────────────
  if (isConsolidatedYear) {
    const thActual   = TYPE_THEME['Actual'];
    const thForecast = TYPE_THEME['Forecast'];
    return (
      <WrapperWithTypeBar>
        <div style={{ padding: '24px 28px', background: 'rgba(255,255,255,0.65)' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 'var(--radius-md)',
              background: '#FEF3C7', border: '2px solid #F59E0B',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.2rem', flexShrink: 0,
            }}>📦</div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--ctg-navy)', marginBottom: 2 }}>
                {year} — Valores Consolidados
              </h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Ano encerrado — insira os valores totais consolidados do ano (sem detalhamento mensal por categoria).
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Realizado Consolidado */}
            <div style={{ borderRadius: 'var(--radius-md)', border: `1.5px solid ${thActual.border}`, overflow: 'hidden' }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 18px', background: `linear-gradient(135deg, ${thActual.color}EE, ${thActual.color}BB)`,
                color: '#fff',
              }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Realizado Total</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem' }}>
                  {formatBRL(consGetVal('Actual'))}
                </span>
              </div>
              <div style={{ padding: '16px 18px', background: thActual.light }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
                  Valor total realizado em {year} (R$)
                </label>
                <ConsInputRow
                  cat="Realizado"
                  value={consGetVal('Actual')}
                  theme={thActual}
                  onChange={(val) => handleConsChange('Actual', val)}
                />
              </div>
            </div>

            {/* Forecast Consolidado */}
            <div style={{ borderRadius: 'var(--radius-md)', border: `1.5px solid ${thForecast.border}`, overflow: 'hidden' }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 18px', background: `linear-gradient(135deg, ${thForecast.color}EE, ${thForecast.color}BB)`,
                color: '#fff',
              }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Forecast Total</span>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem' }}>
                  {formatBRL(consGetVal('Forecast'))}
                </span>
              </div>
              <div style={{ padding: '16px 18px', background: thForecast.light }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
                  Valor total do forecast em {year} (R$)
                </label>
                <ConsInputRow
                  cat="Forecast"
                  value={consGetVal('Forecast')}
                  theme={thForecast}
                  onChange={(val) => handleConsChange('Forecast', val)}
                />
              </div>
            </div>
          </div>
        </div>
      </WrapperWithTypeBar>
    );
  }

  // ── STEP 0: Intro ─────────────────────────────────────────────────────────
  if (step === 0) {
    const hasExisting = types.some(t => hasData(t));
    return (
      <WrapperWithTypeBar>
        <div style={{padding:'36px 40px',textAlign:'center',background:'rgba(255,255,255,0.6)'}}>
          <h2 style={{fontFamily:'var(--font-display)',fontSize:'1.7rem',color:'var(--ctg-navy)',marginBottom:10}}>
            {hasExisting ? `Editar ${theme.label} ${year}` : `Preenchimento do ${theme.label} ${year}`}
          </h2>
          <p style={{fontSize:'0.9rem',color:'var(--text-secondary)',lineHeight:1.7,marginBottom:28,maxWidth:500,margin:'0 auto 24px'}}>
            {hasExisting
              ? 'Seus valores já salvos estão carregados. Altere o que precisar e salve.'
              : `Preencha o ${theme.label} mês a mês para cada categoria de custo do projeto.`}
          </p>

          {/* Glossary */}
          <div style={{background:'rgba(255,255,255,0.7)',borderRadius:'var(--radius-lg)',padding:'16px 20px',marginBottom:28,textAlign:'left',maxWidth:560,margin:'0 auto 24px',border:`1px solid ${theme.border}`}}>
            <div style={{display:'flex',alignItems:'flex-start',gap:12,marginBottom:10}}>
              <span style={{background:theme.light,color:theme.text,border:`1px solid ${theme.border}`,padding:'3px 10px',borderRadius:12,fontSize:'0.75rem',fontWeight:700,flexShrink:0}}>{theme.label}</span>
              <span style={{fontSize:'0.83rem',color:'var(--text-secondary)'}}>{TYPE_THEME[activeType]?.description || ''}</span>
            </div>
            {REF_TYPE[activeType] && (
              <div style={{display:'flex',alignItems:'flex-start',gap:12,paddingTop:10,borderTop:`1px solid ${theme.border}`}}>
                <span style={{background:TYPE_THEME[REF_TYPE[activeType]]?.light,color:TYPE_THEME[REF_TYPE[activeType]]?.text,border:`1px solid ${TYPE_THEME[REF_TYPE[activeType]]?.border}`,padding:'3px 10px',borderRadius:12,fontSize:'0.75rem',fontWeight:700,flexShrink:0,whiteSpace:'nowrap'}}>
                  {TYPE_THEME[REF_TYPE[activeType]]?.label} — ref.
                </span>
                <span style={{fontSize:'0.83rem',color:'var(--text-secondary)'}}>Exibido como referência em cada linha para facilitar o preenchimento.</span>
              </div>
            )}
          </div>

          {/* Category preview with totals */}
          {hasExisting && (
            <div style={{display:'flex',gap:12,justifyContent:'center',marginBottom:28,flexWrap:'wrap'}}>
              {CATEGORIES.map((cat,i) => {
                const total = getCatTotal(activeType, cat);
                return (
                  <div key={cat} onClick={()=>setStep(i+1)} style={{
                    padding:'14px 20px', borderRadius:'var(--radius-md)', cursor:'pointer',
                    background: total>0 ? theme.row : 'rgba(255,255,255,0.5)',
                    border: `2px solid ${total>0 ? theme.color : theme.border}`,
                    minWidth:140, textAlign:'center', transition:'all 0.15s',
                  }}>
                    <div style={{fontSize:'0.65rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:theme.text,marginBottom:4}}>{cat}</div>
                    <div style={{fontFamily:'var(--font-display)',fontSize:'1.1rem',color:total>0?theme.color:'var(--text-muted)'}}>{total>0?formatBRL(total):'—'}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Steps preview */}
          <div style={{display:'flex',gap:8,justifyContent:'center',marginBottom:28,flexWrap:'wrap'}}>
            {CATEGORIES.map((cat,i)=>(
              <div key={cat} onClick={()=>setStep(i+1)} style={{
                padding:'10px 16px',borderRadius:'var(--radius-md)',cursor:'pointer',
                background: getCatTotal(activeType,cat)>0 ? theme.color : 'rgba(255,255,255,0.6)',
                border:`1px solid ${theme.border}`,
                display:'flex',flexDirection:'column',alignItems:'center',gap:3,
                transition:'all 0.15s', minWidth:100,
              }}>
                <div style={{width:26,height:26,borderRadius:'50%',background: getCatTotal(activeType,cat)>0?'rgba(255,255,255,0.25)':theme.light,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.8rem',fontWeight:700,color:getCatTotal(activeType,cat)>0?'#fff':theme.color}}>
                  {getCatTotal(activeType,cat)>0?'✓':i+1}
                </div>
                <span style={{fontSize:'0.78rem',fontWeight:600,color:getCatTotal(activeType,cat)>0?'#fff':theme.text}}>{cat}</span>
              </div>
            ))}
            <div onClick={()=>setStep(4)} style={{
              padding:'10px 16px',borderRadius:'var(--radius-md)',cursor:'pointer',
              background:'rgba(255,255,255,0.6)',border:`1px solid ${theme.border}`,
              display:'flex',flexDirection:'column',alignItems:'center',gap:3,minWidth:100,
            }}>
              <div style={{width:26,height:26,borderRadius:'50%',background:theme.light,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.8rem',fontWeight:700,color:theme.color}}>4</div>
              <span style={{fontSize:'0.78rem',fontWeight:600,color:theme.text}}>Revisão</span>
            </div>
          </div>

          <button style={{
            padding:'13px 36px',borderRadius:'var(--radius-md)',border:'none',cursor:'pointer',
            background:theme.color,color:'#fff',fontWeight:700,fontSize:'1rem',
            fontFamily:'var(--font-body)',transition:'opacity 0.15s',
          }}
          onClick={()=>setStep(1)}
          onMouseEnter={e=>e.currentTarget.style.opacity='0.88'}
          onMouseLeave={e=>e.currentTarget.style.opacity='1'}
          >
            {hasExisting ? `Editar ${theme.label} →` : `Iniciar preenchimento →`}
          </button>
        </div>
      </WrapperWithTypeBar>
    );
  }

  // ── STEPS 1-3: Category input ──────────────────────────────────────────────
  if (step >= 1 && step <= 3) {
    const cat         = CATEGORIES[step-1];
    const catTotal    = getCatTotal(activeType, cat);
    const refTotalCat = Array.from({length:12},(_,i)=>i+1).reduce((s,m)=>s+(getRef(activeType,cat,m)??0),0);
    const diff        = catTotal - refTotalCat;

    return (
      <WrapperWithTypeBar>
        {/* Progress bar */}
        <div style={{display:'flex',alignItems:'center',padding:'14px 20px',background:'rgba(255,255,255,0.5)',borderBottom:`1px solid ${theme.border}`,gap:8,flexWrap:'wrap'}}>
          {[1,2,3,4].map(s=>{
            const done = s < step, active = s === step;
            const label = s<=3 ? CATEGORIES[s-1] : 'Revisão';
            return (
              <div key={s} onClick={()=>setStep(s)} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',opacity:done||active?1:0.45}}>
                <div style={{
                  width:26,height:26,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
                  background: done?theme.color : active?theme.color:'var(--bg-app)',
                  color: done||active?'#fff':theme.text,
                  fontWeight:700,fontSize:'0.78rem',border:`2px solid ${done||active?theme.color:theme.border}`,
                  flexShrink:0,
                }}>
                  {done?'✓':s}
                </div>
                <span style={{fontSize:'0.82rem',fontWeight:active?700:500,color:active?theme.color:'var(--text-secondary)'}}>{label}</span>
                {s<4 && <span style={{color:'var(--text-muted)',fontSize:'0.8rem',marginRight:4}}>›</span>}
              </div>
            );
          })}
        </div>

        {/* Category header */}
        <div style={{
          display:'flex',alignItems:'flex-start',gap:14,padding:'16px 20px',
          background:`${theme.color}10`,borderBottom:`1px solid ${theme.border}`,
          flexWrap:'wrap',
        }}>
          <div style={{
            width:42,height:42,borderRadius:'var(--radius-sm)',background:theme.light,
            border:`2px solid ${theme.color}`,display:'flex',alignItems:'center',justifyContent:'center',
            fontSize:'0.65rem',fontWeight:800,color:theme.color,flexShrink:0,
          }}>{CAT_ICONS[cat]}</div>
          <div style={{flex:1}}>
            <h2 style={{fontFamily:'var(--font-display)',fontSize:'1.2rem',color:'var(--ctg-navy)',marginBottom:2}}>{cat}</h2>
            <p style={{fontSize:'0.8rem',color:'var(--text-secondary)',lineHeight:1.5}}>{CAT_DESCRIPTIONS[cat]}</p>
          </div>
          <div style={{textAlign:'right',flexShrink:0}}>
            <div style={{fontSize:'0.62rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:theme.text,marginBottom:2}}>Total {year}</div>
            <div style={{fontFamily:'var(--font-display)',fontSize:'1.3rem',color:theme.color}}>{formatBRL(catTotal)}</div>
            {refTotalCat>0 && (
              <div style={{fontSize:'0.68rem',color:diff>0?'#DC2626':diff<0?'#166534':'var(--text-muted)',fontWeight:600}}>
                {diff===0?`= ${TYPE_THEME[REF_TYPE[activeType]]?.label}`:diff>0?`▲ ${formatBRL(Math.abs(diff))} acima`:`▼ ${formatBRL(Math.abs(diff))} abaixo`}
              </div>
            )}
          </div>
        </div>

        {/* Month rows header */}
        <div style={{
          display:'grid',gridTemplateColumns:'140px 1fr 1fr',gap:12,padding:'8px 20px',
          background:`${theme.color}12`,borderBottom:`1px solid ${theme.border}`,
          fontSize:'0.68rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:theme.color,
        }}>
          <span>Mês</span>
          <span>Valor {theme.label} (R$)</span>
          <span>Observação</span>
        </div>

        {/* Month rows */}
        <div style={{background:'rgba(255,255,255,0.65)'}}>
          {Array.from({length:12},(_,i)=>i+1).map(month=>(
            <MonthRow
              key={`${activeType}|${cat}|${month}|${year}|${getValue(activeType,cat,month)}`}
              month={month} year={year}
              value={getValue(activeType,cat,month)}
              comment={getComment(activeType,cat,month)}
              refValue={getRef(activeType,cat,month)}
              refLabel={`Ref. ${TYPE_THEME[REF_TYPE[activeType]]?.label||''}`}
              theme={theme}
              onChange={(m,v,c)=>handleChange(activeType,cat,m,v,c)}
              otherComments={getOtherComments(activeType,cat,month)}
            />
          ))}
        </div>

        {/* Navigation */}
        <div style={{display:'flex',justifyContent:'space-between',padding:'12px 20px',background:'rgba(255,255,255,0.5)',borderTop:`1px solid ${theme.border}`}}>
          <button onClick={()=>setStep(s=>s-1)} style={{
            padding:'9px 20px',borderRadius:'var(--radius-sm)',border:`1.5px solid ${theme.border}`,
            background:'transparent',cursor:'pointer',color:theme.text,fontWeight:600,fontSize:'0.85rem',fontFamily:'var(--font-body)',
          }}>
            ← {step===1?'Início':CATEGORIES[step-2]}
          </button>
          <button onClick={()=>setStep(s=>s+1)} style={{
            padding:'9px 24px',borderRadius:'var(--radius-sm)',border:'none',
            background:theme.color,cursor:'pointer',color:'#fff',fontWeight:700,fontSize:'0.85rem',fontFamily:'var(--font-body)',
          }}>
            {step===3?'Revisar →':`${CATEGORIES[step]} →`}
          </button>
        </div>

      </WrapperWithTypeBar>
    );
  }

  // ── STEP 4: Revisão ───────────────────────────────────────────────────────
  const totalValue = getTypeTotal(activeType);
  return (
    <WrapperWithTypeBar>
      {/* Progress */}
      <div style={{display:'flex',alignItems:'center',padding:'14px 20px',background:'rgba(255,255,255,0.5)',borderBottom:`1px solid ${theme.border}`,gap:8,flexWrap:'wrap'}}>
        {[1,2,3,4].map(s=>{
          const done = s < 4, active = s === 4;
          const label = s<=3 ? CATEGORIES[s-1] : 'Revisão';
          return (
            <div key={s} onClick={()=>setStep(s)} style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}>
              <div style={{
                width:26,height:26,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',
                background: done?theme.color:active?theme.color:'var(--bg-app)',
                color:'#fff',fontWeight:700,fontSize:'0.78rem',border:`2px solid ${theme.color}`,flexShrink:0,
              }}>{done?'✓':s}</div>
              <span style={{fontSize:'0.82rem',fontWeight:active?700:500,color:active?theme.color:'var(--text-secondary)'}}>{label}</span>
              {s<4 && <span style={{color:'var(--text-muted)',fontSize:'0.8rem',marginRight:4}}>›</span>}
            </div>
          );
        })}
      </div>

      <div style={{padding:'24px 28px',background:'rgba(255,255,255,0.65)'}}>
        <h2 style={{fontFamily:'var(--font-display)',fontSize:'1.4rem',color:'var(--ctg-navy)',marginBottom:4}}>
          Revisão do {theme.label} {year}
        </h2>
        <p style={{color:'var(--text-muted)',fontSize:'0.85rem',marginBottom:20}}>
          Confira os totais antes de salvar. Clique em uma categoria para voltar e editar.
        </p>

        {/* Category cards */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:12,marginBottom:22}}>
          {CATEGORIES.map(cat=>{
            const total = getCatTotal(activeType,cat);
            const refT  = Array.from({length:12},(_,i)=>i+1).reduce((s,m)=>s+(getRef(activeType,cat,m)??0),0);
            return (
              <div key={cat} onClick={()=>setStep(CATEGORIES.indexOf(cat)+1)} style={{
                padding:'14px 16px',borderRadius:'var(--radius-md)',cursor:'pointer',
                background: total>0?theme.row:theme.light,
                border:`1.5px solid ${total>0?theme.color:theme.border}`,
                display:'flex',alignItems:'center',gap:12,transition:'all 0.15s',
              }}>
                <div style={{
                  width:36,height:36,borderRadius:'var(--radius-sm)',background:theme.light,
                  border:`2px solid ${theme.color}`,display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:'0.6rem',fontWeight:800,color:theme.color,flexShrink:0,
                }}>{CAT_ICONS[cat]}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:'0.72rem',fontWeight:700,color:theme.text,marginBottom:2}}>{cat}</div>
                  <div style={{fontFamily:'var(--font-display)',fontSize:'1rem',color:total>0?theme.color:'var(--text-muted)'}}>{formatBRL(total)}</div>
                  {refT>0 && <div style={{fontSize:'0.62rem',color:'var(--text-muted)'}}>{TYPE_THEME[REF_TYPE[activeType]]?.label}: {formatBRL(refT)}</div>}
                </div>
                <span style={{color:theme.color,opacity:0.5,fontSize:'0.8rem'}}>✎</span>
              </div>
            );
          })}
        </div>

        {/* Grand total banner */}
        <div style={{
          background:`linear-gradient(135deg, ${theme.color}, ${theme.color}CC)`,
          borderRadius:'var(--radius-md)',padding:'16px 22px',
          display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,color:'#fff',
        }}>
          <div>
            <div style={{fontSize:'0.72rem',opacity:0.75,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em'}}>Total {theme.label.toUpperCase()} {year}</div>
            <div style={{fontFamily:'var(--font-display)',fontSize:'2rem',lineHeight:1}}>{formatBRL(totalValue)}</div>
          </div>
          {saved && <span style={{fontSize:'0.9rem',opacity:0.9,fontWeight:700}}>✓ Salvo</span>}
        </div>

        {/* Summary table in review */}
        <div style={{overflowX:'auto',borderRadius:'var(--radius-md)',border:`1px solid ${theme.border}`,marginBottom:20}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.8rem'}}>
            <thead>
              <tr>
                <th style={{background:theme.color,color:'#fff',padding:'7px 14px',textAlign:'left',fontWeight:700,fontSize:'0.7rem',textTransform:'uppercase'}}>Categoria</th>
                {MONTHS_PT.map(m=><th key={m} style={{background:theme.color,color:'rgba(255,255,255,0.85)',padding:'7px 6px',textAlign:'right',fontSize:'0.68rem',fontWeight:600}}>{m}</th>)}
                <th style={{background:theme.color,color:'#fff',padding:'7px 12px',textAlign:'right',fontWeight:700,fontSize:'0.7rem'}}>Total</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map(cat=>(
                <tr key={cat} onClick={()=>setStep(CATEGORIES.indexOf(cat)+1)} style={{cursor:'pointer',background:theme.light}}>
                  <td style={{padding:'7px 14px',fontWeight:600,color:theme.text,borderBottom:`1px solid ${theme.border}`,borderLeft:`3px solid ${theme.color}`}}>
                    {cat}
                  </td>
                  {Array.from({length:12},(_,i)=>i+1).map(m=>(
                    <td key={m} style={{padding:'7px 6px',textAlign:'right',fontVariantNumeric:'tabular-nums',color:getValue(activeType,cat,m)>0?theme.text:'var(--text-muted)',borderBottom:`1px solid ${theme.border}`,fontSize:'0.78rem'}}>
                      {fmtNum(getValue(activeType,cat,m))}
                    </td>
                  ))}
                  <td style={{padding:'7px 12px',textAlign:'right',fontWeight:700,color:theme.text,borderBottom:`1px solid ${theme.border}`,fontVariantNumeric:'tabular-nums'}}>
                    {fmtNum(getCatTotal(activeType,cat))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Nav */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <button onClick={()=>setStep(3)} style={{
            padding:'9px 20px',borderRadius:'var(--radius-sm)',border:`1.5px solid ${theme.border}`,
            background:'transparent',cursor:'pointer',color:theme.text,fontWeight:600,fontSize:'0.85rem',fontFamily:'var(--font-body)',
          }}>← Voltar</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding:'12px 32px',borderRadius:'var(--radius-sm)',border:'none',
            background:theme.color,cursor:saving?'wait':'pointer',color:'#fff',fontWeight:700,fontSize:'0.95rem',fontFamily:'var(--font-body)',
          }}>
            {saving?'Salvando...':saved?`✓ ${theme.label} Salvo!`:`💾 Salvar ${theme.label}`}
          </button>
        </div>
      </div>

    </WrapperWithTypeBar>
  );
}