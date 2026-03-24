import { useState, useEffect } from 'react';
import api from '../utils/api.js';
import { useToast } from '../components/ui/Toast.jsx';

function CloseYearPanel({ settings, toast }) {
  const currentYear = new Date().getFullYear();
  const activeStart = parseInt(settings.active_year_start) || 2026;
  const yearsToClose = [];
  for (let y = activeStart - 3; y < activeStart; y++) yearsToClose.push(y);
  // Also allow closing the previous active year
  if (!yearsToClose.includes(currentYear - 1)) yearsToClose.push(currentYear - 1);

  const [selectedYear, setSelectedYear] = useState(activeStart - 1);
  const [closing, setClosing] = useState(false);
  const [result, setResult] = useState(null);

  const handleClose = async () => {
    if (!confirm(`Tem certeza que deseja consolidar o ano ${selectedYear}?\n\nTodos os valores mensais serão somados em um único valor consolidado por projeto/categoria/tipo.\n\nOs dados mensais NÃO serão apagados.`))
      return;
    setClosing(true);
    setResult(null);
    try {
      const r = await api.post('/forecast/close-year', { year: selectedYear });
      setResult(r.data);
      toast(`Ano ${selectedYear} consolidado com sucesso! (${r.data.consolidated} registros)`, 'success');
    } catch (err) {
      toast('Erro ao consolidar ano', 'error');
    } finally { setClosing(false); }
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <select
          value={selectedYear}
          onChange={e => { setSelectedYear(parseInt(e.target.value)); setResult(null); }}
          className="form-select"
          style={{ width: 'auto', minWidth: 120 }}
        >
          {yearsToClose.sort().map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <button
          className="btn btn-primary"
          onClick={handleClose}
          disabled={closing}
          style={{ whiteSpace: 'nowrap' }}
        >
          {closing ? 'Consolidando...' : `🔒 Fechar ano ${selectedYear}`}
        </button>
      </div>
      {result && (
        <div style={{
          padding: '10px 14px', borderRadius: 'var(--radius-md)',
          background: '#F0FDF4', border: '1px solid #BBF7D0',
          fontSize: '0.83rem', color: '#166534',
        }}>
          ✓ Ano {result.year} consolidado: {result.consolidated} registros processados.
        </div>
      )}
      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.6 }}>
        O fechamento cria valores consolidados na tabela de anos anteriores. Os dados mensais originais são preservados como histórico.
        Após consolidar, você pode ajustar o "Ano inicial" acima para refletir o novo período ativo.
      </p>
    </div>
  );
}

const TYPE_ICONS = { suggestion: '💡', bug: '🐛', usability: '🎯', other: '💬' };
const TYPE_LABELS_FB = { suggestion: 'Sugestão', bug: 'Problema', usability: 'Usabilidade', other: 'Outro' };
const TYPE_COLORS_FB = { suggestion: '#0EA5E9', bug: '#DC2626', usability: '#7C3AED', other: '#6B7280' };
const STATUS_LABELS = { new: 'Novo', read: 'Lido', done: 'Resolvido' };

