import { useState } from 'react';
import { flowService } from '../../services/flowService.js';

const STATUS_COLOR = {
  em_andamento: '#2563eb',
  concluido:    '#16a34a',
  erro:         '#dc2626',
  pausado:      '#ca8a04',
};

function ExecucoesModal({ flow, execucoes, onClose }) {
  const mine = execucoes.filter(e => e.flow_id === flow.id);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 560, maxHeight: '80vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>📋 Execuções — {flow.nome}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        {mine.length === 0
          ? <p style={{ color: '#9ca3af', fontSize: 13 }}>Nenhuma execução registrada.</p>
          : mine.map(e => (
            <div key={e.id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{e.card_nome || e.card_id}</span>
                <span style={{ fontSize: 11, color: STATUS_COLOR[e.status] || '#374151', fontWeight: 700 }}>
                  {e.status}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>
                Iniciado: {new Date(e.iniciado_em).toLocaleString('pt-BR')}
                {e.proximo_disparo && ` · Próximo: ${new Date(e.proximo_disparo).toLocaleString('pt-BR')}`}
              </div>
              {(e.historico || []).length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11 }}>
                  {e.historico.map((h, i) => (
                    <div key={i} style={{ color: '#374151', padding: '2px 0' }}>
                      <span style={{ color: '#9ca3af' }}>{new Date(h.executado_em).toLocaleString('pt-BR')}</span>
                      {' · '}<strong>{h.no_id}</strong>{' → '}{h.resultado}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        }
      </div>
    </div>
  );
}

export function FlowList({ flows, execucoes, selected, onSelect, onToggle, onDelete, onNew, onExecutarAgora, loading }) {
  const [execModal, setExecModal] = useState(null);

  async function handleToggle(flow) {
    await flowService.toggle(flow.id);
    onToggle();
  }

  async function handleDelete(flow) {
    if (!confirm(`Remover o fluxo "${flow.nome}"?`)) return;
    await flowService.deletar(flow.id);
    onDelete(flow.id);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>Fluxos de Cobrança</span>
          <button onClick={onNew} style={btnPrimary}>+ Novo</button>
        </div>
        <button onClick={onExecutarAgora} disabled={loading} style={{ ...btnOutline, width: '100%' }}>
          {loading ? 'Executando…' : '▶ Executar agora'}
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
        {flows.length === 0 && (
          <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', marginTop: 24 }}>
            Nenhum fluxo criado ainda.
          </p>
        )}
        {flows.map(flow => (
          <div
            key={flow.id}
            onClick={() => onSelect(flow)}
            style={{
              border: selected?.id === flow.id ? '2px solid #2563eb' : '1px solid #e5e7eb',
              borderRadius: 10, padding: 12, marginBottom: 8, cursor: 'pointer',
              background: selected?.id === flow.id ? '#eff6ff' : '#fff',
              transition: 'all .15s',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{flow.nome}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12,
                background: flow.ativo ? '#dcfce7' : '#f3f4f6',
                color: flow.ativo ? '#16a34a' : '#9ca3af',
              }}>
                {flow.ativo ? 'ATIVO' : 'INATIVO'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
              {flow.gatilho?.tipo
                ? `Gatilho: ${flow.gatilho.tipo.replace(/_/g, ' ')}`
                : 'Sem gatilho configurado'}
              {' · '}
              {(flow.nos || []).length} nó(s)
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }} onClick={e => e.stopPropagation()}>
              <button onClick={() => handleToggle(flow)} style={btnSmall}>
                {flow.ativo ? '⏸ Desativar' : '▶ Ativar'}
              </button>
              <button onClick={() => setExecModal(flow)} style={btnSmall}>
                📋 Logs ({execucoes.filter(e => e.flow_id === flow.id).length})
              </button>
              <button onClick={() => handleDelete(flow)} style={{ ...btnSmall, color: '#dc2626', borderColor: '#fca5a5' }}>
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>

      {execModal && (
        <ExecucoesModal flow={execModal} execucoes={execucoes} onClose={() => setExecModal(null)} />
      )}
    </div>
  );
}

const btnPrimary = { padding: '6px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, fontWeight: 700, fontSize: 12, cursor: 'pointer' };
const btnOutline = { padding: '6px 14px', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 7, fontWeight: 600, fontSize: 12, cursor: 'pointer' };
const btnSmall   = { padding: '4px 10px', background: '#f9fafb', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 11, cursor: 'pointer' };
