import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api.js';
import { useRole } from '../context/AuthContext.jsx';
import { useTypeColors } from '../context/SettingsContext.jsx';


// ── Polo structure ────────────────────────────────────────────────────────────
const POLOS = [
  { id:'paranapanema', name:'Rio Paranapanema', plants:[
    'UHE Jurumirim','UHE Taquaruçu','UHE Rosana','UHE Chavantes',
    'UHE Canoas 1','UHE Canoas 2','PCH Retiro','PCH Palmeiras',
    'UHE Capivara','UHE Salto Grande',
  ]},
  { id:'canoas',  name:'Rio Canoas', plants:['UHE Garibaldi'] },
  { id:'verde',   name:'Rio Verde',  plants:['UHE Salto'] },
  { id:'parana',  name:'Rio Paraná', plants:['UHE Ilha Solteira','UHE Jupiá'] },
];

const COLS = [
  { key:'budget',       label:'Budget',           colorKey:'budget'   },
  { key:'pool',         label:'Pool',              colorKey:'pool'     },
  { key:'actual',       label:'Actual',            colorKey:'actual'   },
  { key:'forecast',     label:'Forecast',          colorKey:'forecast' },
  { key:'act_forecast', label:'ACT + Forecast',    colorKey:'forecast' },
  { key:'variacao',     label:'Variação Previsão', colorKey:null       },
];

function fmtBRL(v) {
  if (v == null || v === 0) return '—';
  const abs = Math.abs(v);
  const fmt = (n, s) => `${v < 0 ? '-' : ''}R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: s, maximumFractionDigits: s })}`;
  if (abs >= 1_000_000) return fmt(abs/1_000_000, 1) + 'M';
  if (abs >= 1_000)     return fmt(abs/1_000, 0) + 'k';
  return fmt(abs, 0);
}

function getVal(row, key) {
  const b = parseFloat(row.budget)||0,  f = parseFloat(row.forecast)||0,
        a = parseFloat(row.actual)||0,   p = parseFloat(row.pool)||0,
        af = parseFloat(row.act_forecast)||0;
  switch(key) {
    case 'budget':       return b;
    case 'pool':         return p;
    case 'actual':       return a;
    case 'forecast':     return f;
    case 'act_forecast': return af;
    case 'variacao':     return b - af;
    default: return 0;
  }
}

function sumRows(rows, key) {
  return rows.reduce((s, r) => s + getVal(r, key), 0);
}

// ── Table cell ────────────────────────────────────────────────────────────────
function TCell({ value, colorKey, C, bold, rowBg }) {
  const isVar = colorKey === null;
  const color = isVar
    ? (value < 0 ? '#DC2626' : value > 0 ? '#15803D' : 'var(--text-muted)')
    : (value === 0 ? 'var(--text-muted)' : (C[colorKey] || 'var(--text-primary)'));
  // Tinted background per column
  const bg = !isVar && C[colorKey] ? C[colorKey] + '10' : 'transparent';

  return (
    <td style={{
      padding:'7px 12px', textAlign:'right', fontVariantNumeric:'tabular-nums',
      color, fontWeight: bold ? 700 : value !== 0 ? 500 : 400,
      fontSize:'0.82rem', borderBottom:'1px solid var(--border)',
      whiteSpace:'nowrap', background: bg,
    }}>
      {value === 0 ? '—' : fmtBRL(value)}
    </td>
  );
}

// ── Row components ─────────────────────────────────────────────────────────────
function PoloRow({ polo, projects, open, onToggle, C }) {
  const rows = POLOS.find(p=>p.id===polo.id)?.plants.flatMap(pl => projects.filter(p=>(p.plants||[]).includes(pl))) || [];
  return (
    <tr style={{ background:'#0F2D6B', cursor:'pointer' }} onClick={onToggle}>
      <td style={{ padding:'10px 16px', color:'#fff', fontWeight:700, fontSize:'0.88rem', whiteSpace:'nowrap',
        position:'sticky', left:0, background:'#0F2D6B', zIndex:1 }}>
        <span style={{ marginRight:8, fontSize:'0.72rem', opacity:0.7 }}>{open?'▼':'▶'}</span>
        {polo.name}
      </td>
      {COLS.map(col => {
        const v = sumRows(rows, col.key);
        return (
          <td key={col.key} style={{
            padding:'10px 12px', textAlign:'right', fontVariantNumeric:'tabular-nums',
            color: col.key==='variacao' ? (v<0?'#FCA5A5':v>0?'#86EFAC':'rgba(255,255,255,0.4)')
                  : v===0 ? 'rgba(255,255,255,0.3)' : '#fff',
            fontWeight:700, fontSize:'0.85rem', whiteSpace:'nowrap',
            background: col.colorKey && v!==0 ? C[col.colorKey]+'30' : 'transparent',
            borderLeft:'1px solid rgba(255,255,255,0.05)',
          }} className={col.key==='variacao'?'polos-col-variacao':''}>{v===0?'—':fmtBRL(v)}</td>
        );
      })}
    </tr>
  );
}