function FeedbackList({ toast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api.get('/feedback').then(r => setItems(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = filter ? items.filter(f => f.type === filter) : items;

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button onClick={() => setFilter('')} style={{
          padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
          background: !filter ? 'var(--ctg-navy)' : 'var(--bg-app)',
          color: !filter ? '#fff' : 'var(--text-secondary)',
          fontSize: '0.78rem', fontWeight: 600, fontFamily: 'var(--font-body)',
        }}>
          Todos ({items.length})
        </button>
        {Object.entries(TYPE_LABELS_FB).map(([key, label]) => {
          const count = items.filter(f => f.type === key).length;
          if (!count) return null;
          return (
            <button key={key} onClick={() => setFilter(filter === key ? '' : key)} style={{
              padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              background: filter === key ? TYPE_COLORS_FB[key] + '20' : 'var(--bg-app)',
              color: filter === key ? TYPE_COLORS_FB[key] : 'var(--text-secondary)',
              fontSize: '0.78rem', fontWeight: 600, fontFamily: 'var(--font-body)',
            }}>
              {TYPE_ICONS[key]} {label} ({count})
            </button>
          );
        })}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>📭</div>
          Nenhum feedback recebido ainda.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(f => (
            <div key={f.id} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)', padding: '14px 16px',
              borderLeft: `4px solid ${TYPE_COLORS_FB[f.type] || '#6B7280'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{
                  fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                  background: TYPE_COLORS_FB[f.type] + '18', color: TYPE_COLORS_FB[f.type],
                }}>
                  {TYPE_ICONS[f.type]} {TYPE_LABELS_FB[f.type] || f.type}
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  {new Date(f.created_at).toLocaleDateString('pt-BR')} {new Date(f.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span style={{ marginLeft: 'auto', fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  {f.user_name} ({f.user_role})
                </span>
              </div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--ctg-navy)', marginBottom: 4 }}>
                {f.subject}
              </div>
              <div style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {f.message}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 6 }}>
                {f.user_email}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const SECTIONS = [
  { id: 'alerts',  label: '🔔 Alertas',        icon: '🔔' },
  { id: 'colors',  label: '🎨 Cores',           icon: '🎨' },
  { id: 'period',  label: '📆 Período',         icon: '📆' },
  { id: 'export',  label: '📊 Exportação',      icon: '📊' },
  { id: 'fiscal',  label: '📅 Ano Fiscal',      icon: '📅' },
  { id: 'feedback',label: '💡 Feedbacks',       icon: '💡' },
];

const DEFAULTS = {
  alert_stale_days:      '30',
  alert_empty_forecast:  'true',
  alert_unread_messages: 'true',
  actual_deadline_business_day: '6',
  color_budget:          '#15803D',
  color_forecast:        '#0EA5E9',
  color_actual:          '#1E40AF',
  color_meta:            '#7C3AED',
  color_pool:            '#0891B2',
  export_include_meta:   'true',
  export_include_pool:   'true',
  fiscal_year_start:     '1',
  active_year_start:     '2026',
  active_year_end:       '2031',
};

const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                   'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function SectionCard({ title, description, children }) {
  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <div>
          <h3 className="settings-section-title">{title}</h3>
          {description && <p className="settings-section-desc">{description}</p>}
        </div>
      </div>
      <div className="settings-section-body">{children}</div>
    </div>
  );
}

function Toggle({ label, description, value, onChange }) {
  return (
    <label className="settings-toggle">
      <div className="settings-toggle-text">
        <span className="settings-toggle-label">{label}</span>
        {description && <span className="settings-toggle-desc">{description}</span>}
      </div>
      <div
        className={`settings-toggle-switch ${value ? 'on' : ''}`}
        onClick={() => onChange(!value)}
        role="switch"
        aria-checked={value}
        tabIndex={0}
        onKeyDown={e => e.key === ' ' && onChange(!value)}
      >
        <div className="settings-toggle-thumb" />
      </div>
    </label>
  );
}

function ColorPicker({ label, description, value, onChange }) {
  return (
    <div className="settings-color-row">
      <div style={{ flex: 1 }}>
        <div className="settings-toggle-label">{label}</div>
        {description && <div className="settings-toggle-desc">{description}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', background: value,
          border: '2px solid var(--border-strong)', flexShrink: 0,
          boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
        }} />
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ width: 42, height: 36, padding: 2, border: '1.5px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'none' }}
        />
        <span style={{ fontSize: '0.78rem', fontFamily: 'monospace', color: 'var(--text-secondary)', minWidth: 64 }}>
          {value.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

function NumberInput({ label, description, value, onChange, min = 1, max = 365, unit }) {
  return (
    <div className="settings-color-row">
      <div style={{ flex: 1 }}>
        <div className="settings-toggle-label">{label}</div>
        {description && <div className="settings-toggle-desc">{description}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={e => onChange(String(Math.max(min, Math.min(max, parseInt(e.target.value) || min))))}
          style={{
            width: 70, padding: '7px 10px', border: '1.5px solid var(--border-strong)',
            borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-body)',
            fontSize: '0.9rem', textAlign: 'center', outline: 'none',
            color: 'var(--text-primary)', background: 'var(--bg-card)',
          }}
        />
        {unit && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{unit}</span>}
      </div>
    </div>
  );
}

function SelectInput({ label, description, value, onChange, options }) {
  return (
    <div className="settings-color-row">
      <div style={{ flex: 1 }}>
        <div className="settings-toggle-label">{label}</div>
        {description && <div className="settings-toggle-desc">{description}</div>}
      </div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="form-select"
        style={{ width: 'auto', minWidth: 140 }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState({ ...DEFAULTS });
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [dirty,    setDirty]    = useState(false);
  const [activeSection, setActiveSection] = useState('alerts');
  const { toast } = useToast();

  useEffect(() => {
    api.get('/settings').then(r => {
      setSettings({ ...DEFAULTS, ...r.data });
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const set = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: String(value) }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/settings', settings);
      setDirty(false);
      toast('Configurações salvas com sucesso!', 'success');
      // Reload page to apply color changes globally
      setTimeout(() => window.location.reload(), 800);
    } catch { toast('Erro ao salvar configurações.', 'error'); }
    finally { setSaving(false); }
  };

  const handleReset = () => {
    setSettings({ ...DEFAULTS });
    setDirty(true);
  };

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <div className="settings-page">
      {/* Navigation tabs */}
      <div className="settings-nav">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            className={`settings-nav-btn ${activeSection === s.id ? 'active' : ''}`}
            onClick={() => setActiveSection(s.id)}
          >
            <span className="settings-nav-icon">{s.icon}</span>
            <span className="settings-nav-label">{s.label.split(' ').slice(1).join(' ')}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="settings-content">

        {/* ── ALERTAS ── */}
        {activeSection === 'alerts' && (
          <>
            <SectionCard
              title="Tempo sem atualização"
              description="Define após quantos dias sem atualização um projeto dispara alerta para os gestores."
            >
              <NumberInput
                label="Dias para alerta de desatualização"
                description="Projetos sem atualização de Forecast há mais dias que esse valor serão marcados em vermelho."
                value={settings.alert_stale_days}
                onChange={v => set('alert_stale_days', v)}
                min={1} max={365} unit="dias"
              />
            </SectionCard>

            <SectionCard
              title="Prazo para Realizado"
              description="Define até qual dia útil do mês o engenheiro deve ter atualizado o Realizado do mês anterior."
            >
              <NumberInput
                label="Dia útil limite"
                description="Após esse dia útil do mês, projetos sem Realizado do mês anterior dispararão alerta ao engenheiro."
                value={settings.actual_deadline_business_day}
                onChange={v => set('actual_deadline_business_day', v)}
                min={1} max={20} unit="º dia útil"
              />
            </SectionCard>

            <SectionCard
              title="Tipos de alertas ativos"
              description="Controle quais tipos de alertas aparecem no sino de notificações."
            >
              <Toggle
                label="Forecast não preenchido"
                description="Alerta quando um projeto não tem nenhum valor de Forecast no ano corrente."
                value={settings.alert_empty_forecast === 'true'}
                onChange={v => set('alert_empty_forecast', v)}
              />
              <Toggle
                label="Mensagens não lidas"
                description="Alerta quando há mensagens de chat não lidas nos projetos."
                value={settings.alert_unread_messages === 'true'}
                onChange={v => set('alert_unread_messages', v)}
              />
            </SectionCard>
          </>
        )}

        {/* ── CORES ── */}
        {activeSection === 'colors' && (
          <>
            <SectionCard
              title="Cores dos tipos de dados"
              description="Personalize as cores usadas nos gráficos e tabelas para cada tipo de dado."
            >
              <ColorPicker label="Budget"    description="Orçamento aprovado"           value={settings.color_budget}   onChange={v => set('color_budget', v)} />
              <ColorPicker label="Forecast"  description="Previsão atualizada"          value={settings.color_forecast} onChange={v => set('color_forecast', v)} />
              <ColorPicker label="Realizado" description="Valores efetivamente pagos"   value={settings.color_actual}   onChange={v => set('color_actual', v)} />
              <ColorPicker label="Meta"      description="Meta definida pelo planejador" value={settings.color_meta}    onChange={v => set('color_meta', v)} />
              <ColorPicker label="Pool"      description="Valores disponíveis no pool"  value={settings.color_pool}    onChange={v => set('color_pool', v)} />
            </SectionCard>

            <SectionCard title="Pré-visualização" description="Como as cores ficarão nos gráficos.">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '8px 0' }}>
                {[
                  { label: 'Budget',    key: 'color_budget' },
                  { label: 'Forecast',  key: 'color_forecast' },
                  { label: 'Realizado', key: 'color_actual' },
                  { label: 'Meta',      key: 'color_meta' },
                  { label: 'Pool',      key: 'color_pool' },
                ].map(({ label, key }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, background: settings[key] + '22', border: `1.5px solid ${settings[key]}` }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: settings[key], flexShrink: 0 }} />
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: settings[key] }}>{label}</span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
                As cores serão aplicadas após salvar e recarregar a página.
              </p>
            </SectionCard>

            <SectionCard title="Restaurar padrões">
              <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
                Restaura todas as cores para os valores padrão do sistema.
              </p>
              <button className="btn btn-secondary" onClick={handleReset}>
                Restaurar cores padrão
              </button>
            </SectionCard>
          </>
        )}

        {/* ── PERÍODO / ANOS ── */}
        {activeSection === 'period' && (
          <>
            <SectionCard
              title="Anos ativos (detalhamento mensal)"
              description="Define o intervalo de anos que aparecem no Wizard de Forecast com detalhamento mês a mês. Anos fora desse intervalo são tratados como consolidados (valor único por categoria/tipo)."
            >
              <NumberInput
                label="Ano inicial"
                description="Primeiro ano disponível no Wizard para preenchimento mensal."
                value={settings.active_year_start}
                onChange={v => set('active_year_start', v)}
                min={2020} max={2040}
              />
              <NumberInput
                label="Ano final"
                description="Último ano disponível no Wizard para preenchimento mensal."
                value={settings.active_year_end}
                onChange={v => set('active_year_end', v)}
                min={2020} max={2040}
              />
              <div style={{ padding: '12px 0', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                <strong>Anos ativos:</strong> {settings.active_year_start} a {settings.active_year_end} (detalhamento mensal)
                <br />
                <strong>Anos anteriores a {settings.active_year_start}:</strong> apenas valores consolidados (um total por categoria)
              </div>
            </SectionCard>

            <SectionCard
              title="Fechamento de ano"
              description="Consolida automaticamente todos os valores mensais de um ano em um único valor por projeto/categoria/tipo. Isso é útil ao encerrar um exercício — os dados mensais ficam preservados, e o valor consolidado é criado para referência rápida."
            >
              <CloseYearPanel settings={settings} toast={toast} />
            </SectionCard>
          </>
        )}

        {/* ── EXPORTAÇÃO ── */}
        {activeSection === 'export' && (
          <SectionCard
            title="Conteúdo da exportação Excel"
            description="Defina quais tipos de dados são incluídos nos relatórios exportados."
          >
            <Toggle
              label="Incluir Meta nos exports"
              description="Adiciona a linha de Meta no Excel exportado de projetos e relatório do planejador."
              value={settings.export_include_meta === 'true'}
              onChange={v => set('export_include_meta', v)}
            />
            <Toggle
              label="Incluir Pool nos exports"
              description="Adiciona a linha de Pool no Excel exportado de projetos e relatório do planejador."
              value={settings.export_include_pool === 'true'}
              onChange={v => set('export_include_pool', v)}
            />
          </SectionCard>
        )}

        {/* ── ANO FISCAL ── */}
        {activeSection === 'fiscal' && (
          <SectionCard
            title="Configuração do ano fiscal"
            description="Define o mês de início do ano fiscal para cálculos e relatórios."
          >
            <SelectInput
              label="Mês de início do ano fiscal"
              description="Impacta filtros de período, totais anuais e geração de relatórios."
              value={settings.fiscal_year_start}
              onChange={v => set('fiscal_year_start', v)}
              options={MONTHS_PT.map((m, i) => ({ value: String(i + 1), label: m }))}
            />
          </SectionCard>
        )}

        {/* ── FEEDBACKS ── */}
        {activeSection === 'feedback' && (
          <FeedbackList toast={toast} />
        )}
      </div>

      {/* Sticky save bar */}
      <div className={`settings-save-bar ${dirty ? 'visible' : ''}`}>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          Você tem alterações não salvas
        </span>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => { setSettings({ ...DEFAULTS }); setDirty(false); }}>
            Descartar
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : '💾 Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
