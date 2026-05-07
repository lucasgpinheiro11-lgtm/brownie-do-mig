import { Handle, Position } from 'reactflow';

export function GatilhoNode({ data, selected }) {
  return (
    <div style={{
      background: selected ? '#1d4ed8' : '#2563eb',
      color: '#fff', borderRadius: 10, padding: '12px 16px',
      minWidth: 180, border: selected ? '2px solid #93c5fd' : '2px solid #3b82f6',
      boxShadow: '0 2px 8px rgba(37,99,235,.3)',
    }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>🎯 Gatilho</div>
      <div style={{ fontSize: 12, opacity: .85 }}>{data.label || 'Início do fluxo'}</div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
