import { useState } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { useApp } from '../context/AppContext.jsx';
import { filtPer, FLAVOR_LABELS, WEEK_DAYS, fRDec } from '../lib/utils.js';

export function Relatorios() {
  const { orders } = useApp();
  const [per, setPer] = useState('mes');

  const fp  = filtPer(orders.filter(o=>o.status==='pago'), per);
  const allSales = fp.flatMap(o => (o.sales||[]).map(s => ({ ...s, order: o })));

  // ── Ranking de sabores ────────────────────────────────────────────────────
  const flavorCount  = {};
  const flavorRevenue = {};
  allSales.forEach(s => {
    const f = s.flavor || 'tradicional';
    const qty = (s.items||[]).reduce((sum,i)=>sum+i.qty,0);
    flavorCount[f]   = (flavorCount[f]||0) + qty;
    flavorRevenue[f] = (flavorRevenue[f]||0) + (s.total||0);
  });
  const flavorRanking = Object.entries(flavorCount)
    .sort((a,b)=>b[1]-a[1])
    .map(([k,v]) => ({ key:k, label:FLAVOR_LABELS[k]||k, qty:v, rev:flavorRevenue[k]||0 }));
  const maxFlavor = flavorRanking[0]?.qty || 1;

  // ── Dias da semana ────────────────────────────────────────────────────────
  const weekDayCount = Array(7).fill(0);
  const weekDayRev   = Array(7).fill(0);
  fp.forEach(o => {
    if (!o.date) return;
    const d = new Date(o.date + 'T00:00:00');
    if (isNaN(d)) return;
    const wd = d.getDay();
    weekDayCount[wd]++;
    weekDayRev[wd] += o.total || 0;
  });

  // ── Pagamentos ────────────────────────────────────────────────────────────
  const payCount = { pix:0, dinheiro:0, cartao:0, pendente:0 };
  const payRev   = { pix:0, dinheiro:0, cartao:0, pendente:0 };
  fp.forEach(o => {
    const p = o.payment || 'pendente';
    payCount[p] = (payCount[p]||0) + 1;
    payRev[p]   = (payRev[p]  ||0) + o.total;
  });
  const payLabels = { pix:'🔵 Pix', dinheiro:'💵 Dinheiro', cartao:'💳 Cartão', pendente:'⏳ Fiado' };
  const payEntries = Object.entries(payCount).filter(([,v])=>v>0);
  const totalOrders = fp.length;

  // ── Summary metrics ───────────────────────────────────────────────────────
  const totalRev  = fp.reduce((s,o)=>s+o.total,0);
  const avgTicket = totalOrders > 0 ? totalRev/totalOrders : 0;
  const topFlavor = flavorRanking[0];
  const topDay    = weekDayCount.indexOf(Math.max(...weekDayCount));

  const FLAVOR_COLORS = {
    tradicional: '#C4793A',
    ninho:       '#F2D96B',
    oreo:        '#2C1810',
    outro:       '#9C27B0',
  };

  return (
    <div>
      <div className="sec-hd">
        <div className="sec-title">📈 Relatório de Análise</div>
        <select value={per} onChange={e=>setPer(e.target.value)} className="fs" style={{ width:'auto' }}>
          <option value="mes">Este Mês</option>
          <option value="semana">Esta Semana</option>
          <option value="tudo">Todo Período</option>
        </select>
      </div>

      {/* Summary */}
      <div className="g4" style={{ paddingBottom:7 }}>
        <div className="mc" style={{'--accent':'var(--green)'}}>
          <div className="mc-ico">💰</div><div className="mc-lbl">Receita Total</div>
          <div className="mc-val">{fRDec(totalRev)}</div>
          <div className="mc-sub">{totalOrders} pedidos pagos</div>
        </div>
        <div className="mc" style={{'--accent':'var(--bl)'}}>
          <div className="mc-ico">🧾</div><div className="mc-lbl">Ticket Médio</div>
          <div className="mc-val">{fRDec(avgTicket)}</div>
          <div className="mc-sub">por pedido</div>
        </div>
        <div className="mc" style={{'--accent':'var(--gold)'}}>
          <div className="mc-ico">🍫</div><div className="mc-lbl">Sabor Líder</div>
          <div className="mc-val" style={{ fontSize:14 }}>{topFlavor ? FLAVOR_LABELS[topFlavor.key]||topFlavor.key : '—'}</div>
          <div className="mc-sub">{topFlavor ? `${topFlavor.qty} unidades` : 'Sem dados'}</div>
        </div>
        <div className="mc" style={{'--accent':'var(--purple)'}}>
          <div className="mc-ico">📅</div><div className="mc-lbl">Melhor Dia</div>
          <div className="mc-val" style={{ fontSize:14 }}>{Math.max(...weekDayCount) > 0 ? WEEK_DAYS[topDay] : '—'}</div>
          <div className="mc-sub">{Math.max(...weekDayCount) > 0 ? `${weekDayCount[topDay]} pedidos` : 'Sem dados'}</div>
        </div>
      </div>

      <div className="g2">
        {/* Flavors */}
        <div style={{ padding:'0 0 0 18px' }}>
          <div className="cc">
            <div className="cc-title">🍫 Ranking de Sabores</div>
            {flavorRanking.length === 0 ? (
              <p style={{ fontSize:12, color:'var(--mu)', padding:'8px 0' }}>Sem dados para este período.</p>
            ) : (
              <>
                {flavorRanking.map((f, i) => (
                  <div key={f.key} className="ranking-item">
                    <div className="ranking-pos">#{i+1}</div>
                    <div className="ranking-label">{f.label}</div>
                    <div className="ranking-bar">
                      <div className="ranking-fill" style={{ width:`${(f.qty/maxFlavor)*100}%`, background: FLAVOR_COLORS[f.key]||'#888' }} />
                    </div>
                    <div className="ranking-val">
                      <div style={{ fontWeight:700 }}>{f.qty} un.</div>
                      <div style={{ fontSize:9, color:'var(--mu)' }}>{fRDec(f.rev)}</div>
                    </div>
                  </div>
                ))}
                <div style={{ height:140 }}>
                  <Doughnut
                    data={{ labels:flavorRanking.map(f=>f.label), datasets:[{
                      data:flavorRanking.map(f=>f.qty),
                      backgroundColor:flavorRanking.map(f=>FLAVOR_COLORS[f.key]||'#888'),
                      borderWidth:2, borderColor:'#fff',
                    }]}}
                    options={{ responsive:true, maintainAspectRatio:false, cutout:'55%', plugins:{ legend:{ position:'right', labels:{ boxWidth:8, font:{size:10} } } } }}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Days of week */}
        <div style={{ padding:'0 18px 0 0' }}>
          <div className="cc" style={{ marginBottom:12 }}>
            <div className="cc-title">📅 Vendas por Dia da Semana</div>
            <div className="cw">
              <Bar
                data={{
                  labels: WEEK_DAYS,
                  datasets: [
                    { label:'Pedidos', data:weekDayCount, backgroundColor:'rgba(196,121,58,.75)', borderRadius:4 },
                  ],
                }}
                options={{ responsive:true, maintainAspectRatio:false, scales:{ y:{beginAtZero:true,ticks:{stepSize:1,font:{size:10}}}, x:{ticks:{font:{size:10}}} }, plugins:{ legend:{display:false} } }}
              />
            </div>
          </div>
          <div className="cc">
            <div className="cc-title">💳 Breakdown por Pagamento</div>
            {payEntries.length === 0 ? (
              <p style={{ fontSize:12, color:'var(--mu)' }}>Sem dados.</p>
            ) : (
              <>
                {payEntries.map(([p, cnt]) => {
                  const maxCnt = Math.max(...Object.values(payCount));
                  const colors = { pix:'#1565C0', dinheiro:'#2E7D32', cartao:'#6A1B9A', pendente:'#E65100' };
                  return (
                    <div key={p} className="ranking-item">
                      <div className="ranking-label" style={{ minWidth:90 }}>{payLabels[p]||p}</div>
                      <div className="ranking-bar">
                        <div className="ranking-fill" style={{ width:`${(cnt/maxCnt)*100}%`, background:colors[p]||'#888' }} />
                      </div>
                      <div className="ranking-val">
                        <div style={{ fontWeight:700 }}>{cnt} pedidos</div>
                        <div style={{ fontSize:9, color:'var(--mu)' }}>{totalOrders>0?((cnt/totalOrders)*100).toFixed(0)+'%':'—'}</div>
                      </div>
                    </div>
                  );
                })}
                <div style={{ marginTop:12, height:130 }}>
                  <Doughnut
                    data={{ labels:payEntries.map(([p])=>payLabels[p]||p), datasets:[{
                      data:payEntries.map(([,v])=>v),
                      backgroundColor:payEntries.map(([p])=>({pix:'#1565C0',dinheiro:'#2E7D32',cartao:'#6A1B9A',pendente:'#E65100'})[p]||'#888'),
                      borderWidth:2, borderColor:'#fff',
                    }]}}
                    options={{ responsive:true, maintainAspectRatio:false, cutout:'55%', plugins:{ legend:{ position:'right', labels:{ boxWidth:8, font:{size:10} } } } }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Revenue by day of week */}
      <div className="sec-hd" style={{ paddingTop:4 }}>
        <div className="sec-title" style={{ fontSize:13 }}>💰 Receita por Dia da Semana</div>
      </div>
      <div style={{ padding:'0 18px 18px' }}>
        <div className="cc">
          <div className="cw" style={{ height:160 }}>
            <Bar
              data={{
                labels: WEEK_DAYS,
                datasets: [{ label:'Receita R$', data:weekDayRev, backgroundColor:'rgba(46,125,50,.7)', borderRadius:4 }],
              }}
              options={{ responsive:true, maintainAspectRatio:false, scales:{ y:{beginAtZero:true,ticks:{callback:v=>'R$'+Math.round(v),font:{size:10}}}, x:{ticks:{font:{size:10}}} }, plugins:{ legend:{display:false} } }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
