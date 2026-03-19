import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../utils/api.js';
import { useToast } from './ui/Toast.jsx';
import { MONTHS_FULL_PT, formatBRL } from '../utils/format.js';

const CATEGORIES = ['Viagens', 'Contratos', 'POs'];
const CAT_DESCRIPTIONS = {
  Viagens:   'Despesas com deslocamentos, hospedagem, alimentação e transporte relacionados ao projeto.',
  Contratos: 'Pagamentos previstos a fornecedores contratados — medições, parcelas e marcos contratuais.',
  POs:       'Ordens de compra (Purchase Orders) — materiais, equipamentos e serviços pontuais.',
};
const CAT_ICONS = { Viagens: 'VGS', Contratos: 'CTR', POs: 'POs' };

// Config by editType
const TYPE_CONFIG = {
  Forecast: {
    label:       'Forecast',
    labelFull:   'Forecast',
    badgeCls:    'forecast',
    color:       '#15803D',
    bgColor:     'var(--forecast-bg)',
    borderColor: 'var(--forecast-border)',
    description: 'Sua previsão atualizada de desembolso. Isso que você preenche.',
    intro:       'Você irá preencher o Forecast — sua previsão de desembolso mês a mês — para cada categoria de custo do projeto.',
    editIntro:   'Seus valores já salvos estão carregados em cada campo. Altere apenas o que precisar e salve ao final.',
    startBtn:    'Iniciar preenchimento',
    editBtn:     'Editar valores',
  },
  Budget: {
    label:       'Budget',
    labelFull:   'Budget',
    badgeCls:    'budget',
    color:       '#1E40AF',
    bgColor:     'var(--budget-bg)',
    borderColor: 'var(--budget-border)',
    description: 'Valor planejado aprovado para o projeto. Você define o orçamento base.',
    intro:       'Você irá preencher o Budget — o valor de orçamento aprovado — mês a mês para cada categoria de custo do projeto.',
    editIntro:   'Seus valores de Budget já salvos estão carregados. Altere apenas o que precisar e salve ao final.',
    startBtn:    'Iniciar preenchimento do Budget',
    editBtn:     'Editar Budget',
  },
};

function buildMap(entries, year, type) {
  const map = {};
  for (const e of entries) {
    if (parseInt(e.year) === parseInt(year) && e.type === type) {
      map[`${e.category}|${e.month}`] = {
        value:   parseFloat(e.value) || 0,
        comment: e.comment || '',
      };
    }
  }
  return map;
}

function fmtInput(val) {
  if (!val || val === 0) return '';
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseInput(str) {
  if (!str) return 0;
  return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
}

// ── MonthRow ─────────────────────────────────────────────────────────────────
function MonthRow({ month, year, value, comment, onChange, refValue, refLabel }) {
  const [localVal,     setLocalVal]     = useState(fmtInput(value));
  const [localComment, setLocalComment] = useState(comment);
  const didMountRef = useRef(false);

  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    setLocalVal(fmtInput(value));
    setLocalComment(comment);
  }, [value, comment]);

  const isCurrentMonth =
    new Date().getMonth() + 1 === month &&
    new Date().getFullYear() === parseInt(year);

  const handleValueBlur = () => {
    const parsed = parseInput(localVal);
    setLocalVal(fmtInput(parsed));
    onChange(month, parsed, localComment);
  };

  const handleCommentBlur = () => onChange(month, parseInput(localVal), localComment);

  const diff = refValue != null ? parseInput(localVal) - refValue : null;

  return (
    <div className={`wizard-month-row ${isCurrentMonth ? 'current-month' : ''}`}>
      <div className="wmr-month">
        <span className="wmr-month-name">{MONTHS_FULL_PT[month - 1]}</span>
        {isCurrentMonth && <span className="wmr-badge">Mês atual</span>}
      </div>
      <div className="wmr-fields">
        <div className="wmr-value-wrap">
          <span className="wmr-prefix">R$</span>
          <input
            className="wmr-input"
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={localVal}
            onChange={e => setLocalVal(e.target.value)}
            onFocus={e => e.target.select()}
            onBlur={handleValueBlur}
            onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
          />
          {diff != null && Math.abs(diff) > 0.01 && (
            <span className={`wmr-diff ${diff > 0 ? 'over' : 'under'}`}>
              {diff > 0 ? '▲' : '▼'} {formatBRL(Math.abs(diff))}
            </span>
          )}
        </div>
        {refValue != null && (
          <div className="wmr-budget-ref">
            {refLabel}: {refValue === 0 ? '—' : formatBRL(refValue)}
          </div>
        )}
      </div>
      <div className="wmr-comment">
        <input
          className="wmr-comment-input"
          type="text"
          placeholder="Justificativa / observação (opcional)..."
          value={localComment}
          onChange={e => setLocalComment(e.target.value)}
          onBlur={handleCommentBlur}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
        />
      </div>
    </div>
  );
}

