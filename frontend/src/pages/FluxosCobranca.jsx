import { useEffect, useState } from 'react';
import { flowService } from '../services/flowService.js';
import { FlowList }   from '../components/FlowEngine/FlowList.jsx';
import { FlowEditor } from '../components/FlowEngine/FlowEditor.jsx';

function NewFlowModal({ onSave, onClose }) {
  const [nome, setNome] = useState('');
  function submit(e) {
    e.preventDefault();
    if (!nome.trim()) return;
    onSave(nome.trim());
  }
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <form onSubmit={submit} style={{ background: '#fff', borderRadius: 12, padding: 28, width: 360 }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Novo fluxo de cobrança</div>
        <label style={labelStyle}>Nome do fluxo</label>
        <input
          autoFocus value={nome} onChange={e => setNome(e.target.value)}
          style={inputStyle} placeholder="Ex: Cobrança D+1"
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={btnCancel}>Cancelar</button>
          <button type="submit" style={btnPrimary}>Criar</button>
        </div>
      </form>
    </div>
  );
}

export function FluxosCobranca() {
  const [flows,     setFlows]     = useState([]);
  const [execucoes, setExecucoes] = useState([]);
  const [selected,  setSelected]  = useState(null);
  const [showNew,   setShowNew]   = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [msg,       setMsg]       = useState('');

  async function load() {
    try {
      const [fl, ex] = await Promise.all([flowService.listar(), flowService.execucoes()]);
      setFlows(fl);
      setExecucoes(ex);
    } catch (e) {
      setMsg('Erro ao carregar fluxos: ' + e.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleNew(nome) {
    try {
      const flow = await flowService.criar({ nome, gatilho: {}, nos: [] });
      setFlows(fs => [flow, ...fs]);
      setSelected(flow);
      setShowNew(false);
    } catch (e) {
      setMsg('Erro ao criar fluxo: ' + e.message);
    }
  }

  async function handleSave({ nos, gatilho }) {
    if (!selected) return;
    try {
      const updated = await flowService.atualizar(selected.id, { nome: selected.nome, gatilho, nos });
      setFlows(fs => fs.map(f => f.id === updated.id ? updated : f));
      setSelected(updated);
      setMsg('✅ Fluxo salvo com sucesso!');
      setTimeout(() => setMsg(''), 3000);
    } catch (e) {
      setMsg('Erro ao salvar: ' + e.message);
    }
  }

  async function handleExecutarAgora() {
    setLoading(true);
    try {
      const r = await flowService.executarAgora();
      setMsg(r.msg || '✅ Rodada executada');
      setTimeout(() => setMsg(''), 4000);
      await load();
    } catch (e) {
      setMsg('Erro: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleGatilhoChange(gatilho) {
    setSelected(s => s ? { ...s, gatilho } : s);
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>
      {/* Lista lateral */}
      <div style={{ width: 290, borderRight: '1px solid #e5e7eb', background: '#f9fafb', flexShrink: 0 }}>
        <FlowList
          flows={flows}
          execucoes={execucoes}
          selected={selected}
          onSelect={setSelected}
          onToggle={load}
          onDelete={id => { setFlows(fs => fs.filter(f => f.id !== id)); if (selected?.id === id) setSelected(null); }}
          onNew={() => setShowNew(true)}
          onExecutarAgora={handleExecutarAgora}
          loading={loading}
        />
      </div>

      {/* Editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {msg && (
          <div style={{ padding: '8px 16px', background: msg.startsWith('✅') ? '#dcfce7' : '#fee2e2', color: msg.startsWith('✅') ? '#15803d' : '#dc2626', fontSize: 13, fontWeight: 600, borderBottom: '1px solid #e5e7eb' }}>
            {msg}
          </div>
        )}

        {selected ? (
          <>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #e5e7eb', background: '#fff', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>✏️ {selected.nome}</span>
              <span style={{ fontSize: 11, color: '#6b7280' }}>
                {(selected.nos || []).length} nó(s) · Gatilho: {selected.gatilho?.tipo?.replace(/_/g, ' ') || 'não configurado'}
              </span>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <FlowEditor
                key={selected.id}
                flow={selected}
                gatilho={selected.gatilho || {}}
                onSave={handleSave}
                onGatilhoChange={handleGatilhoChange}
              />
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🔀</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Selecione ou crie um fluxo</div>
              <div style={{ fontSize: 13 }}>Use o painel esquerdo para gerenciar seus fluxos de cobrança.</div>
            </div>
          </div>
        )}
      </div>

      {showNew && <NewFlowModal onSave={handleNew} onClose={() => setShowNew(false)} />}
    </div>
  );
}

const labelStyle  = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 };
const inputStyle  = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, outline: 'none', boxSizing: 'border-box' };
const btnPrimary  = { flex: 1, padding: '9px 0', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' };
const btnCancel   = { flex: 1, padding: '9px 0', background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' };