function PlantRow({ name, projects, open, onToggle, C }) {
  return (
    <tr style={{ background:'#EBF3FC', cursor:'pointer' }} onClick={onToggle}>
      <td style={{ padding:'8px 16px 8px 30px', color:'#1E3A5F', fontWeight:600, fontSize:'0.84rem', whiteSpace:'nowrap',
        position:'sticky', left:0, background:'#EBF3FC', zIndex:1 }}>
        <span style={{ marginRight:7, fontSize:'0.68rem', color:'var(--ctg-blue)' }}>{open?'▼':'▶'}</span>
        {name}
      </td>
      {COLS.map(col => {
        const v = sumRows(projects, col.key);
        const color = col.key==='variacao'
          ? (v<0?'#DC2626':v>0?'#15803D':'var(--text-muted)')
          : v===0 ? 'var(--text-muted)' : (C[col.colorKey]||'var(--text-primary)');
        return (
          <td key={col.key} style={{
            padding:'8px 12px', textAlign:'right', fontVariantNumeric:'tabular-nums',
            color, fontWeight:600, fontSize:'0.82rem', whiteSpace:'nowrap',
            background: col.colorKey && v!==0 ? C[col.colorKey]+'14' : '#EBF3FC',
            borderBottom:'1px solid #D4E4F4',
          }}>{v===0?'—':fmtBRL(v)}</td>
        );
      })}
    </tr>
  );
}

