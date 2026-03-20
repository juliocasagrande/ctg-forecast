import { useState, useEffect } from 'react';
import api from '../utils/api.js';
import { useToast } from '../components/ui/Toast.jsx';

const SECTIONS = [
  { id: 'alerts',  label: '🔔 Alertas',        icon: '🔔' },
  { id: 'colors',  label: '🎨 Cores',           icon: '🎨' },
  { id: 'export',  label: '📊 Exportação',      icon: '📊' },
  { id: 'fiscal',  label: '📅 Ano Fiscal',      icon: '📅' },
];

const DEFAULTS = {
  alert_stale_days:      '30',
  alert_empty_forecast:  'true',
  alert_unread_messages: 'true',
  color_budget:          '#15803D',
  color_forecast:        '#0EA5E9',
  color_actual:          '#1E40AF',
  color_meta:            '#7C3AED',
  color_pool:            '#0891B2',
  export_include_meta:   'true',
  export_include_pool:   'true',
  fiscal_year_start:     '1',
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
