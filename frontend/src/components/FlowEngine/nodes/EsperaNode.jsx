import { Handle, Position } from 'reactflow';

export function EsperaNode({ data, selected }) {
  return (
    <div style={{
      background: selected ? '#a16207' : '#ca8a04',
      color: '#fff', borderRadius: 10, padding: '12px 16px',
      minWidth: 170, border: selected ? '2px solid #fde047' : '2px solid #eab308',
      boxShadow: '0 2px 8px rgba(202,138,4,.3)',
    }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>⏳ Espera</div>
      <div style={{ fontSize: 11, opacity: .85 }}>
        {data.config?.horas ? `${data.config.horas}h de intervalo` : 'Clique para configurar'}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
