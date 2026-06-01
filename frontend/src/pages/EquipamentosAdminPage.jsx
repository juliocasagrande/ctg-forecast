import { useState, useEffect, useMemo, useRef } from 'react';
import api from '../utils/api.js';
import { useToast } from '../components/ui/Toast.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const USINAS = [
  'UHE Capivara', 'UHE Canoas 1', 'UHE Canoas 2', 'UHE Chavantes',
  'UHE Garibaldi', 'UHE Ilha Solteira', 'UHE Jupiá', 'UHE Jurumirim',
  'UHE Rosana', 'UHE Salto', 'UHE Salto Grande', 'UHE Taquaruçu',
  'PCH Palmeiras', 'PCH Retiro',
];

const USINA_POLES = [
  { label: 'Rio Paraná',     color: '#0070B8', usinas: ['UHE Ilha Solteira', 'UHE Jupiá', 'UHE Salto'] },
  { label: 'Polo Chavantes', color: '#10B981', usinas: ['UHE Canoas 1', 'UHE Canoas 2', 'UHE Chavantes', 'UHE Salto Grande', 'UHE Jurumirim', 'PCH Retiro', 'PCH Palmeiras'] },
  { label: 'Polo Capivara',  color: '#6366F1', usinas: ['UHE Capivara', 'UHE Rosana', 'UHE Taquaruçu', 'UHE Garibaldi'] },
];
const SIM_NAO = ['Sim', 'Não'];

const normalizeUsinaKey = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\b(uhe|pch)\b/g, ' ')
  .replace(/\bii\b/g, '2')
  .replace(/\bi\b/g, '1')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const USINA_BY_KEY = new Map(USINAS.map(usina => [normalizeUsinaKey(usina), usina]));

const canonicalUsina = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  return USINA_BY_KEY.get(normalizeUsinaKey(raw)) || raw;
};

const normalizeEquipamentoRow = (row) => (
  row ? { ...row, usina: canonicalUsina(row.usina) } : row
);

const EMPTY = {
  usina: '', tipo_tabela: '', equipamento: '', ug: '', tag: '',
  fabricante: '', modelo: '', num_serie: '',
  tem_sobressalente: 'Não', quantos: '', ano: '',
  url_imagem: '',
};

function Field({ label, required, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'block', fontSize: '0.7rem', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.07em',
        color: 'var(--text-muted)', marginBottom: 5,
      }}>
        {label}{required && <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '8px 10px', borderRadius: 7,
  border: '1px solid var(--border-strong)',
  background: 'var(--bg-app)',
  fontSize: '0.84rem', color: 'var(--text-primary)',
  outline: 'none',
  fontFamily: 'var(--font-body)',
};

