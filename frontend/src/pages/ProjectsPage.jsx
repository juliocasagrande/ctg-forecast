import { useState } from 'react';
import { formatBRLShort } from '../utils/format.js';
import ProjectsList from '../components/ProjectsList.jsx';
import { useRole } from '../context/AuthContext.jsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';

const fmt = formatBRLShort;

const ALL_PLANTS = [
  'PCH Palmeiras','PCH Retiro','UHE Canoas 1','UHE Canoas 2',
  'UHE Capivara','UHE Chavantes','UHE Garibaldi','UHE Ilha Solteira',
  'UHE Jupiá','UHE Jurumirim','UHE Rosana','UHE Salto',
  'UHE Salto Grande','UHE Taquaruçu',
];

function SummaryCard({ title, subtitle, projects, onClick, selected }) {
  const budget   = projects.reduce((s, p) => s + parseFloat(p.total_budget   || 0), 0);
  const forecast = projects.reduce((s, p) => s + parseFloat(p.total_forecast || 0), 0);
  const actual   = projects.reduce((s, p) => s + parseFloat(p.total_actual   || 0), 0);
  if (projects.length === 0) return null;

  return (
    <div onClick={onClick} style={{
      background: selected ? 'var(--ctg-navy)' : 'var(--bg-card)',
      border: `2px solid ${selected ? 'var(--ctg-blue)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)', padding: '14px 16px',
      cursor: 'pointer', transition: 'all 0.18s',
    }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, color: selected ? 'var(--ctg-accent)' : 'var(--ctg-blue)' }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: '0.65rem', color: selected ? 'rgba(255,255,255,0.5)' : 'var(--text-muted)', marginBottom: 2 }}>{subtitle}</div>
      )}
      <div style={{ fontSize: '0.68rem', fontWeight: 600, color: selected ? 'rgba(255,255,255,0.5)' : 'var(--text-muted)', marginBottom: 10 }}>
        {projects.length} projeto{projects.length !== 1 ? 's' : ''}
      </div>
      {[
        { label: 'Budget',   value: budget,   color: selected ? '#BFDBFE' : 'var(--budget-text)' },
        { label: 'Forecast', value: forecast, color: selected ? '#86EFAC' : 'var(--forecast-text)' },
        { label: 'Real',     value: actual,   color: selected ? '#FCD34D' : 'var(--actual-text)' },
      ].map(s => (
        <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.65rem', color: selected ? 'rgba(255,255,255,0.5)' : 'var(--text-muted)' }}>{s.label}</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>{fmt(s.value)}</span>
        </div>
      ))}
    </div>
  );
}

// plantFilter = array of plant names from header dropdown (empty = show all)
export default function ProjectsPage({ projects, period, plantFilter = [], onEditProject, onProjectsChange }) {
  const { isEngenheiro } = useRole();
  const [view, setView]                     = useState('list');
  const [selectedPlant, setSelectedPlant]     = useState(null);
  const [selectedEngineer, setSelectedEngineer] = useState(null);

  const periodLabel = period.start === period.end
    ? `${period.start}`
    : `${period.start}–${period.end}`;

  // Apply header plant filter first
  const headerFiltered = plantFilter.length > 0
    ? projects.filter(p => plantFilter.some(f => (p.plants || []).includes(f)))
    : projects;

  // ── Plants view data ──
  const activePlants = ALL_PLANTS.filter(pl =>
    headerFiltered.some(p => (p.plants || []).includes(pl))
  );

  const plantChartData = activePlants.map(pl => {
    const pjs = headerFiltered.filter(p => (p.plants || []).includes(pl));
    return {
      name:      pl.replace('UHE ', '').replace('PCH ', ''),
      Budget:    pjs.reduce((s, p) => s + parseFloat(p.total_budget   || 0), 0),
      Forecast:  pjs.reduce((s, p) => s + parseFloat(p.total_forecast || 0), 0),
      Realizado: pjs.reduce((s, p) => s + parseFloat(p.total_actual   || 0), 0),
    };
  }).filter(d => d.Budget > 0 || d.Forecast > 0);

  // ── Engineers view data ──
  const engineerMap = {};
  headerFiltered.forEach(p => {
    const names = p.engineer_names ? p.engineer_names.split(', ') : [];
    const initials = p.engineer_initials ? p.engineer_initials.split(', ') : [];
    if (names.length === 0) {
      if (!engineerMap['__none__']) engineerMap['__none__'] = { name: 'Sem engenheiro', initials: '?', projects: [] };
      engineerMap['__none__'].projects.push(p);
    } else {
      names.forEach((name, i) => {
        if (!engineerMap[name]) engineerMap[name] = { name, initials: initials[i] || name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(), projects: [] };
        engineerMap[name].projects.push(p);
      });
    }
  });
  const engineers = Object.values(engineerMap).sort((a, b) => a.name.localeCompare(b.name));

  const engChartData = engineers.filter(e => e.name !== 'Sem engenheiro').map(e => ({
    name: e.name.split(' ').slice(0,2).join(' '),
    Budget:    e.projects.reduce((s, p) => s + parseFloat(p.total_budget   || 0), 0),
    Forecast:  e.projects.reduce((s, p) => s + parseFloat(p.total_forecast || 0), 0),
    Realizado: e.projects.reduce((s, p) => s + parseFloat(p.total_actual   || 0), 0),
  })).filter(d => d.Budget > 0 || d.Forecast > 0);

  // ── Final list filter ──
  let finalProjects = headerFiltered;
  if (view === 'plants' && selectedPlant) {
    finalProjects = headerFiltered.filter(p => (p.plants || []).includes(selectedPlant));
  } else if (view === 'engineers' && selectedEngineer) {
    const eng = engineerMap[selectedEngineer];
    finalProjects = eng ? eng.projects : headerFiltered;
  }

  return (
    <div>
      {/* View toggle */}
      <div style={{ marginBottom: 20 }}>
        <div className="tabs" style={{ marginBottom: 0, width: 'fit-content' }}>
          {[
            { id: 'list',      label: 'Lista de Projetos' },
            { id: 'plants',    label: 'Por Usina' },
            ...(!isEngenheiro ? [{ id: 'engineers', label: 'Por Engenheiro' }] : []),
          ].map(tab => (
            <button key={tab.id}
              className={`tab-btn ${view === tab.id ? 'active' : ''}`}
              onClick={() => { setView(tab.id); setSelectedPlant(null); setSelectedEngineer(null); }}
            >{tab.label}</button>
          ))}
        </div>
      </div>

      {/* List view */}
      {view === 'list' && (
        <ProjectsList
          projects={finalProjects}
          onEditProject={onEditProject}
          onProjectsChange={onProjectsChange}
        />
      )}

      {/* Plants view */}
      {view === 'plants' && (
        <div>
          {activePlants.length === 0 ? (
            <div className="empty-state">
              <h3>Nenhum projeto com usina cadastrada</h3>
              <p>Edite os projetos e selecione as usinas que eles atendem.</p>
            </div>
          ) : (
            <>
              {plantChartData.length > 0 && (
                <div className="card" style={{ marginBottom: 20 }}>
                  <div className="card-header" style={{ background: 'var(--ctg-navy)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0' }}>
                    <span className="card-title" style={{ color: '#fff' }}>
                      Forecast por Usina — {periodLabel}
                    </span>
                  </div>
                  <div className="card-body">
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={plantChartData} margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} angle={-30} textAnchor="end" interval={0} />
                        <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: '#374151' }} width={72} />
                        <Tooltip formatter={v => fmt(v)} />
                        <Legend />
                        <Bar dataKey="Budget"    fill="#16A34A" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="Forecast"  fill="#38BDF8" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="Realizado" fill="#2563EB" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
                {activePlants.map(pl => {
                  const pjs = headerFiltered.filter(p => (p.plants || []).includes(pl));
                  return (
                    <SummaryCard key={pl} title={pl} projects={pjs}
                      selected={selectedPlant === pl}
                      onClick={() => setSelectedPlant(selectedPlant === pl ? null : pl)}
                    />
                  );
                })}
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                {selectedPlant ? `Projetos — ${selectedPlant}` : 'Todos os Projetos'}
              </div>
              <ProjectsList projects={finalProjects} onEditProject={onEditProject} onProjectsChange={onProjectsChange} />
            </>
          )}
        </div>
      )}

      {/* Engineers view */}
      {view === 'engineers' && (
        <div>
          {engineers.length === 0 ? (
            <div className="empty-state">
              <h3>Nenhum engenheiro designado</h3>
              <p>Edite os projetos e designe os engenheiros responsáveis.</p>
            </div>
          ) : (
            <>
              {engChartData.length > 0 && (
                <div className="card" style={{ marginBottom: 20 }}>
                  <div className="card-header" style={{ background: 'var(--ctg-navy)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0' }}>
                    <span className="card-title" style={{ color: '#fff' }}>
                      Forecast por Engenheiro — {periodLabel}
                    </span>
                  </div>
                  <div className="card-body">
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={engChartData} margin={{ top: 4, right: 8, left: 0, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#374151' }} angle={-15} textAnchor="end" interval={0} />
                        <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: '#374151' }} width={72} />
                        <Tooltip formatter={v => fmt(v)} />
                        <Legend />
                        <Bar dataKey="Budget"    fill="#16A34A" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="Forecast"  fill="#38BDF8" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="Realizado" fill="#2563EB" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
                {engineers.map(eng => (
                  <SummaryCard key={eng.name} title={eng.name}
                    subtitle={eng.name === 'Sem engenheiro' ? undefined : eng.initials}
                    projects={eng.projects}
                    selected={selectedEngineer === eng.name}
                    onClick={() => setSelectedEngineer(selectedEngineer === eng.name ? null : eng.name)}
                  />
                ))}
              </div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
                {selectedEngineer ? `Projetos — ${selectedEngineer}` : 'Todos os Projetos'}
              </div>
              <ProjectsList projects={finalProjects} onEditProject={onEditProject} onProjectsChange={onProjectsChange} />
            </>
          )}
        </div>
      )}
    </div>
  );
}