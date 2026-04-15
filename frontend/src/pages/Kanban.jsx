import { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { OrderModal } from '../components/OrderModal.jsx';
import { PixModal } from '../components/PixModal.jsx';
import * as api from '../lib/api.js';
import {
  fD, fRDec, daysDiff,
  STATUS_COLORS, STATUS_LABELS,
  PAYMENT_LABELS, PAYMENT_COLORS,
  buildWaMsg,
} from '../lib/utils.js';
import { getWaMsgs } from '../components/WaMsgsModal.jsx';

const COLS = [
  { id:'novo',       label:'📩 Novo',        bg:'#F3E5F5', tc:'#4A148C' },
  { id:'confirmado', label:'✅ Confirmado',   bg:'#E3F2FD', tc:'#0D47A1' },
  { id:'avencer',    label:'⏰ A Vencer',     bg:'#FFF8E1', tc:'#F57F17' },
  { id:'vencido',    label:'🔴 Vencido',      bg:'#FFEBEE', tc:'#C62828' },
  { id:'pago',       label:'💰 Pago',         bg:'#E8F5E9', tc:'#1B5E20' },
  { id:'cancelado',  label:'❌ Cancelado',    bg:'#FAFAFA', tc:'#555'    },
];

export function Kanban() {
  const { orders, refreshOrders, config, toast } = useApp();
  const [filt,     setFilt]     = useState('todos');
  const [srch,     setSrch]     = useState('');
  const [showOrder,setShowOrder]= useState(false);
  const [editId,   setEditId]   = useState(null);
  const [pixOrder, setPixOrder] = useState(null);
  const [dragId,    setDragId]    = useState(null);
  const [dragOver,  setDragOver]  = useState(null);
  const [cobrando,  setCobrando]  = useState(false);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const todayStr = new Date().toISOString().split('T')[0];
  const todayCount = orders.filter(o => o.date === todayStr && o.status !== 'cancelado').length;
  const totalRev   = orders.filter(o => o.status === 'pago').reduce((s,o) => s+o.total, 0);
  const totalPend  = orders.filter(o => !['pago','cancelado'].includes(o.status)).reduce((s,o) => s+o.total, 0);
  const vencCount  = orders.filter(o => o.status === 'vencido').length;

  // ── Filtered orders ──────────────────────────────────────────────────────
  const visible = orders.filter(o => {
    if (filt !== 'todos' && o.cat !== filt) return false;
    if (srch && !o.name.toLowerCase().includes(srch.toLowerCase()) && !(o.phone||'').includes(srch)) return false;
    return true;
  });

  // ── Drag & drop ───────────────────────────────────────────────────────────
  function onDragStart(id) { setDragId(id); }
  function onDragOver(e, colId) { e.preventDefault(); setDragOver(colId); }
  function onDragLeave() { setDragOver(null); }

  async function onDrop(colId) {
    setDragOver(null);
    if (!dragId) return;
    const o = orders.find(x => x.id === dragId);
    if (!o || o.status === colId) { setDragId(null); return; }
    try {
      if (colId === 'pago' && o.status !== 'pago') {
        await api.payOrder(o.id);
      } else {
        await api.updateOrder(o.id, { status: colId });
      }
      await refreshOrders();
      toast('✅ ' + STATUS_LABELS[colId]);
    } catch (e) {
      toast('❌ ' + e.message);
    }
    setDragId(null);
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async function markPaid(id) {
    const o = orders.find(x => x.id === id);
    if (!o) return;
    if (!confirm(`Confirmar pagamento de ${fRDec(o.total)} — ${o.name}?`)) return;
    try {
      await api.payOrder(id);
      await refreshOrders();
      toast('💰 Conta quitada! ' + o.name);
    } catch (e) { toast('❌ ' + e.message); }
  }

  async function deleteOrder(id) {
    if (!confirm('Excluir este pedido?')) return;
    try {
      await api.deleteOrder(id);
      await refreshOrders();
      toast('🗑 Removido');
    } catch (e) { toast('❌ ' + e.message); }
  }

  function sendWA(o) {
    const ph = (o.phone || '').replace(/\D/g, '');
    if (!ph) { toast('⚠️ Telefone não cadastrado!'); return; }
    const msgs = getWaMsgs();
    let tpl = msgs.confirmado;
    if (['vencido'].includes(o.status)) tpl = msgs.vencido;
    else if (o.status === 'pago') tpl = msgs.pago;
    const msg = buildWaMsg(tpl, o, config.pix);
    const num = ph.startsWith('55') ? ph : '55' + ph;
    window.open(`https://web.whatsapp.com/send?phone=${num}&text=${encodeURIComponent(msg)}`, 'wa_mig');
    toast('📱 Abrindo WhatsApp...');
  }

  async function cobrarUm(id) {
    try {
      const r = await api.cobrarUnica(id);
      toast(`✅ Cobrança enviada! (tentativa ${r.tentativa})`);
    } catch (e) { toast('❌ ' + e.message); }
  }

  async function cobrarTodas() {
    setCobrando(true);
    try {
      const r = await api.cobrarTodas();
      if (r.skipped) { toast('⚠️ ' + r.skipped); return; }
      toast(`✅ ${r.enviados} enviada(s)${r.falhas ? ` · ${r.falhas} falha(s)` : ''}`);
    } catch (e) { toast('❌ ' + e.message); }
    finally { setCobrando(false); }
  }

  function openNew()        { setEditId(null); setShowOrder(true); }
  function openEdit(id)     { setEditId(id);   setShowOrder(true); }
  function exportCSV() {
    const rows = [['ID','Nome','Telefone','Endereço','Total','Pagamento','Status','Data','Obs']];
    orders.forEach(o => rows.push([o.id,o.name,o.phone||'',o.address||'',o.total,o.payment,STATUS_LABELS[o.status]||o.status,o.date,o.notes||'']));
    const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
    a.download = `brownie_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast('📥 CSV exportado!');
  }

  return (
    <>
      {/* Stats bar */}
      <div className="stats-bar">
        <div className="si"><div className="sl">Hoje</div><div className="sv">{todayCount}</div></div>
        <div className="sdiv" />
        <div className="si"><div className="sl">Faturamento</div><div className="sv">{fRDec(totalRev)}</div></div>
        <div className="sdiv" />
        <div className="si"><div className="sl">A Receber</div><div className="sv">{fRDec(totalPend)}</div></div>
        <div className="sdiv" />
        <div className="si"><div className="sl" style={{color:'rgba(255,160,0,.8)'}}>Vencidos</div><div className="sv" style={{color:'#FFB74D'}}>{vencCount}</div></div>
        <div style={{ marginLeft:'auto', display:'flex', gap:7 }}>
          <button className="btn btn-sm btn-outline" style={{color:'rgba(255,255,255,.7)',borderColor:'rgba(255,255,255,.2)'}} onClick={exportCSV}>📥 CSV</button>
          <button className="btn btn-sm" style={{background:'#25D366',color:'#fff',border:'none'}} onClick={cobrarTodas} disabled={cobrando}>
            {cobrando ? 'Enviando...' : '🔔 Cobrar todos'}
          </button>
          <button className="btn btn-gold btn-sm" onClick={openNew}>+ Nova Conta</button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="fbar">
        <span style={{ fontSize:10, fontWeight:700, color:'var(--mu)' }}>Filtrar:</span>
        {[['todos','Todos'],['brownie','🍫 Brownie'],['bolo_pote','🍮 Bolo de Pote'],['kit','🎁 Kit']].map(([f,l]) => (
          <button key={f} className={`fchip ${filt===f?'active':''}`} onClick={()=>setFilt(f)}>{l}</button>
        ))}
        <div style={{ marginLeft:'auto' }}>
          <input
            type="text" value={srch} onChange={e=>setSrch(e.target.value)}
            placeholder="🔍 Buscar..."
            style={{ padding:'4px 10px', border:'1.5px solid var(--border)', borderRadius:20, fontSize:11, fontFamily:'Sora,sans-serif', outline:'none', background:'var(--cream)', width:150 }}
          />
        </div>
      </div>

      {/* Kanban board */}
      <div className="kw">
        <div className="kb">
          {COLS.map(col => {
            const colOrders = visible.filter(o => o.status === col.id);
            return (
              <div key={col.id} className="kc">
                <div className="kh" style={{ background:col.bg }}>
                  <div className="kt" style={{ color:col.tc }}>{col.label}</div>
                  <span className="kn" style={{ color:col.tc }}>{colOrders.length}</span>
                </div>
                <div
                  className="kb-body"
                  style={{ borderColor: dragOver===col.id ? 'var(--gold)' : undefined, background: dragOver===col.id ? 'var(--aml)' : undefined }}
                  onDragOver={e => onDragOver(e, col.id)}
                  onDragLeave={onDragLeave}
                  onDrop={() => onDrop(col.id)}
                >
                  <button className="addbtn" onClick={openNew}>+ Nova Conta</button>
                  {colOrders.map(o => (
                    <KanbanCard
                      key={o.id}
                      order={o}
                      onDragStart={() => onDragStart(o.id)}
                      onEdit={() => openEdit(o.id)}
                      onDelete={() => deleteOrder(o.id)}
                      onMarkPaid={() => markPaid(o.id)}
                      onPix={() => setPixOrder(o)}
                      onWA={() => sendWA(o)}
                      onCobrar={() => cobrarUm(o.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <OrderModal isOpen={showOrder} onClose={()=>setShowOrder(false)} editId={editId} />
      <PixModal   isOpen={!!pixOrder} onClose={()=>setPixOrder(null)} order={pixOrder} />
    </>
  );
}

// ── Kanban Card ───────────────────────────────────────────────────────────────
function KanbanCard({ order: o, onDragStart, onEdit, onDelete, onMarkPaid, onPix, onWA, onCobrar }) {
  const pc = PAYMENT_COLORS[o.payment] || ['#f5f5f5','#555'];
  const payLbl = PAYMENT_LABELS[o.payment] || o.payment;
  const d = daysDiff(o.date);

  let overdueEl = null;
  if (o.status !== 'pago' && o.status !== 'cancelado' && d !== null) {
    if (d < 0) {
      const abs = Math.abs(d);
      overdueEl = <span className={`overdue-pill ${abs>=3?'overdue-2':'overdue-1'}`}>🔴 {abs}d vencido</span>;
    } else if (d === 0) {
      overdueEl = <span className="avencer-pill avencer-today">⚡ Vence hoje</span>;
    } else if (d <= 3) {
      overdueEl = <span className="avencer-pill avencer-soon">⏰ {d}d para vencer</span>;
    }
  }

  const cardClass = `card${o.status==='vencido'?' is-overdue':o.status==='avencer'?' is-avencer':''}`;

  return (
    <div
      className={cardClass}
      draggable
      onDragStart={onDragStart}
    >
      <div className="ca2" style={{ background: STATUS_COLORS[o.status] || '#888' }} />

      <div className="ctop">
        <div className="cname">{o.name}</div>
        <div className="cbadge" style={{ background:pc[0], color:pc[1] }}>{payLbl}</div>
      </div>

      {overdueEl && <div style={{ margin:'4px 0 2px 8px' }}>{overdueEl}</div>}

      {/* Sales list */}
      {(o.sales||[]).length > 0 ? (
        <div className="card-sales">
          {[...(o.sales||[])].reverse().slice(0,3).map(s => (
            <div key={s.id} className="card-sale-row">
              <span className="card-sale-date">{fD(s.date)}</span>
              <span className="card-sale-items">{(s.items||[]).map(i=>`${i.qty}x ${i.n}`).join(', ')}</span>
              <span className="card-sale-val">R${(+s.total||0).toFixed(0)}</span>
            </div>
          ))}
          {(o.sales||[]).length > 3 && (
            <div style={{ fontSize:10, color:'var(--mu)', marginLeft:0, marginTop:2 }}>
              + {(o.sales||[]).length-3} compra(s) anterior(es)
            </div>
          )}
        </div>
      ) : (
        <div className="citems">Sem compras</div>
      )}

      {o.notes && <div className="citems" style={{ color:'var(--bw)', fontStyle:'italic' }}>💬 {o.notes}</div>}

      <div className="cmeta">
        <div className="cval">R$ {o.total.toFixed(2).replace('.',',')}</div>
        <div className="cdate" style={{ color: d!==null&&d<0?'#C62828':undefined, fontWeight: d!==null&&d<0?700:undefined }}>
          📅 {fD(o.date)}
        </div>
      </div>

      <div className="cacts">
        <button className="ca ca-wa"  onClick={onWA}>📱 WA</button>
        {['vencido','avencer'].includes(o.status) && (
          <button className="ca" style={{background:'#E8F5E9',color:'#2E7D32'}} onClick={onCobrar}>🔔 Cobrar</button>
        )}
        {o.payment === 'pix' && o.status !== 'pago' && (
          <button className="ca ca-pix" onClick={onPix}>🔵 Pix</button>
        )}
        {o.status !== 'pago' && o.status !== 'cancelado' && (
          <>
            <button className="ca ca-add" onClick={onEdit}>➕ Compra</button>
            <button className="ca ca-pay" onClick={onMarkPaid}>✅ Quitar</button>
          </>
        )}
        <button className="ca ca-ed" onClick={onEdit}>✏️</button>
        <button className="ca ca-dl" onClick={onDelete}>🗑</button>
      </div>
    </div>
  );
}
