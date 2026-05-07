import { Handle, Position } from 'reactflow';

export function MensagemNode({ data, selected }) {
  return (
    <div style={{
      background: selected ? '#15803d' : '#16a34a',
      color: '#fff', borderRadius: 10, padding: '12px 16px',
      minWidth: 200, border: selected ? '2px solid #86efac' : '2px solid #22c55e',
      boxShadow: '0 2px 8px rgba(22,163,74,.3)',
    }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>💬 Mensagem</div>
      <div style={{ fontSize: 11, opacity: .85, maxWidth: 200, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {data.config?.texto ? data.config.texto.slice(0, 80) + (data.config.texto.length > 80 ? '…' : '') : 'Clique para configurar'}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
