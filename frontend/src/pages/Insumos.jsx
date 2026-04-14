import { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { Modal } from '../components/Modal.jsx';
import * as api from '../lib/api.js';
import { fD, fRDec, CAT_ICONS } from '../lib/utils.js';

const EMPTY_INS  = { name:'', cat:'chocolate', unit:'kg', stock:0, min_stock:1 };
const EMPTY_COMP = { ins_id:'', qty:1, price:0, date:'', forn:'' };

export function Insumos() {
  const { insumos, compras, refreshInsumos, refreshCompras, refreshLancs, toast } = useApp();

  const [showIns,  setShowIns]  = useState(false);
  const [showComp, setShowComp] = useState(false);
  const [insForm,  setInsForm]  = useState({ ...EMPTY_INS });
  const [insEditId,setInsEditId]= useState(null);
  const [compForm, setCompForm] = useState({ ...EMPTY_COMP, date: today() });

  function today() { return new Date().toISOString().split('T')[0]; }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const totalGasto = compras.reduce((s,c) => s+c.total, 0);
  const now = new Date();
  const mesGasto   = compras.filter(c => { const d=new Date(c.date); return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear(); }).reduce((s,c)=>s+c.total,0);
  const baixo      = insumos.filter(i => i.stock <= i.min_stock).length;

  // ── Insumo form ───────────────────────────────────────────────────────────
  function openNewIns()    { setInsEditId(null); setInsForm({...EMPTY_INS}); setShowIns(true); }
  function openEditIns(i)  { setInsEditId(i.id); setInsForm({name:i.name,cat:i.cat,unit:i.unit,stock:i.stock,min_stock:i.min_stock}); setShowIns(true); }

  async function saveIns() {
    if (!insForm.name.trim()) { toast('⚠️ Informe o nome!'); return; }
    try {
      if (insEditId) await api.updateInsumo(insEditId, insForm);
      else           await api.createInsumo(insForm);
      await refreshInsumos();
      toast(insEditId ? '✅ Atualizado!' : '✅ Insumo cadastrado!');
      setShowIns(false);
    } catch (e) { toast('❌ ' + e.message); }
  }

  async function deleteIns(id) {
    if (!confirm('Excluir insumo?')) return;
    try { await api.deleteInsumo(id); await refreshInsumos(); toast('🗑 Removido'); }
    catch (e) { toast('❌ ' + e.message); }
  }

  // ── Compra form ───────────────────────────────────────────────────────────
  const compTotal = (+compForm.qty||0) * (+compForm.price||0);

  function openComp(insId) {
    setCompForm({ ...EMPTY_COMP, ins_id: insId||'', date: today() });
    setShowComp(true);
  }

  async function saveComp() {
    if (!compForm.ins_id) { toast('⚠️ Selecione o insumo!'); return; }
    if (!compForm.qty || !compForm.price) { toast('⚠️ Informe quantidade e valor!'); return; }
    try {
      await api.createCompra(compForm);
      await refreshInsumos();
      await refreshCompras();
      await refreshLancs();
      toast('🛒 Compra registrada!');
      setShowComp(false);
    } catch (e) { toast('❌ ' + e.message); }
  }

  async function deleteComp(id) {
    if (!confirm('Excluir esta compra?')) return;
    try { await api.deleteCompra(id); await refreshCompras(); toast('🗑 Removido'); }
    catch (e) { toast('❌ ' + e.message); }
  }

  const sortedCompras = [...compras].sort((a,b) => new Date(b.date) - new Date(a.date));

  return (
    <>
      {/* Header */}
      <div className="sec-hd">
        <div className="sec-title">🛒 Gestão de Insumos</div>
        <div style={{ display:'flex', gap:7 }}>
          <button className="btn btn-outline btn-sm" onClick={()=>openComp('')}>+ Registrar Compra</button>
          <button className="btn btn-gold btn-sm" onClick={openNewIns}>+ Novo Insumo</button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="g4" style={{ paddingBottom:7 }}>
        <div className="mc" style={{'--accent':'var(--orange)'}}><div className="mc-ico">🛒</div><div className="mc-lbl">Gasto Total</div><div className="mc-val">{fRDec(totalGasto)}</div><div className="mc-sub">acumulado</div></div>
        <div className="mc" style={{'--accent':'var(--bl)'}}><div className="mc-ico">📋</div><div className="mc-lbl">Tipos Cadastrados</div><div className="mc-val">{insumos.length}</div><div className="mc-sub">insumos</div></div>
        <div className="mc" style={{'--accent':'var(--red)'}}><div className="mc-ico">⚠️</div><div className="mc-lbl">Estoque Baixo</div><div className="mc-val">{baixo}</div><div className="mc-sub">precisam repor</div></div>
        <div className="mc" style={{'--accent':'var(--gold)'}}><div className="mc-ico">📅</div><div className="mc-lbl">Gasto Este Mês</div><div className="mc-val">{fRDec(mesGasto)}</div><div className="mc-sub">em compras</div></div>
      </div>

      {/* Stock table */}
      <div className="sec-hd" style={{ paddingTop:2 }}>
        <div className="sec-title" style={{ fontSize:13 }}>📦 Estoque Atual</div>
      </div>
      <div className="tbw">
        <table>
          <thead><tr><th>Insumo</th><th>Categoria</th><th>Estoque</th><th>Mínimo</th><th>Situação</th><th>Última Compra</th><th>Ações</th></tr></thead>
          <tbody>
            {insumos.map(i => {
              const pct = i.min_stock > 0 ? Math.min(100, (i.stock / i.min_stock) * 100) : 100;
              const [sLbl,sClr] = i.stock <= 0 ? ['❌ Zerado','#D32F2F'] : i.stock <= i.min_stock ? ['⚠️ Baixo','#EF6C00'] : ['✅ OK','#2E7D32'];
              const lastBuy = [...compras].filter(c=>c.ins_id===i.id).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
              return (
                <tr key={i.id}>
                  <td className="tdn">{CAT_ICONS[i.cat]||'📌'} {i.name}</td>
                  <td><span className="badge" style={{ background:'var(--cd)', color:'var(--tm)' }}>{i.cat}</span></td>
                  <td style={{ fontWeight:700, color: i.stock<=i.min_stock?sClr:'var(--green)' }}>{i.stock} {i.unit}</td>
                  <td style={{ color:'var(--mu)' }}>{i.min_stock} {i.unit}</td>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                      <div className="pbar"><div className="pbf" style={{ width:`${pct}%`, background:sClr }} /></div>
                      <span style={{ fontSize:10, fontWeight:700, color:sClr }}>{sLbl}</span>
                    </div>
                  </td>
                  <td style={{ color:'var(--mu)', fontSize:11 }}>{lastBuy ? fD(lastBuy.date) : '-'}</td>
                  <td>
                    <div style={{ display:'flex', gap:3 }}>
                      <button className="btn-xs btn-gold" onClick={()=>openComp(i.id)}>🛒</button>
                      <button className="btn-xs" style={{ background:'var(--pl)', color:'var(--purple)', border:'none' }} onClick={()=>openEditIns(i)}>✏️</button>
                      <button className="btn-xs" style={{ background:'var(--rl)', color:'var(--red)',    border:'none' }} onClick={()=>deleteIns(i.id)}>🗑</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Compras table */}
      <div className="sec-hd">
        <div className="sec-title" style={{ fontSize:13 }}>🧾 Histórico de Compras</div>
      </div>
      <div className="tbw">
        <table>
          <thead><tr><th>Data</th><th>Insumo</th><th>Qtd.</th><th>Valor Unit.</th><th>Total</th><th>Fornecedor</th><th>Ações</th></tr></thead>
          <tbody>
            {sortedCompras.length === 0
              ? <tr><td colSpan={7} style={{ padding:14, textAlign:'center', color:'var(--mu)' }}>Nenhuma compra registrada.</td></tr>
              : sortedCompras.map(c => {
                  const ins = insumos.find(i => i.id === c.ins_id);
                  return (
                    <tr key={c.id}>
                      <td style={{ color:'var(--mu)' }}>{fD(c.date)}</td>
                      <td className="tdn">{CAT_ICONS[ins?.cat]||'📌'} {ins?.name||c.ins_name||'-'}</td>
                      <td>{c.qty} {ins?.unit||''}</td>
                      <td>R$ {c.price.toFixed(2).replace('.',',')}</td>
                      <td style={{ fontWeight:700, color:'var(--orange)' }}>R$ {c.total.toFixed(2).replace('.',',')}</td>
                      <td style={{ color:'var(--mu)' }}>{c.forn||'-'}</td>
                      <td><button className="btn-xs" style={{ background:'var(--rl)', color:'var(--red)', border:'none' }} onClick={()=>deleteComp(c.id)}>🗑</button></td>
                    </tr>
                  );
                })
            }
          </tbody>
        </table>
      </div>

      {/* Insumo Modal */}
      <Modal
        isOpen={showIns} onClose={()=>setShowIns(false)}
        title={insEditId ? '✏️ Editar Insumo' : '📦 Novo Insumo'}
        maxWidth="400px"
        footer={<><button className="btn btn-outline" onClick={()=>setShowIns(false)}>Cancelar</button><button className="btn btn-gold" onClick={saveIns}>💾 Salvar</button></>}
      >
        <div className="fg"><label className="fl">Nome *</label><input className="fi" value={insForm.name} onChange={e=>setInsForm(f=>({...f,name:e.target.value}))} placeholder="Ex: Chocolate em pó" /></div>
        <div className="frow">
          <div className="fg">
            <label className="fl">Categoria</label>
            <select className="fs" value={insForm.cat} onChange={e=>setInsForm(f=>({...f,cat:e.target.value}))}>
              <option value="chocolate">🍫 Chocolate</option>
              <option value="farinha">🌾 Farinha/Açúcar</option>
              <option value="lacteo">🥛 Lácteos</option>
              <option value="embalagem">📦 Embalagem</option>
              <option value="outros">📌 Outros</option>
            </select>
          </div>
          <div className="fg">
            <label className="fl">Unidade</label>
            <select className="fs" value={insForm.unit} onChange={e=>setInsForm(f=>({...f,unit:e.target.value}))}>
              <option value="kg">kg</option><option value="g">g</option><option value="L">L</option>
              <option value="ml">ml</option><option value="un">un</option><option value="cx">cx</option>
            </select>
          </div>
        </div>
        <div className="frow">
          <div className="fg"><label className="fl">Estoque Atual</label><input type="number" className="fi" value={insForm.stock} min={0} step={0.1} onChange={e=>setInsForm(f=>({...f,stock:e.target.value}))} /></div>
          <div className="fg"><label className="fl">Estoque Mínimo</label><input type="number" className="fi" value={insForm.min_stock} min={0} step={0.1} onChange={e=>setInsForm(f=>({...f,min_stock:e.target.value}))} /></div>
        </div>
      </Modal>

      {/* Compra Modal */}
      <Modal
        isOpen={showComp} onClose={()=>setShowComp(false)}
        title="🛒 Registrar Compra"
        maxWidth="420px"
        footer={<><button className="btn btn-outline" onClick={()=>setShowComp(false)}>Cancelar</button><button className="btn btn-gold" onClick={saveComp}>💾 Registrar</button></>}
      >
        <div className="fg">
          <label className="fl">Insumo *</label>
          <select className="fs" value={compForm.ins_id} onChange={e=>setCompForm(f=>({...f,ins_id:e.target.value}))}>
            <option value="">— Selecionar —</option>
            {insumos.map(i => <option key={i.id} value={i.id}>{CAT_ICONS[i.cat]||'📌'} {i.name}</option>)}
          </select>
        </div>
        <div className="frow">
          <div className="fg"><label className="fl">Quantidade *</label><input type="number" className="fi" value={compForm.qty} min={0.01} step={0.1} onChange={e=>setCompForm(f=>({...f,qty:e.target.value}))} /></div>
          <div className="fg"><label className="fl">Valor Unitário R$ *</label><input type="number" className="fi" value={compForm.price} min={0} step={0.01} onChange={e=>setCompForm(f=>({...f,price:e.target.value}))} /></div>
        </div>
        <div className="tprev" style={{ marginBottom:11 }}><span className="tpl">💰 Total</span><span className="tpv">{fRDec(compTotal)}</span></div>
        <div className="frow">
          <div className="fg"><label className="fl">Data</label><input type="date" className="fi" value={compForm.date} onChange={e=>setCompForm(f=>({...f,date:e.target.value}))} /></div>
          <div className="fg"><label className="fl">Fornecedor</label><input className="fi" value={compForm.forn} onChange={e=>setCompForm(f=>({...f,forn:e.target.value}))} placeholder="Ex: Atacadão" /></div>
        </div>
      </Modal>
    </>
  );
}
