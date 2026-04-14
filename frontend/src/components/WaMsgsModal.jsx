import { useState, useEffect } from 'react';
import { Modal } from './Modal.jsx';
import { useApp } from '../context/AppContext.jsx';
import { buildWaMsg } from '../lib/utils.js';

const DEFAULT_MSGS = {
  confirmado:
`Olá {nome}! 🍫

Seu pedido foi *confirmado*! ✅

📋 *Pedido:*
{itens}

💰 *Total: {total}*
💳 Pagamento: {pagamento}
📅 Pgto até: {data}
{endereco}
_Brownie do Mig_ 🍫`,

  vencido:
`Olá {nome}! 🍫

Passando para te lembrar que seu pedido está *aguardando pagamento* 🙏

💰 Total: {total}
🔵 Pix: *{pix}*

Qualquer dúvida é só me chamar! 😊

_Brownie do Mig_ 🍫`,

  pago:
`Olá {nome}! 🍫

Muito obrigado pela sua compra! 💚

Espero que goste muito! 😋
Se curtir, manda uma foto! 📸🙏

_Brownie do Mig_ 🍫`,
};

const SAMPLE = {
  name: 'Maria Silva', total: 81, payment: 'pix',
  date: '2025-12-31', address: 'Rua das Flores, 12',
  sales: [{ items: [{ e: '🍫', qty: 1, n: 'Caixa 6 Brownies', p: 45 }, { e: '🍮', qty: 2, n: 'Bolo de Pote', p: 18 }] }],
};

const VARS = ['{nome}', '{itens}', '{total}', '{pagamento}', '{data}', '{endereco}', '{pix}'];

export function WaMsgsModal({ isOpen, onClose }) {
  const { config, toast } = useApp();
  const [tab,  setTab]  = useState('confirmado');
  const [msgs, setMsgs] = useState({ ...DEFAULT_MSGS });

  const LS_KEY = 'mg_wamsgs';

  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) setMsgs(JSON.parse(saved));
      else setMsgs({ ...DEFAULT_MSGS });
    }
  }, [isOpen]);

  function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(msgs));
    toast('✅ Mensagens salvas!');
    onClose();
  }

  function reset() {
    if (!confirm('Restaurar mensagens para o padrão?')) return;
    setMsgs({ ...DEFAULT_MSGS });
    localStorage.setItem(LS_KEY, JSON.stringify(DEFAULT_MSGS));
    toast('↩ Mensagens restauradas!');
  }

  function insertVar(v) {
    const ta = document.getElementById('wa-msg-textarea');
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const newVal = msgs[tab].slice(0, s) + v + msgs[tab].slice(e);
    setMsgs(prev => ({ ...prev, [tab]: newVal }));
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + v.length; ta.focus(); }, 0);
  }

  const preview = buildWaMsg(msgs[tab] || '', SAMPLE, config.pix || '(chave pix)');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="💬 Mensagens WhatsApp"
      maxWidth="540px"
      footer={
        <>
          <button className="btn btn-outline" onClick={reset}>↩ Restaurar Padrão</button>
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-green" onClick={save}>💾 Salvar Mensagens</button>
        </>
      }
    >
      <p style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 11, lineHeight: 1.6 }}>
        Personalize cada mensagem. Use as variáveis abaixo — elas são substituídas automaticamente pelos dados do pedido.
      </p>

      <div className="msg-tabs">
        {[['confirmado','✅ Confirmado'], ['vencido','🔴 Vencido'], ['pago','💰 Pós-venda']].map(([k, lbl]) => (
          <button key={k} className={`msg-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{lbl}</button>
        ))}
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>
          Variáveis disponíveis — clique para inserir
        </div>
        <div className="var-chips">
          {VARS.map(v => <span key={v} className="var-chip" onClick={() => insertVar(v)}>{v}</span>)}
        </div>
      </div>

      <div className="fg">
        <label className="fl">
          {tab === 'confirmado' ? 'Pedido Confirmado / A Vencer' : tab === 'vencido' ? 'Cobrança (Vencido)' : 'Pós-venda (Pago)'}
        </label>
        <textarea
          id="wa-msg-textarea"
          className="ft"
          rows={7}
          style={{ fontSize: 12, lineHeight: 1.6, height: 160 }}
          value={msgs[tab] || ''}
          onChange={e => setMsgs(prev => ({ ...prev, [tab]: e.target.value }))}
        />
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
          👁 Preview
        </div>
        <div className="msg-preview">{preview}</div>
      </div>
    </Modal>
  );
}

export function getWaMsgs() {
  const saved = localStorage.getItem('mg_wamsgs');
  return saved ? JSON.parse(saved) : { ...DEFAULT_MSGS };
}
