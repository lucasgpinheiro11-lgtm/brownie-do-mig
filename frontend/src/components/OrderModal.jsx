import { useState, useEffect, useRef } from 'react';
import { Modal } from './Modal.jsx';
import { useApp } from '../context/AppContext.jsx';
import * as api from '../lib/api.js';
import { PRODS, FLAVOR_LABELS, fD, fRDec, today } from '../lib/utils.js';

const EMPTY_FORM = {
  name: '', phone: '', address: '', payment: 'pix', date: '', notes: '',
};
const EMPTY_SALE = { date: today(), notes: '', flavor: 'tradicional' };

export function OrderModal({ isOpen, onClose, editId = null }) {
  const { orders, refreshOrders, toast } = useApp();

  const [form,  setForm]  = useState({ ...EMPTY_FORM });
  const [sale,  setSale]  = useState({ ...EMPTY_SALE });
  const [items, setItems] = useState([]);
  const [acResults, setAcResults] = useState([]);
  const [acIdx, setAcIdx] = useState(-1);
  const acRef = useRef(null);

  const isEdit = !!editId;
  const editOrder = isEdit ? orders.find(o => o.id === editId) : null;
  const saleTotal = items.reduce((s, i) => s + i.qty * i.p, 0);

  useEffect(() => {
    if (!isOpen) return;
    if (isEdit && editOrder) {
      setForm({
        name:    editOrder.name    || '',
        phone:   editOrder.phone   || '',
        address: editOrder.address || '',
        payment: editOrder.payment || 'pix',
        date:    editOrder.date    || '',
        notes:   editOrder.notes   || '',
      });
    } else {
      setForm({ ...EMPTY_FORM, date: today() });
    }
    setSale({ ...EMPTY_SALE, date: today() });
    setItems([]);
    setAcResults([]);
    setAcIdx(-1);
  }, [isOpen, editId]);

  // ── Autocomplete ──────────────────────────────────────────────────────────
  function onNameInput(val) {
    setForm(f => ({ ...f, name: val }));
    if (!val || val.length < 1) { setAcResults([]); return; }
    const seen = new Set();
    const res = orders
      .filter(o => o.name && o.name.toLowerCase().includes(val.toLowerCase()))
      .filter(o => { const k = o.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 6);
    setAcResults(res);
    setAcIdx(-1);
  }

  function pickAc(o) {
    setForm(f => ({ ...f, name: o.name, phone: o.phone || f.phone, address: o.address || f.address }));
    setAcResults([]);
  }

  function onNameKey(e) {
    if (!acResults.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setAcIdx(i => Math.min(i+1, acResults.length-1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAcIdx(i => Math.max(i-1, 0)); }
    else if (e.key === 'Enter' && acIdx >= 0) { e.preventDefault(); pickAc(acResults[acIdx]); }
    else if (e.key === 'Escape') setAcResults([]);
  }

  // ── Items ─────────────────────────────────────────────────────────────────
  function addItem(k) {
    const p = PRODS[k]; if (!p) return;
    if (k !== 'cx') {
      const ex = items.find(i => i.k === k);
      if (ex) { setItems(prev => prev.map(i => i.k===k ? {...i, qty:i.qty+1} : i)); return; }
    }
    setItems(prev => [...prev, { k, qty:1, p:p.p, n:p.n, e:p.e, c:p.c, cst:k==='cx' }]);
  }

  function updateItem(idx, field, val) {
    setItems(prev => prev.map((it,i) => i===idx ? {...it, [field]: field==='qty'||field==='p' ? +val||0 : val} : it));
  }

  function removeItem(idx) {
    setItems(prev => prev.filter((_,i) => i!==idx));
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function save() {
    try {
      if (isEdit) {
        if (items.length > 0) {
          await api.addSale(editId, { items, date: sale.date, notes: sale.notes, flavor: sale.flavor });
        }
        await api.updateOrder(editId, {
          phone: form.phone, address: form.address,
          payment: form.payment, date: form.date, notes: form.notes,
        });
        toast('✅ Compra adicionada à conta!');
      } else {
        if (!form.name.trim()) { toast('⚠️ Informe o nome!'); return; }
        if (items.length === 0) { toast('⚠️ Adicione ao menos 1 produto!'); return; }
        const cat = items.some(i=>i.k==='kt') ? 'kit' : items.some(i=>i.k==='bp'||i.k==='bn') ? 'bolo_pote' : 'brownie';
        await api.createOrder({ ...form, cat, items, saleDate:sale.date, saleNotes:sale.notes, flavor:sale.flavor });
        toast('🍫 Conta criada!');
      }
      await refreshOrders();
      onClose();
    } catch (e) {
      toast('❌ ' + e.message);
    }
  }

  // ── Delete sale from history ──────────────────────────────────────────────
  async function deleteSale(saleId) {
    if (!confirm('Remover esta compra da conta?')) return;
    try {
      await api.deleteSale(editId, saleId);
      await refreshOrders();
      toast('🗑 Compra removida');
    } catch (e) {
      toast('❌ ' + e.message);
    }
  }

  const title = isEdit
    ? `➕ ${editOrder?.name || ''} — Adicionar Compra`
    : '🍫 Nova Conta';
  const btnLabel = isEdit ? '➕ Adicionar Compra' : '💾 Salvar Conta';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="540px"
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-gold" onClick={save}>{btnLabel}</button>
        </>
      }
    >
      {/* ── Client section ── */}
      <div style={{ opacity: isEdit ? 0.65 : 1 }}>
        <div className="frow">
          <div className="fg ac-wrap" ref={acRef} style={{ flex:1 }}>
            <label className="fl">Nome do Cliente *</label>
            <input
              className="fi" value={form.name}
              onChange={e => onNameInput(e.target.value)}
              onKeyDown={onNameKey}
              onBlur={() => setTimeout(() => setAcResults([]), 150)}
              placeholder="Maria Silva"
              autoComplete="off"
            />
            {acResults.length > 0 && (
              <div className="ac-list" style={{ display:'block' }}>
                {acResults.map((o, i) => (
                  <div
                    key={o.id}
                    className={`ac-item ${i===acIdx?'selected':''}`}
                    onMouseDown={() => pickAc(o)}
                  >
                    <span>👤</span>
                    <span className="ac-name">{o.name}</span>
                    <span className="ac-phone">{o.phone}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="fg" style={{ maxWidth:150 }}>
            <label className="fl">WhatsApp</label>
            <input className="fi" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="(11)99999-9999" />
          </div>
        </div>
        <div className="frow">
          <div className="fg">
            <label className="fl">Endereço</label>
            <input className="fi" value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))} placeholder="Rua, número, bairro" />
          </div>
          <div className="fg" style={{ maxWidth:160 }}>
            <label className="fl">Pagar até</label>
            <input type="date" className="fi" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} />
          </div>
        </div>
        <div className="frow">
          <div className="fg">
            <label className="fl">Pagamento</label>
            <select className="fs" value={form.payment} onChange={e=>setForm(f=>({...f,payment:e.target.value}))}>
              <option value="pix">Pix 🔵</option>
              <option value="dinheiro">Dinheiro 💵</option>
              <option value="cartao">Cartão 💳</option>
              <option value="pendente">Fiado ⏳</option>
            </select>
          </div>
          <div className="fg">
            <label className="fl">Observações</label>
            <input className="fi" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="Alergia, recado..." />
          </div>
        </div>
      </div>

      {/* ── Divider ── */}
      <div style={{ borderTop:'1.5px dashed var(--border)', margin:'10px 0 12px', position:'relative' }}>
        <span style={{ position:'absolute', top:-9, left:'50%', transform:'translateX(-50%)', background:'#fff', padding:'0 10px', fontSize:10, fontWeight:700, color:'var(--mu)', textTransform:'uppercase', letterSpacing:'.5px' }}>
          Adicionar Compra
        </span>
      </div>

      {/* ── Products ── */}
      <div className="fg">
        <label className="fl">Produtos</label>
        <div className="ilist">
          {items.map((it, i) => (
            <div key={i} className="irow">
              <span style={{ fontSize:15 }}>{it.e}</span>
              {it.cst ? (
                <input className="fi" value={it.n} onChange={e=>updateItem(i,'n',e.target.value)} style={{ flex:1, minWidth:80 }} />
              ) : (
                <span style={{ flex:1, fontSize:11, fontWeight:700, color:'var(--bd)' }}>{it.n}</span>
              )}
              <input type="number" className="fi" value={it.qty} min={1} onChange={e=>updateItem(i,'qty',e.target.value)} style={{ width:50 }} />
              <span style={{ fontSize:10, color:'var(--mu)' }}>xR$</span>
              <input type="number" className="fi" value={it.p} step={0.5} onChange={e=>updateItem(i,'p',e.target.value)} style={{ width:64 }} />
              <button className="irm" onClick={()=>removeItem(i)}>×</button>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:4, marginTop:6, flexWrap:'wrap' }}>
          {[['bt','+ Trad.','var(--bl)','#fff'],['br','+ Recheado','var(--bl)','#fff'],['bc','+ Caixa 6','var(--bl)','#fff'],
            ['bp','+ B.Pote','var(--gold)','var(--bd)'],['bn','+ Nutella','var(--gold)','var(--bd)'],
            ['kt','+ Kit','var(--cd)','var(--tm)'],['cx','+ Custom','var(--cd)','var(--tm)']].map(([k,lbl,bg,col])=>(
            <button key={k} className="btn-xs" style={{ background:bg, color:col, border:'1px solid var(--border)' }} onClick={()=>addItem(k)}>{lbl}</button>
          ))}
        </div>
      </div>

      {/* ── Sale metadata ── */}
      <div className="frow" style={{ alignItems:'center', gap:10, marginBottom:4 }}>
        <div className="fg" style={{ maxWidth:160 }}>
          <label className="fl">Data da compra</label>
          <input type="date" className="fi" value={sale.date} onChange={e=>setSale(s=>({...s,date:e.target.value}))} />
        </div>
        <div className="fg" style={{ maxWidth:150 }}>
          <label className="fl">Sabor</label>
          <select className="fs" value={sale.flavor} onChange={e=>setSale(s=>({...s,flavor:e.target.value}))}>
            {Object.entries(FLAVOR_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="fg">
          <label className="fl">Obs. da compra</label>
          <input className="fi" value={sale.notes} onChange={e=>setSale(s=>({...s,notes:e.target.value}))} placeholder="Ex: sem nozes" />
        </div>
      </div>

      <div className="tprev">
        <span className="tpl">💰 Total desta compra</span>
        <span className="tpv">{fRDec(saleTotal)}</span>
      </div>

      {/* ── History (edit mode) ── */}
      {isEdit && editOrder && (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
            <span style={{ fontSize:11, fontWeight:700, color:'var(--bd)' }}>📋 Compras desta conta</span>
            <span style={{ fontSize:14, fontWeight:700, fontFamily:'Space Mono, monospace', color:'var(--bd)' }}>
              Total: {fRDec(editOrder.total)}
            </span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:5, maxHeight:200, overflowY:'auto' }}>
            {(editOrder.sales||[]).length === 0
              ? <p style={{ fontSize:11, color:'var(--mu)', padding:8 }}>Nenhuma compra ainda.</p>
              : [...(editOrder.sales||[])].reverse().map(s => (
                <div key={s.id} className="hist-item">
                  <span className="hist-date">{fD(s.date)}</span>
                  <span className="hist-items">
                    {(s.items||[]).map(i=>`${i.qty}x ${i.n}`).join(', ')}
                    {s.flavor && s.flavor !== 'tradicional' && <em style={{ color:'var(--bl)', marginLeft:4 }}>· {FLAVOR_LABELS[s.flavor]||s.flavor}</em>}
                    {s.notes && <em style={{ color:'var(--mu)', marginLeft:4 }}>· {s.notes}</em>}
                  </span>
                  <span className="hist-val">{fRDec(s.total)}</span>
                  <button className="hist-del" onClick={()=>deleteSale(s.id)}>×</button>
                </div>
              ))
            }
          </div>
        </div>
      )}
    </Modal>
  );
}
