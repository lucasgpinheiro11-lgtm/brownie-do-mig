import { useState, useEffect } from 'react';
import { Modal } from './Modal.jsx';
import { useApp } from '../context/AppContext.jsx';
import * as api from '../lib/api.js';

export function ConfigModal({ isOpen, onClose }) {
  const { config, setConfig, toast } = useApp();
  const [pix, setPix] = useState('');
  const [wa,  setWa]  = useState('');
  const [gs,  setGs]  = useState('');

  useEffect(() => {
    if (isOpen) {
      setPix(config.pix || '');
      setWa(config.wa   || '');
      setGs(config.gs   || '');
    }
  }, [isOpen, config]);

  async function save() {
    try {
      await api.saveConfig({ pix, wa, gs });
      setConfig({ pix, wa, gs });
      toast('✅ Configurações salvas!');
      onClose();
    } catch (e) {
      toast('❌ ' + e.message);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="⚙️ Configurações"
      maxWidth="460px"
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-green" onClick={save}>💾 Salvar</button>
        </>
      }
    >
      <div className="fg">
        <label className="fl">🔑 Chave Pix</label>
        <input className="fi" value={pix} onChange={e => setPix(e.target.value)} placeholder="CPF, CNPJ, email ou celular" />
      </div>
      <div className="fg">
        <label className="fl">📱 WhatsApp Business (com código do país)</label>
        <input className="fi" value={wa} onChange={e => setWa(e.target.value)} placeholder="5511999999999" />
      </div>
      <div className="fg">
        <label className="fl">📊 URL Google Apps Script (opcional)</label>
        <input className="fi" value={gs} onChange={e => setGs(e.target.value)} placeholder="https://script.google.com/macros/s/..." />
      </div>
      <div style={{ background: 'var(--cd)', borderRadius: 'var(--rs)', padding: 11, fontSize: 11, color: 'var(--tm)', lineHeight: 1.7 }}>
        <strong>💡 Dica:</strong> Os dados ficam salvos no banco SQLite local (backend).<br />
        Use Backup / Restaurar no menu para exportar ou importar dados.
      </div>
    </Modal>
  );
}
