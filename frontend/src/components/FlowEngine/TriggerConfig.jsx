import { useState } from 'react';

const TIPOS = [
  { value: 'tempo_vencido',   label: 'Tempo vencido'      },
  { value: 'respondeu',       label: 'Cliente respondeu'  },
  { value: 'nao_respondeu',   label: 'Não respondeu'      },
  { value: 'mudanca_status',  label: 'Mudança de status'  },
];

const STATUS_OPTS = ['vencido', 'avencer', 'confirmado', 'novo', 'pago', 'cancelado'];

export function TriggerConfig({ gatilho = {}, onChange }) {
  const [tipo,   setTipo]   = useState(gatilho.tipo       || 'tempo_vencido');
  const [dias,   setDias]   = useState(gatilho.parametro?.dias           ?? 1);
  const [horas,  setHoras]  = useState(gatilho.parametro?.janela_horas   ?? 24);
  const [status, setStatus] = useState(gatilho.parametro?.status_origem  || 'vencido');

  function salvar() {
    const parametro = {};
    if (tipo === 'tempo_vencido')  { parametro.dias = +dias; parametro.status_origem = 'vencido'; }
    if (tipo === 'nao_respondeu')  { parametro.janela_horas = +horas; }
    if (tipo === 'mudanca_status') { parametro.status_origem = status; }
    onChange({ tipo, parametro });
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: '#374151' }}>
        Configurar Gatilho
      </div>

      <label style={labelStyle}>Tipo de gatilho</label>
      <select value={tipo} onChange={e => setTipo(e.target.value)} style={inputStyle}>
        {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>

      {tipo === 'tempo_vencido' && (
        <div style={{ marginTop: 12 }}>
          <label style={labelStyle}>Dias após vencimento</label>
          <input type="number" min={1} value={dias} onChange={e => setDias(e.target.value)} style={inputStyle} />
        </div>
      )}

      {tipo === 'nao_respondeu' && (
        <div style={{ marginTop: 12 }}>
          <label style={labelStyle}>Horas sem resposta</label>
          <input type="number" min={1} value={horas} onChange={e => setHoras(e.target.value)} style={inputStyle} />
        </div>
      )}

      {tipo === 'mudanca_status' && (
        <div style={{ marginTop: 12 }}>
          <label style={labelStyle}>Quando card vai para</label>
          <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
            {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}

      <button onClick={salvar} style={btnStyle}>Salvar Gatilho</button>
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4 };
const inputStyle = { width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 12, outline: 'none', boxSizing: 'border-box' };
const btnStyle   = { marginTop: 16, width: '100%', padding: '8px 0', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' };
