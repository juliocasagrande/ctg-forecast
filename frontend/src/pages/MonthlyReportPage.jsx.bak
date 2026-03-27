import { useState, useRef } from 'react';
import api from '../utils/api.js';

const MESES = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
];

const currentYear = new Date().getFullYear();
const ANOS = [currentYear - 1, currentYear, currentYear + 1].map(String);

export default function MonthlyReportPage() {
  const [file, setFile]         = useState(null);
  const [mes, setMes]           = useState(MESES[new Date().getMonth()]);
  const [ano, setAno]           = useState(String(currentYear));
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [success, setSuccess]   = useState(false);
  const inputRef                = useRef(null);
  const dropRef                 = useRef(null);
  const [dragging, setDragging] = useState(false);

  function handleFile(f) {
    if (!f) return;
    const ext = f.name.toLowerCase();
    if (!ext.endsWith('.xlsx') && !ext.endsWith('.xls')) {
      setError('Apenas arquivos Excel (.xlsx ou .xls) são aceitos.');
      return;
    }
    setError(null);
    setSuccess(false);
    setFile(f);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  }

  async function handleGenerate() {
    if (!file) { setError('Selecione um arquivo Excel.'); return; }
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const form = new FormData();
      form.append('excel', file);
      form.append('mes', mes);
      form.append('ano', ano);

      const response = await api.post('/monthly-report/generate', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        responseType: 'blob',
      });

      // Dispara download do HTML
      const blob = new Blob([response.data], { type: 'text/html' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `Relatorio_Acompanhamento_${mes}_${ano}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setSuccess(true);
    } catch (err) {
      let errorMsg = 'Erro ao gerar relatório. Verifique o arquivo e tente novamente.';
      try {
        // Com responseType:'blob', err.response.data é um Blob — precisa de .text() com await
        const raw = err.response?.data instanceof Blob
          ? await err.response.data.text()
          : err.response?.data;
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (parsed?.error) errorMsg = parsed.error;
      } catch (_) { /* mantém a mensagem genérica */ }
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '32px 24px' }}>

      {/* Cabeçalho */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'linear-gradient(135deg, #0b5cab22, #00AEEF18)',
            border: '1.5px solid #0b5cab33',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#0b5cab" strokeWidth="1.8" width="22" height="22">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
            </svg>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 700, color: '#0f172a' }}>
              Relatório de Acompanhamento Mensal
            </h1>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
              Carregue a planilha de dados para gerar o relatório HTML interativo
            </p>
          </div>
        </div>
      </div>

      {/* Card principal */}
      <div style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 16,
        padding: 32,
        boxShadow: '0 2px 12px rgba(15,23,42,0.06)',
      }}>

        {/* Seleção de mês e ano */}
        <div style={{ marginBottom: 28 }}>
          <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 10 }}>
            Período do Relatório
          </label>
          <div style={{ display: 'flex', gap: 12 }}>
            <select
              value={mes}
              onChange={e => setMes(e.target.value)}
              style={{
                flex: 2, padding: '10px 14px', borderRadius: 10,
                border: '1.5px solid #d1d5db', fontSize: '0.9rem',
                background: '#f9fafb', color: '#0f172a', outline: 'none',
                cursor: 'pointer',
              }}
            >
              {MESES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select
              value={ano}
              onChange={e => setAno(e.target.value)}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 10,
                border: '1.5px solid #d1d5db', fontSize: '0.9rem',
                background: '#f9fafb', color: '#0f172a', outline: 'none',
                cursor: 'pointer',
              }}
            >
              {ANOS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        {/* Área de upload */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: 10 }}>
            Planilha de Dados (.xlsx)
          </label>

          <div
            ref={dropRef}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? '#0b5cab' : file ? '#10b981' : '#cbd5e1'}`,
              borderRadius: 12,
              padding: '36px 24px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragging ? '#eff6ff' : file ? '#f0fdf4' : '#f8fafc',
              transition: 'all 0.2s',
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files?.[0])}
            />

            {file ? (
              <div>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>✅</div>
                <div style={{ fontWeight: 600, color: '#065f46', fontSize: '0.95rem' }}>{file.name}</div>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>
                  {(file.size / 1024).toFixed(1)} KB — clique para trocar
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '2.2rem', marginBottom: 8 }}>📊</div>
                <div style={{ fontWeight: 600, color: '#374151', fontSize: '0.95rem' }}>
                  Arraste o arquivo Excel aqui
                </div>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 4 }}>
                  ou clique para selecionar — .xlsx, .xls (máx. 20 MB)
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Erro */}
        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 10, padding: '12px 16px', marginBottom: 20,
            fontSize: '0.85rem', color: '#b91c1c',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Sucesso */}
        {success && (
          <div style={{
            background: '#f0fdf4', border: '1px solid #bbf7d0',
            borderRadius: 10, padding: '12px 16px', marginBottom: 20,
            fontSize: '0.85rem', color: '#065f46',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            ✅ Relatório gerado com sucesso! O download iniciou automaticamente.
          </div>
        )}

        {/* Botão */}
        <button
          onClick={handleGenerate}
          disabled={loading || !file}
          style={{
            width: '100%',
            padding: '13px 24px',
            borderRadius: 10,
            border: 'none',
            background: loading || !file
              ? '#94a3b8'
              : 'linear-gradient(135deg, #0b5cab, #0284c7)',
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.95rem',
            cursor: loading || !file ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            transition: 'all 0.2s',
          }}
        >
          {loading ? (
            <>
              <span style={{
                width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)',
                borderTopColor: '#fff', borderRadius: '50%',
                animation: 'spin 0.8s linear infinite', display: 'inline-block',
              }} />
              Gerando relatório...
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                <path d="M12 5v14M5 12l7 7 7-7"/>
              </svg>
              Gerar e Baixar Relatório HTML
            </>
          )}
        </button>

        {/* Info */}
        <div style={{
          marginTop: 20, padding: '14px 16px',
          background: '#f0f9ff', border: '1px solid #bae6fd',
          borderRadius: 10, fontSize: '0.8rem', color: '#0369a1',
          lineHeight: 1.6,
        }}>
          <strong>Como funciona:</strong> o sistema lê a planilha Excel com os dados de projetos e gera
          um relatório HTML interativo com filtros por usina e disciplina, tabela de vencimentos e
          cards detalhados por projeto — idêntico ao relatório Python, mas direto pelo sistema.
        </div>
      </div>

      {/* Estrutura esperada da planilha */}
      <div style={{
        marginTop: 24, background: '#fff',
        border: '1px solid #e2e8f0', borderRadius: 16,
        padding: '20px 24px',
      }}>
        <h3 style={{ margin: '0 0 14px', fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>
          📋 Colunas esperadas na planilha
        </h3>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 8,
        }}>
          {[
            'UHE', 'Área', 'Projeto/Atividade', 'Projeto', 'Fornecedor', 'Gestor',
            'PP/Contrato', 'Vencimento', 'Valor Contrato', 'Realizado Contrato',
            'Saldo Contrato', 'Valor SI', 'Realizado SI', 'Saldo SI',
            'Resumo', 'Natureza', 'Empresa', 'Reajustes', 'Aditivos',
            'Aditivo em Andamento', 'Cronograma',
          ].map(col => (
            <div key={col} style={{
              padding: '5px 10px', background: '#f8fafc',
              border: '1px solid #e2e8f0', borderRadius: 6,
              fontSize: '0.75rem', color: '#475569', fontFamily: 'monospace',
            }}>
              {col}
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
