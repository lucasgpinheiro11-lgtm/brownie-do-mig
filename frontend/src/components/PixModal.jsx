import { Modal } from './Modal.jsx';
import { useApp } from '../context/AppContext.jsx';
import * as api from '../lib/api.js';
import { fRDec } from '../lib/utils.js';

export function PixModal({ isOpen, onClose, order }) {
  const { config, refreshOrders, toast } = useApp();

  if (!order) return null;
  const pixKey = config.pix || '(Configure sua chave Pix em ⚙️ Config)';

  function copyPix() {
    if (!config.pix) { toast('⚠️ Configure sua chave Pix!'); return; }
    navigator.clipboard.writeText(config.pix).then(() => toast('✅ Chave copiada!'));
  }

  async function markPaid() {
    try {
      await api.payOrder(order.id);
      await refreshOrders();
      toast('💰 Conta quitada! ' + order.name);
      onClose();
    } catch (e) {
      toast('❌ ' + e.message);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="🔵 Cobrança Pix"
      maxWidth="370px"
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Fechar</button>
          <button className="btn btn-green" onClick={markPaid}>✅ Marcar Pago</button>
        </>
      }
    >
      <div className="pix-amt">{fRDec(order.total)}</div>
      <p style={{ fontSize:11, fontWeight:600, color:'var(--mu)', marginBottom:7 }}>Chave Pix:</p>
      <div className="pix-kb">
        <div className="pix-kv">{pixKey}</div>
        <button className="cpbtn" onClick={copyPix}>Copiar</button>
      </div>
      <div style={{ background:'var(--cd)', borderRadius:'var(--rs)', padding:9, fontSize:11, color:'var(--tm)', lineHeight:1.8 }}>
        <strong>📋 Como usar:</strong><br />
        1. Copie a chave acima<br />
        2. App banco → Pix → Colar chave<br />
        3. Valor: <strong style={{ color:'var(--green)' }}>{fRDec(order.total)}</strong>
      </div>
    </Modal>
  );
}
