import { useState } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { useApp } from '../context/AppContext.jsx';
import { Modal } from '../components/Modal.jsx';
import * as api from '../lib/api.js';
import { fD, fRDec, filtPer } from '../lib/utils.js';

export function FluxoCaixa() {
  const { orders, lancs, refreshLancs, toast } = useApp();
  const [per, setPer] = useState('mes');
  const [showLanc, setShowLanc] = useState(false);
  const [lancForm, setLancForm] = useState({ tipo:'entrada', desc:'', cat:'outros', valor:0, date: today() });

  function today() { return new Date().toISOString().split('T')[0]; }

  // ── Period filter ─────────────────────────────────────────────────────────
  function inP(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    if (per === 'mes') return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear();
    if (per === 'mesant') { const lm=new Date(now.getFullYear(),now.getMonth()-1,1); return d.getMonth()===lm.getMonth()&&d.getFullYear()===lm.getFullYear(); }
    return true;
  }

  const vPago = orders.filter(o => o.status==='pago' && inP(o.date));
  const lEnt  = lancs.filter(l => l.tipo==='entrada' && l.cat!=='venda' && inP(l.date));
  const lSai  = lancs.filter(l => l.tipo==='saida'   && inP(l.date));
  const tVend = vPago.reduce((s,o) => s+o.total, 0);
  const tLEnt = lEnt.reduce((s,l) => s+l.valor, 0);
  const tEnt  = tVend + tLEnt;
  const tSai  = lSai.reduce((s,l) => s+l.valor, 0);
  const sld   = tEnt - tSai;
  const mg    = tEnt > 0 ? ((sld/tEnt)*100).toFixed(1) : 0;

  // ── Charts ────────────────────────────────────────────────────────────────
  const now = new Date();
  const wks=[], wE=[], wS=[];
  for (let i=3;i>=0;i--) {
    const ws=new Date(now); ws.setDate(ws.getDate()-i*7);
    const we=new Date(ws); we.setDate(we.getDate()+6);
    wks.push('Sem '+(4-i));
    const e=vPago.filter(o=>{const d=new Date(o.date);return d>=ws&&d<=we;}).reduce((s,o)=>s+o.total,0)
            +lEnt.filter(l=>{const d=new Date(l.date);return d>=ws&&d<=we;}).reduce((s,l)=>s+l.valor,0);
    const s=lSai.filter(l=>{const d=new Date(l.date);return d>=ws&&d<=we;}).reduce((s,l)=>s+l.valor,0);
    wE.push(e); wS.push(s);
  }
  const cm={};
  lSai.forEach(l=>{ cm[l.cat]=(cm[l.cat]||0)+l.valor; });
  const ck=Object.keys(cm);
  const CC={insumo:'#C4793A',embalagem:'#1565C0',transporte:'#2E7D32',marketing:'#6A1B9A',outros:'#888',venda:'#D4AF37'};

  // ── All entries for table ─────────────────────────────────────────────────
  const all = [
    ...vPago.map(o=>({ id:o.id, tipo:'entrada', desc:'Venda — '+o.name, cat:'venda', valor:o.total, date:o.date, isVenda:true })),
    ...lEnt.map(l=>({...l, isVenda:false })),
    ...lSai.map(l=>({...l, isVenda:false })),
  ].sort((a,b)=>new Date(b.date)-new Date(a.date));

  // ── Lançamento ────────────────────────────────────────────────────────────
  async function saveLanc() {
    if (!lancForm.desc.trim() || +lancForm.valor <= 0) { toast('⚠️ Preencha descrição e valor!'); return; }
    try {
      await api.createLanc(lancForm);
      await refreshLancs();
      toast('✅ Lançamento registrado!');
      setShowLanc(false);
      setLancForm({ tipo:'entrada', desc:'', cat:'outros', valor:0, date:today() });
    } catch (e) { toast('❌ ' + e.message); }
  }

  async function deleteLanc(id) {
    try { await api.deleteLanc(id); await refreshLancs(); toast('🗑 Removido'); }
    catch (e) { toast('❌ ' + e.message); }
  }

  return (
    <>
      <div className="sec-hd">
        <div className="sec-title">💰 Fluxo de Caixa</div>
        <div style={{ display:'flex', gap:7, alignItems:'center' }}>
          <select value={per} onChange={e=>setPer(e.target.value)} className="fs" style={{ width:'auto' }}>
            <option value="mes">Este Mês</option>
            <option value="mesant">Mês Anterior</option>
            <option value="tudo">Todo Período</option>
          </select>
          <button className="btn btn-outline btn-sm" onClick={()=>setShowLanc(true)}>+ Lançamento</button>
        </div>
      </div>

      <div className="g4" style={{ paddingBottom:7 }}>
        <div className="mc" style={{'--accent':'var(--green)'}}><div className="mc-ico">📈</div><div className="mc-lbl">Total Entradas</div><div className="mc-val">{fRDec(tEnt)}</div><div className="mc-sub">vendas + outros</div></div>
        <div className="mc" style={{'--accent':'var(--red)'}}><div className="mc-ico">📉</div><div className="mc-lbl">Total Saídas</div><div className="mc-val">{fRDec(tSai)}</div><div className="mc-sub">insumos + gastos</div></div>
        <div className="mc" style={{'--accent':'var(--gold)'}}><div className="mc-ico">💎</div><div className="mc-lbl">Saldo do Período</div><div className="mc-val" style={{color:sld>=0?'var(--green)':'var(--red)'}}>{fRDec(sld)}</div><div className="mc-sub">{sld>=0?'💚 Positivo':'🔴 Negativo'}</div></div>
        <div className="mc" style={{'--accent':'var(--teal)'}}><div className="mc-ico">🏷️</div><div className="mc-lbl">Margem de Lucro</div><div className="mc-val">{mg}%</div><div className="mc-sub">sobre receita</div></div>
      </div>

      <div className="g2">
        <div className="cc">
          <div className="cc-title">📊 Entradas vs Saídas / Semana</div>
          <div className="cw">
            <Bar data={{ labels:wks, datasets:[
              { label:'Entradas', data:wE, backgroundColor:'rgba(46,125,50,.7)', borderRadius:3 },
              { label:'Saídas',   data:wS, backgroundColor:'rgba(198,40,40,.6)', borderRadius:3 },
            ]}} options={{ responsive:true, maintainAspectRatio:false, scales:{ y:{beginAtZero:true,ticks:{callback:v=>'R$'+Math.round(v),font:{size:10}}}, x:{ticks:{font:{size:10}}} } }} />
          </div>
        </div>
        <div className="cc">
          <div className="cc-title">🏷️ Distribuição de Gastos</div>
          <div className="cw">
            {ck.length > 0 ? (
              <Doughnut data={{ labels:ck.map(k=>k.charAt(0).toUpperCase()+k.slice(1)), datasets:[{
                data:ck.map(k=>cm[k]), backgroundColor:ck.map(k=>CC[k]||'#888'), borderWidth:2, borderColor:'#fff',
              }]}} options={{ responsive:true, maintainAspectRatio:false, cutout:'55%', plugins:{ legend:{ position:'bottom', labels:{ boxWidth:8, font:{size:9} } } } }} />
            ) : (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--mu)', fontSize:12 }}>Sem saídas no período</div>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="sec-hd" style={{ paddingTop:2 }}>
        <div className="sec-title" style={{ fontSize:13 }}>🧾 Lançamentos</div>
      </div>
      <div className="tbw">
        <table>
          <thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Categoria</th><th>Valor</th><th>Ações</th></tr></thead>
          <tbody>
            {all.length === 0
              ? <tr><td colSpan={6} style={{ padding:14, textAlign:'center', color:'var(--mu)' }}>Nenhum lançamento para este período.</td></tr>
              : all.map(l => (
                <tr key={l.id} className={l.tipo==='entrada'?'fl-ent':'fl-sai'}>
                  <td style={{ color:'var(--mu)' }}>{fD(l.date)}</td>
                  <td>
                    <span className="badge" style={{ background:l.tipo==='entrada'?'var(--grl)':'var(--rl)', color:l.tipo==='entrada'?'var(--green)':'var(--red)' }}>
                      {l.tipo==='entrada'?'📈 Entrada':'📉 Saída'}
                    </span>
                  </td>
                  <td className="tdn" style={{ fontSize:12 }}>{l.desc}</td>
                  <td><span className="badge" style={{ background:'var(--cd)', color:'var(--tm)' }}>{l.cat}</span></td>
                  <td style={{ fontWeight:700, color:l.tipo==='entrada'?'var(--green)':'var(--red)' }}>R$ {l.valor.toFixed(2).replace('.',',')}</td>
                  <td>
                    {!l.isVenda && (
                      <button className="btn-xs" style={{ background:'var(--rl)', color:'var(--red)', border:'none' }} onClick={()=>deleteLanc(l.id)}>🗑</button>
                    )}
                  </td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>

      {/* Lançamento Modal */}
      <Modal
        isOpen={showLanc} onClose={()=>setShowLanc(false)}
        title="📝 Lançamento Manual"
        maxWidth="400px"
        footer={<><button className="btn btn-outline" onClick={()=>setShowLanc(false)}>Cancelar</button><button className="btn btn-gold" onClick={saveLanc}>💾 Lançar</button></>}
      >
        <div className="frow">
          <div className="fg">
            <label className="fl">Tipo</label>
            <select className="fs" value={lancForm.tipo} onChange={e=>setLancForm(f=>({...f,tipo:e.target.value}))}>
              <option value="entrada">📈 Entrada</option>
              <option value="saida">📉 Saída</option>
            </select>
          </div>
          <div className="fg">
            <label className="fl">Valor R$ *</label>
            <input type="number" className="fi" value={lancForm.valor} min={0} step={0.01} onChange={e=>setLancForm(f=>({...f,valor:e.target.value}))} />
          </div>
        </div>
        <div className="fg">
          <label className="fl">Descrição *</label>
          <input className="fi" value={lancForm.desc} onChange={e=>setLancForm(f=>({...f,desc:e.target.value}))} placeholder="Ex: Venda extra, aluguel..." />
        </div>
        <div className="frow">
          <div className="fg">
            <label className="fl">Categoria</label>
            <select className="fs" value={lancForm.cat} onChange={e=>setLancForm(f=>({...f,cat:e.target.value}))}>
              <option value="venda">Venda</option><option value="insumo">Insumo</option>
              <option value="embalagem">Embalagem</option><option value="transporte">Transporte</option>
              <option value="marketing">Marketing</option><option value="outros">Outros</option>
            </select>
          </div>
          <div className="fg">
            <label className="fl">Data</label>
            <input type="date" className="fi" value={lancForm.date} onChange={e=>setLancForm(f=>({...f,date:e.target.value}))} />
          </div>
        </div>
      </Modal>
    </>
  );
}
