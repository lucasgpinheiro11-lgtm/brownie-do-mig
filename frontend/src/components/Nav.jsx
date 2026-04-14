import { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { ConfigModal } from './ConfigModal.jsx';
import { WaMsgsModal } from './WaMsgsModal.jsx';
import * as api from '../lib/api.js';

const TABS = [
  { id: 'dashboard',  label: '📊 Dashboard' },
  { id: 'kanban',     label: '📋 Pedidos' },
  { id: 'insumos',    label: '🛒 Insumos' },
  { id: 'fluxo',      label: '💰 Fluxo' },
  { id: 'funil',      label: '🎯 Funil' },
  { id: 'relatorios', label: '📈 Relatórios' },
];

export function Nav({ tab, setTab, user, onLogout }) {
  const { config, toast, refreshAll } = useApp();
  const [showCfg, setShowCfg]   = useState(false);
  const [showWa,  setShowWa]    = useState(false);

  async function exportBackup() {
    try {
      const data = await api.getBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `brownie_mig_backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      toast('📥 Backup exportado!');
    } catch (e) {
      toast('❌ Erro ao exportar: ' + e.message);
    }
  }

  async function importBackup(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.version) { toast('⚠️ Arquivo inválido!'); return; }
        await api.restore(data);
        await refreshAll();
        toast('✅ Backup importado!');
      } catch (err) {
        toast('❌ Erro ao importar: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <>
      <nav className="nav">
        <div className="nav-logo"><span>🍫</span>Brownie do Mig</div>

        {TABS.map(t => (
          <button
            key={t.id}
            className={`nav-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}

        <div className="nav-right">
          <div className="sync-badge" onClick={() => setShowCfg(true)}>
            <div className="sync-dot" />
            <span>⚙️ Config</span>
          </div>
          <button
            className="btn btn-sm"
            style={{ background: '#25D366', color: '#fff', border: 'none' }}
            onClick={() => setShowWa(true)}
          >
            💬 Msgs WA
          </button>
          <button
            className="btn btn-sm btn-outline"
            style={{ color: 'rgba(255,255,255,.7)', borderColor: 'rgba(255,255,255,.2)' }}
            onClick={exportBackup}
          >
            📥 Backup
          </button>
          <label
            className="btn btn-sm"
            style={{ background: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.8)', border: 'none', cursor: 'pointer' }}
          >
            📤 Restaurar
            <input type="file" accept=".json" style={{ display: 'none' }} onChange={importBackup} />
          </label>
          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 4, paddingLeft: 10, borderLeft: '1px solid rgba(255,255,255,.15)' }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.75)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                👤 {user.name.split(' ')[0]}
              </span>
              <button
                className="btn btn-sm"
                style={{ background: 'rgba(255,255,255,.1)', color: 'rgba(255,255,255,.8)', border: '1px solid rgba(255,255,255,.2)', whiteSpace: 'nowrap' }}
                onClick={onLogout}
              >
                Sair
              </button>
            </div>
          )}
        </div>
      </nav>

      <ConfigModal isOpen={showCfg} onClose={() => setShowCfg(false)} />
      <WaMsgsModal isOpen={showWa}  onClose={() => setShowWa(false)} />
    </>
  );
}
