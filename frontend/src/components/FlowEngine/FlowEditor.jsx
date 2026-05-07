import { useCallback, useRef, useState } from 'react';
import ReactFlow, {
  addEdge, Background, Controls, MiniMap,
  useNodesState, useEdgesState, ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { GatilhoNode }  from './nodes/GatilhoNode.jsx';
import { MensagemNode } from './nodes/MensagemNode.jsx';
import { CondicaoNode } from './nodes/CondicaoNode.jsx';
import { EsperaNode }   from './nodes/EsperaNode.jsx';
import { FinalizarNode } from './nodes/FinalizarNode.jsx';
import { NodePalette }  from './NodePalette.jsx';
import { TriggerConfig } from './TriggerConfig.jsx';

const nodeTypes = {
  gatilho:   GatilhoNode,
  mensagem:  MensagemNode,
  condicao:  CondicaoNode,
  espera:    EsperaNode,
  finalizar: FinalizarNode,
};

function uid() { return 'n' + Date.now() + Math.random().toString(36).slice(2, 5); }

function flowToReact(nos = []) {
  const nodes = nos.map((no, i) => ({
    id:       no.id,
    type:     no.tipo,
    position: no.position || { x: 200, y: 80 + i * 130 },
    data:     { label: no.tipo, config: no.config || {}, ...no.data },
  }));

  const edges = [];
  nos.forEach(no => {
    if (no.proximo)     edges.push({ id: `e-${no.id}-${no.proximo}`,     source: no.id, target: no.proximo });
    if (no.proximo_sim) edges.push({ id: `e-${no.id}-sim-${no.proximo_sim}`, source: no.id, target: no.proximo_sim, sourceHandle: 'sim', label: 'Sim' });
    if (no.proximo_nao) edges.push({ id: `e-${no.id}-nao-${no.proximo_nao}`, source: no.id, target: no.proximo_nao, sourceHandle: 'nao', label: 'Não' });
  });

  return { nodes, edges };
}

function reactToFlow(nodes, edges) {
  return nodes.map(n => {
    const no = { id: n.id, tipo: n.type, config: n.data.config || {}, position: n.position };
    const saidas = edges.filter(e => e.source === n.id);
    saidas.forEach(e => {
      if (e.sourceHandle === 'sim') no.proximo_sim = e.target;
      else if (e.sourceHandle === 'nao') no.proximo_nao = e.target;
      else no.proximo = e.target;
    });
    return no;
  });
}

function NodeConfigPanel({ node, onChange, onClose }) {
  if (!node) return null;
  const cfg = node.data.config || {};

  function update(key, val) {
    onChange({ ...node, data: { ...node.data, config: { ...cfg, [key]: val } } });
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#374151' }}>
          Configurar nó ({node.type})
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>✕</button>
      </div>

      {node.type === 'mensagem' && (
        <>
          <label style={labelStyle}>Texto da mensagem</label>
          <textarea
            rows={5} style={{ ...inputStyle, resize: 'vertical' }}
            value={cfg.texto || ''}
            onChange={e => update('texto', e.target.value)}
            placeholder="Olá {nome}, seu pedido venceu há {dias} dias..."
          />
          <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
            Variáveis: {'{nome}'} {'{dias}'} {'{valor}'} {'{pedido}'} {'{link_pagamento}'}
          </div>
        </>
      )}

      {node.type === 'espera' && (
        <>
          <label style={labelStyle}>Horas de espera</label>
          <input type="number" min={1} style={inputStyle}
            value={cfg.horas || 24}
            onChange={e => update('horas', +e.target.value)}
          />
        </>
      )}

      {node.type === 'condicao' && (
        <>
          <label style={labelStyle}>Variável</label>
          <select style={inputStyle} value={cfg.variavel || 'respondeu'} onChange={e => update('variavel', e.target.value)}>
            <option value="respondeu">respondeu</option>
            <option value="dias">dias em atraso</option>
            <option value="status">status do card</option>
            <option value="valor">valor do pedido</option>
          </select>
          <label style={{ ...labelStyle, marginTop: 8 }}>Operador</label>
          <select style={inputStyle} value={cfg.operador || '='} onChange={e => update('operador', e.target.value)}>
            <option value="=">=</option>
            <option value="!=">≠</option>
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
          </select>
          <label style={{ ...labelStyle, marginTop: 8 }}>Valor</label>
          <input style={inputStyle} value={cfg.valor || ''} onChange={e => update('valor', e.target.value)} placeholder="sim" />
        </>
      )}

      {node.type === 'finalizar' && (
        <>
          <label style={labelStyle}>Motivo</label>
          <input style={inputStyle} value={cfg.motivo || ''} onChange={e => update('motivo', e.target.value)} placeholder="cliente_respondeu" />
        </>
      )}

      {node.type === 'gatilho' && (
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          O gatilho é configurado no painel lateral esquerdo do fluxo.
        </div>
      )}
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 };
const inputStyle = { width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12, outline: 'none', boxSizing: 'border-box' };

function FlowEditorInner({ flow, gatilho, onSave, onGatilhoChange }) {
  const { nodes: initNodes, edges: initEdges } = flowToReact(flow?.nos || []);
  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);
  const [selectedNode, setSelectedNode]  = useState(null);
  const [activePanel, setActivePanel]    = useState('palette'); // 'palette' | 'trigger' | 'config'
  const reactFlowWrapper = useRef(null);
  const [rfInstance, setRfInstance]      = useState(null);

  const onConnect = useCallback(
    params => setEdges(eds => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  function onDrop(e) {
    e.preventDefault();
    const tipo = e.dataTransfer.getData('application/reactflow-type');
    if (!tipo || !rfInstance) return;
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const pos    = rfInstance.project({ x: e.clientX - bounds.left, y: e.clientY - bounds.top });
    addNodeAt(tipo, pos);
  }

  function addNodeAt(tipo, position = { x: 200, y: 200 }) {
    const id = uid();
    setNodes(ns => [...ns, { id, type: tipo, position, data: { label: tipo, config: {} } }]);
  }

  function onNodeClick(_, node) {
    setSelectedNode(node);
    setActivePanel('config');
  }

  function onNodeChange(updated) {
    setNodes(ns => ns.map(n => n.id === updated.id ? updated : n));
    setSelectedNode(updated);
  }

  function handleSave() {
    const nos = reactToFlow(nodes, edges);
    onSave({ nos, gatilho });
  }

  function deleteSelectedNode() {
    if (!selectedNode) return;
    setNodes(ns => ns.filter(n => n.id !== selectedNode.id));
    setEdges(es => es.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
    setActivePanel('palette');
  }

  const sidePanel = (() => {
    if (activePanel === 'config' && selectedNode) {
      return <NodeConfigPanel node={selectedNode} onChange={onNodeChange} onClose={() => { setSelectedNode(null); setActivePanel('palette'); }} />;
    }
    if (activePanel === 'trigger') {
      return <TriggerConfig gatilho={gatilho} onChange={onGatilhoChange} />;
    }
    return <NodePalette onAddNode={tipo => addNodeAt(tipo, { x: 220 + Math.random() * 80, y: 100 + nodes.length * 130 })} />;
  })();

  return (
    <div style={{ display: 'flex', height: '100%', gap: 0 }}>
      {/* Painel lateral */}
      <div style={{ width: 220, borderRight: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
          {[
            { id: 'palette', label: '🧩 Nós' },
            { id: 'trigger', label: '⚡ Gatilho' },
          ].map(p => (
            <button key={p.id} onClick={() => setActivePanel(p.id)} style={{
              flex: 1, padding: '8px 4px', fontSize: 11, fontWeight: 600,
              background: activePanel === p.id ? '#fff' : 'transparent',
              border: 'none', borderBottom: activePanel === p.id ? '2px solid #2563eb' : '2px solid transparent',
              cursor: 'pointer', color: activePanel === p.id ? '#2563eb' : '#6b7280',
            }}>{p.label}</button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>{sidePanel}</div>
      </div>

      {/* Canvas */}
      <div ref={reactFlowWrapper} style={{ flex: 1, height: '100%' }}>
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect} onInit={setRfInstance}
          onNodeClick={onNodeClick}
          onDrop={onDrop} onDragOver={e => e.preventDefault()}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background color="#e5e7eb" gap={16} />
          <Controls />
          <MiniMap nodeColor={n => {
            const c = { gatilho: '#2563eb', mensagem: '#16a34a', condicao: '#ea580c', espera: '#ca8a04', finalizar: '#dc2626' };
            return c[n.type] || '#9ca3af';
          }} />
        </ReactFlow>
      </div>

      {/* Barra inferior de ações */}
      <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', gap: 8, zIndex: 10 }}>
        {selectedNode && (
          <button onClick={deleteSelectedNode} style={{ padding: '8px 14px', background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
            🗑 Remover nó
          </button>
        )}
        <button onClick={handleSave} style={{ padding: '8px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
          💾 Salvar fluxo
        </button>
      </div>
    </div>
  );
}

export function FlowEditor(props) {
  return (
    <ReactFlowProvider>
      <div style={{ position: 'relative', height: '100%' }}>
        <FlowEditorInner {...props} />
      </div>
    </ReactFlowProvider>
  );
}
