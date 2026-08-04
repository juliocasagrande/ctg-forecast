export default function ControleDesenhosPage() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', textAlign: 'center', color: 'var(--text-muted)',
    }}>
      <div style={{ fontSize: '2.4rem', marginBottom: 12 }}>📐</div>
      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
        Controle de Desenhos
      </div>
      <div style={{ fontSize: '0.85rem', maxWidth: 360 }}>
        Esta página ainda está em construção.
      </div>
    </div>
  );
}
