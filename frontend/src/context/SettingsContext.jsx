import { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api.js';
import { useAuth } from './AuthContext.jsx';

const DEFAULTS = {
  alert_stale_days:      '30',
  tracking_alert_interval_days: '6',
  tracking_alert_role_days: '{"engenheiro":6,"coordenador":10,"gerente":14,"diretor":14,"admin":14}',
  tracking_alert_roles:  'gerente,diretor,coordenador,engenheiro,admin',
  iac_alert_interval_days: '6',
  iac_alert_role_days:   '{"engenheiro":6,"coordenador":10,"gerente":14,"diretor":14,"admin":14}',
  iac_alert_roles:       'gerente,diretor,coordenador,engenheiro,admin',
  doc_alert_enabled:     'true',
  doc_alert_interval_days: '7',
  doc_alert_role_days:   '{"engenheiro":7,"coordenador":14,"planejador":14,"gerente":21,"diretor":21,"admin":21}',
  doc_alert_exclude_cancelled: 'true',
  doc_alert_exclude_published: 'true',
  doc_alert_roles:       'engenheiro,coordenador,planejador',
  doc_alert_areas:       '',
  drawing_alert_enabled: 'true',
  drawing_alert_interval_days: '7',
  drawing_alert_role_days: '{"engenheiro":7,"coordenador":14,"planejador":14,"gerente":21,"diretor":21,"admin":21}',
  drawing_alert_exclude_cancelled: 'true',
  drawing_alert_exclude_published: 'true',
  drawing_alert_roles:   'engenheiro,coordenador,planejador',
  drawing_alert_areas:   '',
  pms_alert_enabled:     'true',
  pms_alert_days:        '30',
  pms_alert_role_days:   '{"engenheiro":30,"coordenador":15,"planejador":15,"gerente":15,"diretor":15,"admin":15}',
  pms_alert_roles:       'coordenador,gerente,diretor,admin',
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
  forecast_permissions:  '{"planejador":{"Budget":"edit","Forecast":"edit","Actual":"edit","Pool":"edit","Meta":"edit"},"coordenador":{"Budget":"edit","Forecast":"edit","Actual":"edit","Pool":"edit","Meta":"edit"},"engenheiro":{"Budget":"none","Forecast":"edit","Actual":"edit","Pool":"none","Meta":"none"},"gerente":{"Budget":"none","Forecast":"none","Actual":"none","Pool":"none","Meta":"none"},"diretor":{"Budget":"none","Forecast":"none","Actual":"none","Pool":"none","Meta":"none"}}',
  user_name_mappings:    '[]',
};

const SettingsContext = createContext(DEFAULTS);
const SettingsReadyContext = createContext(false);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [ready, setReady] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) { setReady(false); return; }
    setReady(false);
    api.get('/settings')
      .then(r => setSettings({ ...DEFAULTS, ...r.data }))
      .catch(() => {})
      .finally(() => setReady(true));
  }, [user?.id]);

  return (
    <SettingsReadyContext.Provider value={ready}>
      <SettingsContext.Provider value={settings}>
        {children}
      </SettingsContext.Provider>
    </SettingsReadyContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}

export function useSettingsReady() {
  return useContext(SettingsReadyContext);
}

// Convenience: returns the 5 type colors as an object
export function useTypeColors() {
  const s = useSettings();
  return {
    budget:   s.color_budget,
    forecast: s.color_forecast,
    actual:   s.color_actual,
    meta:     s.color_meta,
    pool:     s.color_pool,
  };
}

export default SettingsContext;