// ── ForecastWizard ────────────────────────────────────────────────────────────
// editType: 'Forecast' (engenheiro) | 'Budget' (planejador)
export default function ForecastWizard({ projectId, entries, year, onSaved, editType = 'Forecast' }) {
  const [step,      setStep]      = useState(0);
  const [localData, setLocalData] = useState({});
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const { toast } = useToast();

  const cfg = TYPE_CONFIG[editType];

  // The "reference" type shown alongside — Budget shows Forecast as ref, and vice versa
  const refType  = editType === 'Forecast' ? 'Budget' : 'Forecast';
  const refLabel = editType === 'Forecast' ? 'Budget' : 'Forecast atual';

  useEffect(() => {
    setLocalData(buildMap(entries, year, editType));
    setStep(0);
    setSaved(false);
  }, [entries, year, editType]);

  const getRef = useCallback((cat, month) => {
    const e = entries.find(e =>
      e.category === cat && e.type === refType &&
      parseInt(e.year) === parseInt(year) && parseInt(e.month) === month
    );
    return e ? parseFloat(e.value) : null;
  }, [entries, year, refType]);

  const getValue   = (cat, month) => localData[`${cat}|${month}`]?.value   ?? 0;
  const getComment = (cat, month) => localData[`${cat}|${month}`]?.comment ?? '';

  const handleChange = (cat, month, value, comment) => {
    setLocalData(prev => ({ ...prev, [`${cat}|${month}`]: { value, comment } }));
    setSaved(false);
  };

  const getCatTotal = (cat) =>
    Array.from({ length: 12 }, (_, i) => getValue(cat, i + 1)).reduce((s, v) => s + v, 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      const bulk = CATEGORIES.flatMap(cat =>
        Array.from({ length: 12 }, (_, i) => i + 1).map(m => ({
          category: cat,
          type:     editType,
          year:     parseInt(year),
          month:    m,
          value:    getValue(cat, m),
          comment:  getComment(cat, m),
        }))
      );
      await api.post(`/forecast/project/${projectId}/bulk`, { entries: bulk });
      setSaved(true);
      toast(`${cfg.label} salvo com sucesso!`, 'success');
      onSaved?.();
    } catch {
      toast('Erro ao salvar. Tente novamente.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const totalValue = CATEGORIES.reduce((s, c) => s + getCatTotal(c), 0);

  // ── STEP 0: Intro ──────────────────────────────────────────────────────────
  if (step === 0) {
    const hasExistingData = Object.values(localData).some(d => d.value > 0);
    return (
      <div className="wizard-container">
        <div className="wizard-intro">
          <h2 className="wizard-intro-title">
            {hasExistingData ? `Editar ${cfg.label} ${year}` : `Preenchimento do ${cfg.label} ${year}`}
          </h2>
          <p className="wizard-intro-text">
            {hasExistingData ? cfg.editIntro : cfg.intro}
          </p>

          <div className="wizard-glossary">
            <div className="gloss-item">
              <span className={`gloss-badge ${cfg.badgeCls}`}>{cfg.label}</span>
              <span className="gloss-desc">{cfg.description}</span>
            </div>
            <div className="gloss-item">
              <span className={`gloss-badge ${refType === 'Budget' ? 'budget' : 'forecast'}`}>{refLabel}</span>
              <span className="gloss-desc">
                {refType === 'Budget'
                  ? 'Valor de orçamento aprovado. Exibido como referência ao preencher o Forecast.'
                  : 'Previsão atualizada de desembolso. Exibida como referência ao preencher o Budget.'}
              </span>
            </div>
          </div>

          {hasExistingData && (
            <div style={{
              background: cfg.bgColor, border: `1.5px solid ${cfg.borderColor}`,
              borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: 20,
              display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center',
            }}>
              {CATEGORIES.map(cat => (
                <div key={cat} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {CAT_ICONS[cat]} {cat}
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: 'var(--ctg-navy)' }}>
                    {formatBRL(getCatTotal(cat))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="wizard-steps-preview">
            {CATEGORIES.map((cat, i) => {
              const hasData = Array.from({ length: 12 }, (_, m) => getValue(cat, m + 1)).some(v => v > 0);
              return (
                <div key={cat} className="wsp-item" style={{ position: 'relative' }}>
                  <span className="wsp-num">{i + 1}</span>
                  <span className="wsp-label">{cat}</span>
                  {hasData && (
                    <span style={{
                      position: 'absolute', top: -4, right: -4,
                      background: cfg.color, color: '#fff',
                      fontSize: '0.55rem', fontWeight: 700, borderRadius: '50%',
                      width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>✓</span>
                  )}
                </div>
              );
            })}
            <div className="wsp-item">
              <span className="wsp-num">4</span>
              <span className="wsp-label">Revisão</span>
            </div>
          </div>

          <button className="btn btn-primary wizard-start-btn" onClick={() => setStep(1)}>
            {hasExistingData ? `${cfg.editBtn} →` : `${cfg.startBtn} →`}
          </button>
        </div>
      </div>
    );
  }

  // ── STEPS 1–3: Category input ──────────────────────────────────────────────
  if (step >= 1 && step <= 3) {
    const cat      = CATEGORIES[step - 1];
    const catTotal = getCatTotal(cat);
    const refTotal = Array.from({ length: 12 }, (_, i) => getRef(cat, i + 1))
      .reduce((s, v) => s + (v ?? 0), 0);
    const diff = catTotal - refTotal;

    return (
      <div className="wizard-container">
        <div className="wizard-progress">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className={`wp-step ${s < step ? 'done' : s === step ? 'active' : ''}`}>
              <div className="wp-dot">{s < step ? '✓' : s}</div>
              <div className="wp-label">{s <= 3 ? CATEGORIES[s - 1] : 'Revisão'}</div>
            </div>
          ))}
          <div className="wp-line" style={{ width: `${((step - 1) / 3) * 100}%` }} />
        </div>

        <div className="wizard-cat-header">
          <div style={{
            width: 40, height: 40, borderRadius: 'var(--radius-sm)',
            background: cfg.bgColor, border: `2px solid ${cfg.color}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.65rem', fontWeight: 800, color: cfg.color, flexShrink: 0,
          }}>
            {CAT_ICONS[cat]}
          </div>
          <div>
            <h2 className="wizard-cat-title">{cat}</h2>
            <p className="wizard-cat-desc">{CAT_DESCRIPTIONS[cat]}</p>
          </div>
          <div className="wizard-cat-total">
            <div className="wct-label">{cfg.label} {year}</div>
            <div className="wct-value">{formatBRL(catTotal)}</div>
            {refTotal > 0 && (
              <div className={`wct-diff ${diff > 0 ? 'over' : diff < 0 ? 'under' : ''}`}>
                {diff === 0
                  ? `= ${refLabel}`
                  : diff > 0
                    ? `▲ ${formatBRL(Math.abs(diff))} acima`
                    : `▼ ${formatBRL(Math.abs(diff))} abaixo`}
              </div>
            )}
          </div>
        </div>

        <div className="wizard-months">
          <div className="wizard-months-header">
            <span>Mês</span>
            <span>Valor {cfg.label} (R$)</span>
            <span>Justificativa</span>
          </div>
          {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
            <MonthRow
              key={`${cat}|${month}|${year}|${getValue(cat, month)}`}
              month={month}
              year={year}
              value={getValue(cat, month)}
              comment={getComment(cat, month)}
              refValue={getRef(cat, month)}
              refLabel={refLabel}
              onChange={(m, v, c) => handleChange(cat, m, v, c)}
            />
          ))}
        </div>

        <div className="wizard-nav">
          <button className="btn btn-secondary" onClick={() => setStep(s => s - 1)}>
            ← {step === 1 ? 'Início' : CATEGORIES[step - 2]}
          </button>
          <button className="btn btn-primary" onClick={() => setStep(s => s + 1)}>
            {step === 3 ? 'Revisar →' : `${CATEGORIES[step]} →`}
          </button>
        </div>
      </div>
    );
  }

  // ── STEP 4: Review ────────────────────────────────────────────────────────
  return (
    <div className="wizard-container">
      <div className="wizard-progress">
        {[1, 2, 3, 4].map(s => (
          <div key={s} className={`wp-step ${s < 4 ? 'done' : 'active'}`}>
            <div className="wp-dot">{s < 4 ? '✓' : s}</div>
            <div className="wp-label">{s <= 3 ? CATEGORIES[s - 1] : 'Revisão'}</div>
          </div>
        ))}
        <div className="wp-line" style={{ width: '100%' }} />
      </div>

      <div className="wizard-review">
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--ctg-navy)', marginBottom: 4 }}>
          Revisão do {cfg.label} {year}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 20 }}>
          Confira os totais antes de salvar. Clique em uma categoria para voltar e editar.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
          {CATEGORIES.map(cat => {
            const total    = getCatTotal(cat);
            const refTotal = Array.from({ length: 12 }, (_, i) => getRef(cat, i + 1))
              .reduce((s, v) => s + (v ?? 0), 0);
            return (
              <div key={cat} className="review-cat-card" onClick={() => setStep(CATEGORIES.indexOf(cat) + 1)}>
                <div style={{
                  width: 36, height: 36, borderRadius: 'var(--radius-sm)',
                  background: cfg.bgColor, border: `2px solid ${cfg.color}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.6rem', fontWeight: 800, color: cfg.color,
                }}>
                  {CAT_ICONS[cat]}
                </div>
                <div>
                  <div className="rcc-label">{cat}</div>
                  <div className="rcc-value">{formatBRL(total)}</div>
                  {refTotal > 0 && (
                    <div className="rcc-budget">{refLabel}: {formatBRL(refTotal)}</div>
                  )}
                </div>
                <div className="rcc-edit">✎</div>
              </div>
            );
          })}
        </div>

        <div className="review-total-banner" style={{ background: `linear-gradient(135deg, ${cfg.color}, ${cfg.color}CC)` }}>
          <div>
            <div style={{ fontSize: '0.75rem', opacity: 0.75 }}>TOTAL {cfg.label.toUpperCase()} {year}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', lineHeight: 1 }}>
              {formatBRL(totalValue)}
            </div>
          </div>
          {saved && <span style={{ fontSize: '0.85rem', opacity: 0.85 }}>✓ Salvo</span>}
        </div>

        <div className="table-wrapper" style={{ marginBottom: 20 }}>
          <table className="forecast-table">
            <thead>
              <tr>
                <th className="col-label">Categoria</th>
                {Array.from({ length: 12 }, (_, i) => (
                  <th key={i} style={{ fontSize: '0.7rem' }}>{MONTHS_FULL_PT[i].slice(0, 3)}</th>
                ))}
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map(cat => (
                <tr
                  key={cat}
                  className={editType === 'Budget' ? 'row-budget' : 'row-forecast'}
                  onClick={() => setStep(CATEGORIES.indexOf(cat) + 1)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="td-label">{CAT_ICONS[cat]} {cat}</td>
                  {Array.from({ length: 12 }, (_, i) => {
                    const v = getValue(cat, i + 1);
                    return (
                      <td key={i} style={{ fontSize: '0.75rem' }}>
                        {v > 0 ? v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '—'}
                      </td>
                    );
                  })}
                  <td style={{ fontWeight: 700 }}>{formatBRL(getCatTotal(cat))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="wizard-nav">
          <button className="btn btn-secondary" onClick={() => setStep(3)}>← Voltar</button>
          <button
            className="btn btn-primary"
            style={{ padding: '12px 28px', fontSize: '0.95rem' }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Salvando...' : saved ? `✓ ${cfg.label} Salvo!` : `Salvar ${cfg.label}`}
          </button>
        </div>
      </div>
    </div>
  );
}
