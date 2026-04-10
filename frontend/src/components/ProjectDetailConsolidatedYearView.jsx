// ── Consolidated Year Table + Charts ─────────────────────────────────────────
import { useTypeColors } from '../context/SettingsContext.jsx';
import { formatBRL } from '../utils/format.js';

function getConsolidatedTotal(yearConsData, year) {
  const row = yearConsData.find(e => parseInt(e.year) === year && e.type === 'Actual' && e.category === 'Total');
  if (row) return parseFloat(row.value) || 0;
  // Fallback: sum old per-category format for backwards compatibility
  const oldRows = yearConsData.filter(e => parseInt(e.year) === year && e.type === 'Actual');
  return oldRows.reduce((s, e) => s + (parseFloat(e.value) || 0), 0);
}

export function ConsolidatedYearTable({ yearConsData, year }) {
  const C = useTypeColors();
  const total = getConsolidatedTotal(yearConsData, year);
  const f = v => v ? v.toLocaleString('pt-BR',{minimumFractionDigits:2, maximumFractionDigits:2}) : '—';

  if (!total) {
    return (
      <div style={{textAlign:'center',padding:'40px 20px',color:'var(--text-muted)',fontSize:'0.9rem'}}>
        <p style={{marginBottom:8,fontSize:'1.1rem'}}>📦</p>
        <p>Nenhum valor consolidado registrado para {year}.</p>
        <p style={{fontSize:'0.8rem',marginTop:4}}>Acesse a aba <strong>Forecast</strong> → <strong>{year} consolidado</strong> para inserir o valor.</p>
      </div>
    );
  }

  return (
    <div style={{
      borderRadius:'var(--radius-md)',border:`2px solid ${C.actual}`,overflow:'hidden',maxWidth:400,
    }}>
      <div style={{
        padding:'14px 20px',background:`linear-gradient(135deg, ${C.actual}EE, ${C.actual}BB)`,
        color:'#fff',display:'flex',alignItems:'center',justifyContent:'space-between',
      }}>
        <span style={{fontWeight:700,fontSize:'0.95rem'}}>Realizado Consolidado — {year}</span>
      </div>
      <div style={{padding:'20px',background:C.actual+'12',textAlign:'center'}}>
        <div style={{fontSize:'0.72rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Valor Total Realizado</div>
        <div style={{fontFamily:'var(--font-display)',fontSize:'1.8rem',color:C.actual,fontWeight:700}}>
          R$ {f(total)}
        </div>
      </div>
    </div>
  );
}

export function ConsolidatedYearCharts({ yearConsData, year }) {
  const C = useTypeColors();
  const total = getConsolidatedTotal(yearConsData, year);

  if (!total) {
    return (
      <div style={{textAlign:'center',padding:'40px 20px',color:'var(--text-muted)',fontSize:'0.9rem'}}>
        Nenhum dado consolidado para {year}.
      </div>
    );
  }

  return (
    <div style={{textAlign:'center',padding:'24px',background:'var(--bg-card)',borderRadius:'var(--radius-md)',border:'1px solid var(--border)'}}>
      <div style={{fontSize:'0.72rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>Realizado Consolidado — {year}</div>
      <div style={{fontFamily:'var(--font-display)',fontSize:'2rem',color:C.actual,fontWeight:700}}>
        {formatBRL(total)}
      </div>
    </div>
  );
}