function EquipamentoModal({ item, onSave, onClose, onDelete, equipOptions, tabelaOptions }) {
  const [form, setForm] = useState(item ? { ...item } : { ...EMPTY });
  const [saving, setSaving] = useState(false);
  const [delConfirm, setDelConfirm] = useState(false);
  const { toast } = useToast();

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.usina || !form.tipo_tabela || !form.equipamento || !form.ug || !form.tag) {
      toast('Preencha os campos obrigatorios: Usina, Tabela, Equipamento, UG e TAG.', 'error');
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
      onClose();
    } catch (err) {
      toast('Erro ao salvar: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await onDelete(item.id);
      onClose();
    } catch (err) {
      toast('Erro ao excluir: ' + (err.response?.data?.error || err.message), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 300 }}>
      <div className="modal" style={{ maxWidth: 560, width: '95vw' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">
            {item ? `Editar TAG — ${item.tag}` : 'Novo Equipamento'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', fontSize: '1.1rem', padding: '0 4px' }}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>

            <Field label="Usina" required>
              <select value={form.usina} onChange={e => set('usina', e.target.value)} style={inputStyle}>
                <option value="">Selecione...</option>
                {USINAS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>

            <Field label="Tabela" required>
              <input
                list="tabela-list"
                value={form.tipo_tabela}
                onChange={e => set('tipo_tabela', e.target.value)}
                placeholder="Ex: Subestação"
                style={inputStyle}
              />
              <datalist id="tabela-list">
                {tabelaOptions.map(t => <option key={t} value={t} />)}
              </datalist>
            </Field>

            <Field label="Equipamento" required>
              <input
                list="equip-list"
                value={form.equipamento}
                onChange={e => set('equipamento', e.target.value)}
                placeholder="Ex: Transformador de corrente"
                style={inputStyle}
              />
              <datalist id="equip-list">
                {equipOptions.map(e => <option key={e} value={e} />)}
              </datalist>
            </Field>

            <Field label="UG (Unidade Geradora)" required>
              <input value={form.ug} onChange={e => set('ug', e.target.value)}
                placeholder="Ex: UG01" style={inputStyle} />
            </Field>

            <Field label="TAG" required>
              <input value={form.tag} onChange={e => set('tag', e.target.value)}
                placeholder="Ex: 3TC1-A" style={inputStyle} />
            </Field>

            <Field label="Fabricante">
              <input value={form.fabricante} onChange={e => set('fabricante', e.target.value)}
                placeholder="Ex: GE" style={inputStyle} />
            </Field>

            <Field label="Modelo">
              <input value={form.modelo} onChange={e => set('modelo', e.target.value)}
                placeholder="Ex: CTH-550" style={inputStyle} />
            </Field>

            <Field label="Nº de Série">
              <input value={form.num_serie} onChange={e => set('num_serie', e.target.value)}
                placeholder="Ex: 5192215201.10.4" style={inputStyle} />
            </Field>

            <Field label="Ano">
              <input type="number" value={form.ano} onChange={e => set('ano', e.target.value)}
                placeholder="Ex: 2016" min="1900" max="2099" style={inputStyle} />
            </Field>

            <Field label="Tem sobressalente?">
              <select value={form.tem_sobressalente} onChange={e => set('tem_sobressalente', e.target.value)} style={inputStyle}>
                {SIM_NAO.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>

            <Field label="Quantos?">
              <input type="number" value={form.quantos} onChange={e => set('quantos', e.target.value)}
                placeholder="Ex: 1" min="0" style={inputStyle} />
            </Field>
          </div>

          <Field label="URL da Imagem / Documentação">
            <input value={form.url_imagem} onChange={e => set('url_imagem', e.target.value)}
              placeholder="https://..." style={inputStyle} />
          </Field>
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <div>
            {item && !delConfirm && (
              <button onClick={() => setDelConfirm(true)} className="btn"
                style={{ background: '#FEE2E2', color: '#DC2626', border: '1px solid #FCA5A5' }}>
                Excluir
              </button>
            )}
            {item && delConfirm && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: '#DC2626' }}>Confirmar exclusão?</span>
                <button onClick={handleDelete} disabled={saving} className="btn"
                  style={{ background: '#DC2626', color: '#fff', border: 'none' }}>
                  {saving ? '...' : 'Sim, excluir'}
                </button>
                <button onClick={() => setDelConfirm(false)} className="btn btn-secondary">Não</button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} className="btn btn-secondary">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="btn"
              style={{ background: 'linear-gradient(135deg,#001F5B,#0b5cab)', color: '#fff', border: 'none' }}>
              {saving ? 'Salvando...' : (item ? 'Salvar alterações' : 'Criar')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Import Modal ────────────────────────────────────────────────────────── */
function ImportModal({ onClose, onImported, myTabelas }) {
  const [file, setFile]             = useState(null);
  const [tipoTabela, setTipoTabela] = useState(myTabelas[0] || '');
  const [replace, setReplace]       = useState(false);
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState(null);

  const handleImport = async () => {
    if (!file || !tipoTabela) return;
    setLoading(true);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('tipo_tabela', tipoTabela);
    fd.append('replace', replace ? 'true' : 'false');
    try {
      const r = await api.post('/equipamentos/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult({ ok: true, inserted: r.data.inserted });
      onImported();
    } catch (err) {
      setResult({ ok: false, msg: err.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 300 }}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Importar Excel</span>
          <button onClick={onClose} style={{ background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.7)',fontSize:'1.1rem',padding:'0 4px' }}>✕</button>
        </div>
        <div className="modal-body">
          {result ? (
            <div style={{
              padding: 16, borderRadius: 8,
              background: result.ok ? '#D1FAE5' : '#FEE2E2',
              color: result.ok ? '#065F46' : '#DC2626',
              textAlign: 'center', fontWeight: 600,
            }}>
              {result.ok
                ? `✅ ${result.inserted} registros importados com sucesso!`
                : `❌ Erro: ${result.msg}`}
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 16 }}>
                <label style={{
                  display: 'block', fontSize: '0.7rem', fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                  color: 'var(--text-muted)', marginBottom: 5,
                }}>
                  Tabela de destino <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <select
                  value={tipoTabela}
                  onChange={e => setTipoTabela(e.target.value)}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '8px 10px', borderRadius: 7,
                    border: '1px solid var(--border-strong)',
                    background: 'var(--bg-app)',
                    fontSize: '0.84rem', color: 'var(--text-primary)',
                    outline: 'none', fontFamily: 'var(--font-body)',
                  }}
                >
                  {myTabelas.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 10 }}>
                O arquivo Excel deve ter as seguintes colunas na primeira linha:
              </p>
              <div style={{
                background: 'var(--bg-app)', borderRadius: 8, padding: '8px 12px',
                fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16,
                fontFamily: 'monospace', lineHeight: 1.8,
              }}>
                Usina · Equipamento · UG · TAG · Fabricante · Modelo · Nº Série · Tem sobressalente? · Quantos? · Ano · URL DA IMAGEM
              </div>

              <div style={{ marginBottom: 14 }}>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={e => setFile(e.target.files[0])}
                  style={{ fontSize: '0.82rem' }}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                <input type="checkbox" checked={replace} onChange={e => setReplace(e.target.checked)}
                  style={{ accentColor: '#DC2626', width: 15, height: 15 }} />
                <span>
                  <strong style={{ color: '#DC2626' }}>Substituir dados desta tabela</strong>
                  {' '}(apaga registros com o mesmo nome de tabela e reimporta)
                </span>
              </label>
            </>
          )}
        </div>
        <div className="modal-footer">
          {result ? (
            <button onClick={onClose} className="btn btn-secondary">Fechar</button>
          ) : (
            <>
              <button onClick={onClose} className="btn btn-secondary">Cancelar</button>
              <button onClick={handleImport} disabled={!file || !tipoTabela || loading} className="btn"
                style={{ background: 'linear-gradient(135deg,#001F5B,#0b5cab)', color: '#fff', border: 'none' }}>
                {loading ? 'Importando...' : 'Importar'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Export Modal ────────────────────────────────────────────────────────── */
function ExportModal({ onClose, tabelaOptions }) {
  const [selected, setSelected] = useState(() => new Set(tabelaOptions));
  const [loading, setLoading]   = useState(false);
  const { toast } = useToast();

  const toggle = (t) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(t)) next.delete(t); else next.add(t);
    return next;
  });
  const allChecked = tabelaOptions.length > 0 && selected.size === tabelaOptions.length;

  const handleExport = async () => {
    setLoading(true);
    try {
      const base  = import.meta.env.VITE_API_URL || '/api';
      const qs    = [...selected].map(t => `tabelas[]=${encodeURIComponent(t)}`).join('&');
      const res   = await fetch(`${base}/equipamentos/export${qs ? '?' + qs : ''}`, { credentials: 'include' });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = `Equipamentos_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      onClose();
    } catch { toast('Erro ao exportar', 'error'); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 300 }}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Exportar para Excel</span>
          <button onClick={onClose} style={{ background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.7)',fontSize:'1.1rem',padding:'0 4px' }}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: 14 }}>
            Selecione as tabelas. Cada tabela será exportada em uma aba separada.
          </p>
          {tabelaOptions.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center', padding: '20px 0' }}>
              Nenhuma tabela com dados disponível.
            </div>
          ) : (
            <>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 10, fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', padding: '6px 10px', borderRadius: 7, background: 'var(--bg-app)' }}>
                <input type="checkbox" checked={allChecked}
                  onChange={() => setSelected(allChecked ? new Set() : new Set(tabelaOptions))}
                  style={{ accentColor: '#001F5B', width: 14, height: 14 }} />
                Selecionar todas
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
                {tabelaOptions.map(t => (
                  <label key={t} style={{
                    display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
                    fontSize: '0.82rem', color: 'var(--text-primary)',
                    padding: '7px 10px', borderRadius: 7,
                    background: selected.has(t) ? '#EFF6FF' : 'transparent',
                    border: `1px solid ${selected.has(t) ? '#BFDBFE' : 'transparent'}`,
                    transition: 'all 0.12s',
                  }}>
                    <input type="checkbox" checked={selected.has(t)} onChange={() => toggle(t)}
                      style={{ accentColor: '#001F5B', width: 14, height: 14, flexShrink: 0 }} />
                    {t}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-secondary">Cancelar</button>
          <button onClick={handleExport} disabled={selected.size === 0 || loading} className="btn"
            style={{ background: '#059669', color: '#fff', border: 'none' }}>
            {loading ? 'Exportando...' : `Exportar ${selected.size} aba${selected.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Compact Charts ─────────────────────────────────────────────────────── */
function CompactCharts({ data }) {
  if (!data.length) return null;

  const usinaCountMap = data.reduce((m, r) => {
    const usina = canonicalUsina(r.usina);
    if (usina) m.set(usina, (m.get(usina) || 0) + 1);
    return m;
  }, new Map());
  const byEquip = [...data.reduce((m, r) => { m.set(r.equipamento, (m.get(r.equipamento) || 0) + 1); return m; }, new Map()).entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 6);
  const simCount = data.filter(r => r.tem_sobressalente === 'Sim').length;
  const total = data.length;
  const simPct = total ? Math.round((simCount / total) * 100) : 0;
  const maxUsina = Math.max(1, ...usinaCountMap.values());
  const maxEquip = byEquip[0]?.[1] || 1;

  const ChartCard = ({ title, children }) => (
    <div style={{ background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border)', padding: '10px 14px', flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: '0.6rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-muted)', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>

      <ChartCard title="Registros por usina">
        {USINA_POLES.map((pole, pi) => {
          const poleUsinas = pole.usinas.filter(u => usinaCountMap.has(u));
          if (!poleUsinas.length) return null;
          return (
            <div key={pole.label}>
              {/* Polo header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: '0.56rem', fontWeight: 800, textTransform: 'uppercase',
                letterSpacing: '0.09em', color: pole.color,
                marginBottom: 4,
                marginTop: pi === 0 ? 0 : 8,
                paddingBottom: 3,
                borderBottom: `1px solid ${pole.color}30`,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: pole.color, flexShrink: 0, display: 'inline-block' }} />
                {pole.label}
              </div>
              {poleUsinas.map(usina => {
                const count = usinaCountMap.get(usina) || 0;
                return (
                  <div key={usina} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <div
                      title={usina}
                      style={{ fontSize: '0.63rem', color: 'var(--text-secondary)', width: 124, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {usina}
                    </div>
                    <div style={{ flex: 1, height: 5, background: 'var(--bg-app)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${(count / maxUsina) * 100}%`, height: '100%', background: pole.color, borderRadius: 3, transition: 'width 0.4s' }} />
                    </div>
                    <div style={{ fontSize: '0.61rem', fontWeight: 700, color: 'var(--text-muted)', width: 22, textAlign: 'right', flexShrink: 0 }}>{count}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </ChartCard>

      <ChartCard title="Tipos de equipamento">
        {byEquip.map(([equip, count]) => (
          <div key={equip} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
            <div style={{ fontSize: '0.64rem', color: 'var(--text-secondary)', width: 130, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{equip}</div>
            <div style={{ flex: 1, height: 5, background: 'var(--bg-app)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${(count / maxEquip) * 100}%`, height: '100%', background: '#059669', borderRadius: 3, transition: 'width 0.4s' }} />
            </div>
            <div style={{ fontSize: '0.61rem', fontWeight: 700, color: 'var(--text-muted)', width: 22, textAlign: 'right', flexShrink: 0 }}>{count}</div>
          </div>
        ))}
      </ChartCard>

      <ChartCard title="Sobressalentes">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingTop: 4 }}>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: '2.1rem', fontWeight: 900, color: '#059669', lineHeight: 1 }}>{simPct}%</div>
            <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginTop: 3 }}>com sobressalente</div>
          </div>
          <div style={{ flex: 1 }}>
            {[{ label: 'Sim', count: simCount, bg: '#D1FAE5', fg: '#059669', pct: simPct },
              { label: 'Não', count: total - simCount, bg: '#F1F5F9', fg: '#94A3B8', pct: 100 - simPct }].map(s => (
              <div key={s.label} style={{ marginBottom: 7 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: '0.62rem', fontWeight: 600, color: s.fg }}>{s.label}</span>
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, color: s.fg }}>{s.count}</span>
                </div>
                <div style={{ height: 5, background: s.bg, borderRadius: 3 }}>
                  <div style={{ width: `${s.pct}%`, height: '100%', background: s.fg, borderRadius: 3, transition: 'width 0.4s' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </ChartCard>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────────── */
export default function EquipamentosAdminPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData]               = useState([]);
  const [acesso, setAcesso]           = useState([]);
  const [myTabelas, setMyTabelas]     = useState([]); // tables this user can edit/import
  const [loading, setLoading]         = useState(true);
  const [modal, setModal]             = useState(null);
  const [importModal, setImportModal] = useState(false);
  const [exportModal, setExportModal] = useState(false);
  const [search, setSearch]           = useState('');
  const [filterUsina, setFilterUsina] = useState('');
  const [filterTabela, setFilterTabela] = useState('');
  const [deletingTabela, setDeletingTabela] = useState(null);
  const [expandedTabelas, setExpandedTabelas] = useState(new Set());
  const [newTableDropdown, setNewTableDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const canManage = ['admin', 'coordenador', 'planejador', 'gestor'].includes(user?.role) ||
    user?.email === 'julio.casagrande@ctgbr.com.br';
  const canCascadeDelete = ['admin', 'planejador'].includes(user?.role) ||
    user?.email === 'julio.casagrande@ctgbr.com.br';
  const canImport = myTabelas.length > 0;

  const load = async () => {
    try {
      const reqs = [api.get('/equipamentos'), api.get('/equipamentos/my-tabelas')];
      if (canManage) reqs.push(api.get('/equipamentos/acesso'));
      const [eRes, mtRes, aRes] = await Promise.all(reqs);
      setData((eRes.data || []).map(normalizeEquipamentoRow));
      setMyTabelas(mtRes.data);
      if (aRes) setAcesso(aRes.data);
    } catch {
      toast?.error?.('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setNewTableDropdown(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Per-tabela edit restrictions (no usina dimension)
  const editableCombos = useMemo(() => {
    if (canCascadeDelete) return null; // null = all editable
    if (!canManage) return { restricted: new Set(), allowed: new Set() };
    const restricted = new Set(acesso.filter(a => a.user_ids.length > 0).map(a => a.tipo_tabela));
    const allowed    = new Set(acesso.filter(a => (a.user_ids || []).includes(user?.id)).map(a => a.tipo_tabela));
    return { restricted, allowed };
  }, [acesso, user, canManage, canCascadeDelete]);

  const canEditRow = (row) => {
    if (!canManage) return false;
    if (editableCombos === null) return true;
    if (!editableCombos.restricted.has(row.tipo_tabela)) return true;
    return editableCombos.allowed.has(row.tipo_tabela);
  };

  const usinaOptions  = useMemo(() => {
    const used = new Set(data.map(d => canonicalUsina(d.usina)).filter(Boolean));
    const known = USINAS.filter(usina => used.has(usina));
    const unknown = [...used].filter(usina => !USINA_BY_KEY.has(normalizeUsinaKey(usina))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return [...known, ...unknown];
  }, [data]);
  const tabelaOptions = useMemo(() => [...new Set(data.map(d => d.tipo_tabela))].sort(), [data]);
  const equipOptions  = useMemo(() => [...new Set(data.map(d => d.equipamento))].sort(), [data]);

  // Tabelas the current canManage user can create new records in
  const editableTabelas = useMemo(() => {
    if (!canManage) return [];
    if (editableCombos === null) return tabelaOptions;
    return tabelaOptions.filter(t => !editableCombos.restricted.has(t) || editableCombos.allowed.has(t));
  }, [tabelaOptions, editableCombos, canManage]);

  const filtered = useMemo(() => {
    let rows = data;
    if (filterUsina)  rows = rows.filter(r => r.usina === filterUsina);
    if (filterTabela) rows = rows.filter(r => r.tipo_tabela === filterTabela);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.tag?.toLowerCase().includes(q) ||
        r.ug?.toLowerCase().includes(q) ||
        r.equipamento?.toLowerCase().includes(q) ||
        r.fabricante?.toLowerCase().includes(q) ||
        r.modelo?.toLowerCase().includes(q) ||
        r.num_serie?.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [data, search, filterUsina, filterTabela]);

  const groupedByTabela = useMemo(() => {
    const map = new Map();
    for (const row of filtered) {
      if (!map.has(row.tipo_tabela)) map.set(row.tipo_tabela, []);
      map.get(row.tipo_tabela).push(row);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [filtered]);

  const handleSave = async (form) => {
    const payload = normalizeEquipamentoRow(form);
    if (form.id) {
      const r = await api.put(`/equipamentos/${form.id}`, payload);
      setData(prev => prev.map(d => d.id === form.id ? normalizeEquipamentoRow(r.data) : d));
      toast?.success?.('Equipamento atualizado');
    } else {
      const r = await api.post('/equipamentos', payload);
      setData(prev => [...prev, normalizeEquipamentoRow(r.data)]);
      toast?.success?.('Equipamento criado');
    }
  };

  const handleDelete = async (id) => {
    await api.delete(`/equipamentos/${id}`);
    setData(prev => prev.filter(d => d.id !== id));
    toast?.success?.('Equipamento excluído');
  };

  const handleDeleteTabela = async (tipo_tabela) => {
    try {
      const r = await api.delete('/equipamentos/tabela', { data: { tipo_tabela } });
      setData(prev => prev.filter(d => d.tipo_tabela !== tipo_tabela));
      setAcesso(prev => prev.filter(a => a.tipo_tabela !== tipo_tabela));
      toast?.success?.(`Tabela "${tipo_tabela}" excluída — ${r.data.deleted} registros removidos`);
    } catch (err) {
      toast?.error?.('Erro ao excluir tabela: ' + (err.response?.data?.error || err.message));
    } finally {
      setDeletingTabela(null);
    }
  };


  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <div className="spinner" />
    </div>
  );

  return (
    <div style={{ paddingBottom: 40 }}>


      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        marginBottom: 20, padding: '12px 16px',
        background: 'var(--bg-card)', borderRadius: 12,
        border: '1px solid var(--border)',
        boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por TAG, equipamento, fabricante..."
          style={{
            flex: '1 1 220px', padding: '7px 11px', borderRadius: 8,
            border: '1px solid var(--border-strong)',
            background: 'var(--bg-app)', fontSize: '0.82rem',
            color: 'var(--text-primary)', outline: 'none',
            fontFamily: 'var(--font-body)',
          }}
        />

        <select value={filterUsina} onChange={e => setFilterUsina(e.target.value)}
          style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-app)', fontSize: '0.82rem', color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-body)', minWidth: 150 }}>
          <option value="">Todas as usinas</option>
          {usinaOptions.map(u => <option key={u} value={u}>{u}</option>)}
        </select>

        <select value={filterTabela} onChange={e => setFilterTabela(e.target.value)}
          style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-strong)', background: 'var(--bg-app)', fontSize: '0.82rem', color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-body)', minWidth: 140 }}>
          <option value="">Todas as tabelas</option>
          {tabelaOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0, marginLeft: 'auto' }}>
          {filtered.length} / {data.length} registros
        </span>

        <button onClick={() => setExportModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1.5px solid #10B981', background: '#fff', color: '#059669', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
          <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm7-13a1 1 0 011 1v4.586l1.707-1.707a1 1 0 111.414 1.414l-3.414 3.414a1 1 0 01-1.414 0l-3.414-3.414a1 1 0 111.414-1.414L9 9.586V5a1 1 0 011-1z" clipRule="evenodd"/></svg>
          Exportar
        </button>

        {canImport && (
          <button onClick={() => setImportModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1.5px solid #0b5cab', background: '#fff', color: '#0b5cab', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
            <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"/></svg>
            Importar
          </button>
        )}

        {canManage && (
          <>
            {/* Novo — single table: open modal directly; multiple: show dropdown */}
            <div ref={dropdownRef} style={{ position: 'relative', flexShrink: 0 }}>
              <button
                onClick={() => {
                  if (editableTabelas.length === 1) {
                    setModal({ ...EMPTY, tipo_tabela: editableTabelas[0] });
                  } else {
                    setNewTableDropdown(v => !v);
                  }
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#001F5B,#0b5cab)', color: '#fff', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(11,92,171,0.25)' }}
              >
                <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd"/></svg>
                Novo
                {editableTabelas.length > 1 && (
                  <svg viewBox="0 0 16 16" fill="currentColor" width="10" height="10" style={{ marginLeft: 1 }}>
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
              {newTableDropdown && editableTabelas.length > 1 && (
                <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 200, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', minWidth: 200, overflow: 'hidden' }}>
                  <div style={{ padding: '7px 12px', fontSize: '0.62rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border)' }}>
                    Selecionar tabela
                  </div>
                  {editableTabelas.map(t => (
                    <button
                      key={t}
                      onClick={() => { setModal({ ...EMPTY, tipo_tabela: t }); setNewTableDropdown(false); }}
                      style={{ width: '100%', textAlign: 'left', padding: '9px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', display: 'block' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-app)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Charts ───────────────────────────────────────────────────────── */}
      <CompactCharts data={filtered} />

      {/* ── Grouped collapsible tables ────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border)',
          padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem',
        }}>
          {data.length === 0
            ? 'Nenhum equipamento cadastrado. Importe um arquivo Excel para começar.'
            : 'Nenhum registro encontrado para os filtros aplicados.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {groupedByTabela.map(([tipoTabela, rows]) => {
            const isCollapsed = !expandedTabelas.has(tipoTabela);
            const toggle = () => setExpandedTabelas(prev => {
              const next = new Set(prev);
              if (next.has(tipoTabela)) next.delete(tipoTabela);
              else next.add(tipoTabela);
              return next;
            });
            const usinaCount = new Set(rows.map(r => r.usina)).size;
            const equipCount = new Set(rows.map(r => r.equipamento)).size;
            const isDeleting = deletingTabela === tipoTabela;

            return (
              <div key={tipoTabela} style={{
                background: 'var(--bg-card)', borderRadius: 12,
                border: '1px solid var(--border)',
                boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                overflow: 'hidden',
              }}>
                {/* Section header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 16px',
                  background: 'var(--ctg-navy)',
                  cursor: 'pointer',
                  userSelect: 'none',
                }} onClick={toggle}>
                  {/* Chevron */}
                  <span style={{
                    color: 'rgba(255,255,255,0.6)', flexShrink: 0,
                    transition: 'transform 0.18s',
                    display: 'flex',
                    transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                  }}>
                    <svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12">
                      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>

                  {/* Table name */}
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#fff', flex: 1 }}>
                    {tipoTabela}
                  </span>

                  {/* Stats chips */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    {[
                      { label: 'usinas',      value: usinaCount },
                      { label: 'tipos',       value: equipCount },
                      { label: 'registros',   value: rows.length },
                    ].map(({ label, value }) => (
                      <span key={label} style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '3px 9px', borderRadius: 20,
                        background: 'rgba(255,255,255,0.12)',
                        fontSize: '0.68rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)',
                        whiteSpace: 'nowrap',
                      }}>
                        <strong style={{ fontSize: '0.78rem', color: '#fff' }}>{value}</strong>
                        {label}
                      </span>
                    ))}
                  </div>

                  {/* Delete button (cascade) */}
                  {canCascadeDelete && (
                    <div style={{ flexShrink: 0, marginLeft: 4 }} onClick={e => e.stopPropagation()}>
                      {isDeleting ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: '0.7rem', color: '#FCA5A5', fontWeight: 600 }}>Confirmar?</span>
                          <button
                            onClick={() => handleDeleteTabela(tipoTabela)}
                            style={{ padding: '3px 9px', borderRadius: 5, border: 'none', background: '#DC2626', color: '#fff', fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                          >
                            Sim
                          </button>
                          <button
                            onClick={() => setDeletingTabela(null)}
                            style={{ padding: '3px 9px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.25)', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: '0.7rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
                          >
                            Não
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeletingTabela(tipoTabela)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', borderRadius: 6,
                            border: '1px solid rgba(252,165,165,0.5)',
                            background: 'rgba(220,38,38,0.18)',
                            color: '#FCA5A5', fontWeight: 700, fontSize: '0.7rem',
                            cursor: 'pointer', fontFamily: 'var(--font-body)',
                          }}
                          title={`Excluir tabela "${tipoTabela}" em cascata`}
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor" width="11" height="11">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/>
                          </svg>
                          Excluir tabela
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Table body */}
                {!isCollapsed && (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '2px solid var(--border)' }}>
                          {['Usina', 'Equipamento', 'UG', 'TAG', 'Fabricante', 'Modelo', 'Nº Série', 'Sobress.', 'Qtd.', 'Ano', 'Link', ''].map(h => (
                            <th key={h} style={{
                              padding: '7px 12px', textAlign: 'left',
                              fontSize: '0.62rem', fontWeight: 700,
                              textTransform: 'uppercase', letterSpacing: '0.08em',
                              color: 'var(--text-muted)', whiteSpace: 'nowrap',
                            }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr
                            key={row.id}
                            style={{
                              background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)',
                              borderBottom: '1px solid var(--border)',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--budget-bg)'}
                            onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)'}
                          >
                            <td style={{ padding: '7px 12px', fontSize: '0.78rem', fontWeight: 600, color: 'var(--ctg-navy)', whiteSpace: 'nowrap' }}>
                              {row.usina}
                            </td>
                            <td style={{ padding: '7px 12px', fontSize: '0.78rem', color: 'var(--text-primary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {row.equipamento}
                            </td>
                            <td style={{ padding: '7px 12px', fontSize: '0.76rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              {row.ug}
                            </td>
                            <td style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>
                              <span style={{
                                display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                                background: '#EFF6FF', color: '#1D4ED8',
                                fontSize: '0.73rem', fontWeight: 700,
                                border: '1px solid #BFDBFE',
                              }}>
                                {row.tag}
                              </span>
                            </td>
                            <td style={{ padding: '7px 12px', fontSize: '0.76rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              {row.fabricante || <span style={{ opacity: 0.35 }}>—</span>}
                            </td>
                            <td style={{ padding: '7px 12px', fontSize: '0.76rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              {row.modelo || <span style={{ opacity: 0.35 }}>—</span>}
                            </td>
                            <td style={{ padding: '7px 12px', fontSize: '0.73rem', color: 'var(--text-muted)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                              {row.num_serie || <span style={{ opacity: 0.35 }}>—</span>}
                            </td>
                            <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-block', padding: '2px 7px', borderRadius: 5,
                                fontSize: '0.68rem', fontWeight: 700,
                                background: row.tem_sobressalente === 'Sim' ? '#D1FAE5' : '#F1F5F9',
                                color: row.tem_sobressalente === 'Sim' ? '#065F46' : '#64748B',
                              }}>
                                {row.tem_sobressalente || 'Não'}
                              </span>
                            </td>
                            <td style={{ padding: '7px 12px', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                              {row.quantos ?? '—'}
                            </td>
                            <td style={{ padding: '7px 12px', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                              {row.ano || '—'}
                            </td>
                            <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                              {row.url_imagem ? (
                                <a href={row.url_imagem} target="_blank" rel="noopener noreferrer"
                                  style={{ color: 'var(--ctg-blue)', textDecoration: 'none', fontSize: '0.75rem', fontWeight: 600 }}
                                  title="Abrir arquivo">
                                  🔗
                                </a>
                              ) : (
                                <span style={{ opacity: 0.3, fontSize: '0.75rem' }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: '7px 8px', textAlign: 'center' }}>
                              {canEditRow(row) && (
                                <button
                                  onClick={() => setModal(row)}
                                  style={{
                                    background: 'none', border: '1px solid var(--border-strong)',
                                    borderRadius: 6, cursor: 'pointer', padding: '3px 9px',
                                    fontSize: '0.72rem', color: 'var(--text-secondary)',
                                    fontFamily: 'var(--font-body)',
                                  }}
                                >
                                  Editar
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modals ───────────────────────────────────────────────────────── */}
      {modal && (
        <EquipamentoModal
          item={modal === 'new' ? null : modal}
          equipOptions={equipOptions}
          tabelaOptions={tabelaOptions}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModal(null)}
        />
      )}
      {importModal && (
        <ImportModal
          onClose={() => setImportModal(false)}
          onImported={load}
          myTabelas={myTabelas}
        />
      )}
      {exportModal && (
        <ExportModal
          onClose={() => setExportModal(false)}
          tabelaOptions={tabelaOptions}
        />
      )}
    </div>
  );
}
