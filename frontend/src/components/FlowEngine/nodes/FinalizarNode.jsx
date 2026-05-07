import { Handle, Position } from 'reactflow';

export function FinalizarNode({ data, selected }) {
  return (
    <div style={{
      background: selected ? '#991b1b' : '#dc2626',
      color: '#fff', borderRadius: 10, padding: '12px 16px',
      minWidth: 170, border: selected ? '2px solid #fca5a5' : '2px solid #ef4444',
      boxShadow: '0 2px 8px rgba(220,38,38,.3)',
    }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>🏁 Finalizar</div>
      <div style={{ fontSize: 11, opacity: .85 }}>
        {data.config?.motivo || 'Encerra o fluxo'}
      </div>
    </div>
  );
}
