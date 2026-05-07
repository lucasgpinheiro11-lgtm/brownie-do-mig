const NODES = [
  { tipo: 'gatilho',   icon: '🎯', label: 'Gatilho',   desc: 'Inicia o fluxo',      color: '#2563eb' },
  { tipo: 'mensagem',  icon: '💬', label: 'Mensagem',  desc: 'Envia mensagem WA',   color: '#16a34a' },
  { tipo: 'condicao',  icon: '🔀', label: 'Condição',  desc: 'Ramificação Sim/Não', color: '#ea580c' },
  { tipo: 'espera',    icon: '⏳', label: 'Espera',    desc: 'Aguarda um intervalo', color: '#ca8a04' },
  { tipo: 'finalizar', icon: '🏁', label: 'Finalizar', desc: 'Encerra o fluxo',     color: '#dc2626' },
];

export function NodePalette({ onAddNode }) {
  function handleDragStart(e, tipo) {
    e.dataTransfer.setData('application/reactflow-type', tipo);
    e.dataTransfer.effectAllowed = 'move';
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: '#374151' }}>
        Nós disponíveis
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {NODES.map(n => (
          <div
            key={n.tipo}
            draggable
            onDragStart={e => handleDragStart(e, n.tipo)}
            onClick={() => onAddNode && onAddNode(n.tipo)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#fff', border: `2px solid ${n.color}`,
              borderRadius: 8, padding: '8px 12px', cursor: 'grab',
              userSelect: 'none', transition: 'transform .1s',
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(.97)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <span style={{ fontSize: 18 }}>{n.icon}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 12, color: n.color }}>{n.label}</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>{n.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, fontSize: 11, color: '#9ca3af', lineHeight: 1.4 }}>
        Arraste para o canvas ou clique para adicionar ao centro.
      </div>
    </div>
  );
}