function ProjectRow({ project, navigate, isEngenheiro, C }) {
  const canNavigate = !isEngenheiro || project.is_mine;
  return (
    <tr
      style={{
        background:'var(--bg-card)',
        cursor: canNavigate ? 'pointer' : 'default',
        transition:'background 0.1s',
        opacity: isEngenheiro && !project.is_mine ? 0.5 : 1,
      }}
      onClick={() => canNavigate && navigate(`/projects/${project.id}`)}
      onMouseEnter={e => { if(canNavigate) e.currentTarget.style.background='#F0F7FF'; }}
      onMouseLeave={e => { e.currentTarget.style.background='var(--bg-card)'; }}
    >
      <td style={{ padding:'6px 16px 6px 46px', fontSize:'0.8rem', whiteSpace:'nowrap',
        position:'sticky', left:0, background:'inherit', zIndex:1, borderBottom:'1px solid var(--border)' }}>
        <span style={{ color:'var(--ctg-blue)', fontWeight:700, marginRight:5 }}>{project.code}</span>
        <span style={{ color:'var(--text-secondary)' }}>{project.name}</span>
        {canNavigate && <span style={{ marginLeft:5, fontSize:'0.65rem', color:'var(--ctg-blue)', opacity:0.5 }}>↗</span>}
      </td>
      {COLS.map(col => (
        <TCell key={col.key} value={getVal(project, col.key)} colorKey={col.colorKey} C={C} bold={false} />
      ))}
    </tr>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function PolosPage({ period: externalPeriod }) {
  const currentYear = new Date().getFullYear();
  const [projects,  setProjects]  = useState([]);
  // Use period from App.jsx header — no local period state needed
  const period = externalPeriod || { start: currentYear, end: currentYear };
  const [loading,   setLoading]   = useState(true);
  // All polos/plants start collapsed (item 2)
  const [poloOpen,  setPoloOpen]  = useState({});
  const [plantOpen, setPlantOpen] = useState({});
  const navigate = useNavigate();
  const { role, isEngenheiro } = useRole();
  const C = useTypeColors();

  useEffect(() => {
    setLoading(true);
    const params = period.start === period.end
      ? `year=${period.start}`
      : `yearStart=${period.start}&yearEnd=${period.end}`;
    api.get(`/forecast/polo-summary?${params}`)
      .then(r => setProjects(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [period]);

  const togglePolo  = id  => setPoloOpen(prev  => ({ ...prev,  [id]:  !prev[id]  }));
  const togglePlant = key => setPlantOpen(prev => ({ ...prev, [key]: !prev[key] }));

  // Column header bg — tinted
  const colHeaderBg = (colorKey) => colorKey && C[colorKey] ? C[colorKey] + 'CC' : '#475569';

  const allProjects = POLOS.flatMap(polo =>
    polo.plants.flatMap(pl => projects.filter(p => (p.plants||[]).includes(pl)))
  );

  return (
    <div style={{ display:'flex', flexDirection:'column' }}>



      {loading ? (
        <div className="loading-spinner"><div className="spinner"/></div>
      ) : (
        <div className="card" style={{ overflow:'hidden' }}>
          {/* 9. Table with sticky header rows */}
          <div style={{ overflowX:'auto', overflowY:'auto', WebkitOverflowScrolling:'touch' }}>
            <table className="polos-table" style={{ width:'100%', borderCollapse:'collapse', minWidth:820 }}>

              {/* ── Sticky column headers ── */}
              <thead style={{ position:'sticky', top:0, zIndex:20 }}>
                <tr>
                  <th style={{
                    background:'var(--ctg-navy)', color:'#fff', padding:'10px 16px',
                    textAlign:'left', fontWeight:700, fontSize:'0.72rem', textTransform:'uppercase',
                    letterSpacing:'0.08em', position:'sticky', left:0, zIndex:21,
                    minWidth:260, whiteSpace:'nowrap', borderBottom:'2px solid rgba(255,255,255,0.15)',
                  }}>
                    Empresa / Usina / Projeto
                  </th>
                  {COLS.map(col => (
                    <th key={col.key} style={{
                      background: colHeaderBg(col.colorKey),
                      color:'#fff', padding:'10px 12px', textAlign:'right',
                      fontWeight:700, fontSize:'0.72rem', textTransform:'uppercase',
                      letterSpacing:'0.06em', whiteSpace:'nowrap',
                      borderLeft:'1px solid rgba(255,255,255,0.12)',
                      borderBottom:'2px solid rgba(255,255,255,0.15)',
                    }} className={col.key==='variacao'?'polos-col-variacao':''}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {POLOS.map(polo => {
                  const poloProjects = polo.plants.flatMap(pl => projects.filter(p => (p.plants||[]).includes(pl)));
                  if (poloProjects.length === 0) return null;
                  const isPoloOpen = !!poloOpen[polo.id];

                  return [
                    <PoloRow key={`polo-${polo.id}`} polo={polo} projects={poloProjects}
                      open={isPoloOpen} onToggle={() => togglePolo(polo.id)} C={C} />,

                    ...(isPoloOpen ? polo.plants.flatMap(plant => {
                      const plantProjects = projects.filter(p => (p.plants||[]).includes(plant));
                      if (plantProjects.length === 0) return [];
                      const plantKey = `${polo.id}::${plant}`;
                      const isPlantOpen = !!plantOpen[plantKey];

                      return [
                        <PlantRow key={`plant-${plantKey}`} name={plant} projects={plantProjects}
                          open={isPlantOpen} onToggle={() => togglePlant(plantKey)} C={C} />,
                        ...(isPlantOpen ? plantProjects.map(p => (
                          <ProjectRow key={`proj-${p.id}`} project={p} navigate={navigate}
                            isEngenheiro={isEngenheiro} C={C} />
                        )) : []),
                      ];
                    }) : []),
                  ];
                })}

                {/* 3. Total row — light green, translucent */}
                <tr style={{ background:'#D1FAE5' }}>
                  <td style={{
                    padding:'10px 16px', color:'#065F46', fontWeight:800, fontSize:'0.85rem',
                    position:'sticky', left:0, background:'#D1FAE5', zIndex:1,
                    borderTop:'2px solid #6EE7B7',
                  }}>
                    Total Geral
                  </td>
                  {COLS.map(col => {
                    const v = sumRows(allProjects, col.key);
                    const color = col.key==='variacao'
                      ? (v<0?'#DC2626':'#065F46')
                      : (v===0?'#9CA3AF':'#065F46');
                    return (
                      <td key={col.key} style={{
                        padding:'10px 12px', textAlign:'right', fontVariantNumeric:'tabular-nums',
                        color, fontWeight:800, fontSize:'0.88rem', whiteSpace:'nowrap',
                        borderLeft:'1px solid rgba(0,0,0,0.06)', borderTop:'2px solid #6EE7B7',
                        background: col.colorKey ? C[col.colorKey]+'18' : '#D1FAE5',
                      }}>
                        {v===0?'—':fmtBRL(v)}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}