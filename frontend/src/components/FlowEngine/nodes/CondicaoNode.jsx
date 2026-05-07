import { Handle, Position } from 'reactflow';

export function CondicaoNode({ data, selected }) {
  return (
    <div style={{
      background: selected ? '#c2410c' : '#ea580c',
      color: '#fff', borderRadius: 10, padding: '12px 16px',
      minWidth: 190, border: selected ? '2px solid #fdba74' : '2px solid #f97316',
      boxShadow: '0 2px 8px rgba(234,88,12,.3)',
    }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>🔀 Condição</div>
      <div style={{ fontSize: 11, opacity: .85 }}>
        {data.config?.variavel
          ? `${data.config.variavel} ${data.config.operador} ${data.config.valor}`
          : 'Clique para configurar'}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, opacity: .8 }}>
        <span>✅ Sim</span>
        <span>❌ Não</span>
      </div>
      <Handle type="source" position={Position.Bottom} id="sim" style={{ left: '30%' }} />
      <Handle type="source" position={Position.Bottom} id="nao" style={{ left: '70%' }} />
    </div>
  );
}
