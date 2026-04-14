import { useState } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { useApp } from '../context/AppContext.jsx';
import { StatCard } from '../components/StatCard.jsx';
import { fR, filtPer, STATUS_LABELS, STATUS_COLORS } from '../lib/utils.js';

const CHART_OPTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
};

export function Dashboard() {
  const { orders, insumos, compras } = useApp();
  const [per, setPer] = useState('mes');

  // ── Metrics ──────────────────────────────────────────────────────────────
  const f   = orders.filter(o => o.status !== 'cancelado');
  const fp  = filtPer(f, per);
  const cp  = filtPer(compras, per);
  const pago = fp.filter(o => o.status === 'pago');
  const rec  = pago.reduce((s, o) => s + o.total, 0);
  const custo = cp.reduce((s, c) => s + c.total, 0);
  const luc   = rec - custo;
  const low   = insumos.filter(i => i.stock <= i.min_stock);

  // ── Vendas por dia ────────────────────────────────────────────────────────
  const now  = new Date();
  const days = per === 'semana' ? 7 : 30;
  const lbls = [], dV = [], dC = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    lbls.push(`${d.getDate()}/${d.getMonth() + 1}`);
    dV.push(fp.filter(o => (o.date||'').startsWith(ds) && o.status === 'pago').reduce((s,o)=>s+o.total,0));
    dC.push(cp.filter(c => (c.date||'').startsWith(ds)).reduce((s,c)=>s+c.total,0));
  }

  // ── Produtos mais vendidos ─────────────────────────────────────────────────
  const pc = {};
  fp.forEach(o => (o.sales||[]).forEach(sale => (sale.items||[]).forEach(i => { pc[i.n] = (pc[i.n]||0) + i.qty; })));
  const ps = Object.entries(pc).sort((a,b)=>b[1]-a[1]).slice(0,6);

  // ── Pagamentos ────────────────────────────────────────────────────────────
  const pC = { pix:0, dinheiro:0, cartao:0, pendente:0 };
  fp.forEach(o => { pC[o.payment] = (pC[o.payment]||0) + 1; });

  // ── Status ────────────────────────────────────────────────────────────────
  const sC = {};
  Object.keys(STATUS_LABELS).forEach(k => sC[k] = 0);
  orders.forEach(o => { sC[o.status] = (sC[o.status]||0) + 1; });
  const sk = Object.keys(sC).filter(k => sC[k] > 0);

  return (
    <div>
      {/* Header */}
      <div className="sec-hd">
        <div className="sec-title">📊 Visão Geral</div>
        <select value={per} onChange={e => setPer(e.target.value)} className="fs" style={{ width:'auto' }}>
          <option value="mes">Este Mês</option>
          <option value="semana">Esta Semana</option>
          <option value="tudo">Todo Período</option>
        </select>
      </div>

      {/* Metric cards */}
      <div className="g4">
        <StatCard accent="var(--green)" icon="💰" label="Faturamento"   value={fR(rec)}   sub={`${pago.length} pedidos pagos`} />
        <StatCard accent="var(--bl)"    icon="📦" label="Pedidos"       value={fp.length} sub={`${fp.filter(o=>o.status!=='pago').length} em aberto`} />
        <StatCard accent="var(--orange)"icon="🛒" label="Custo Insumos" value={fR(custo)} sub={`${cp.length} compras`} />
        <StatCard accent="var(--gold)"  icon="📈" label="Lucro Líquido" value={fR(luc)}   sub={`Margem: ${rec>0?((luc/rec)*100).toFixed(1):0}%`} />
      </div>

      {/* Charts row 1 */}
      <div className="g2">
        <div className="cc">
          <div className="cc-title">📅 Vendas por Dia</div>
          <div className="cw">
            <Bar
              data={{ labels: lbls, datasets: [
                { label:'Vendas R$', data:dV, backgroundColor:'rgba(196,121,58,.75)', borderRadius:3 },
                { label:'Custo R$',  data:dC, backgroundColor:'rgba(198,40,40,.5)',   borderRadius:3 },
              ]}}
              options={{ ...CHART_OPTS, scales:{ y:{beginAtZero:true,ticks:{callback:v=>'R$'+Math.round(v),font:{size:10}}}, x:{ticks:{font:{size:9}}} } }}
            />
          </div>
        </div>
        <div className="cc">
          <div className="cc-title">🍫 Produtos Mais Vendidos</div>
          <div className="cw">
            <Bar
              data={{ labels: ps.map(p=>p[0]), datasets:[{
                label:'Qtd', data:ps.map(p=>p[1]),
                backgroundColor:['#C4793A','#D4AF37','#2E7D32','#1565C0','#6A1B9A','#E65100'],
                borderRadius:3,
              }]}}
              options={{ ...CHART_OPTS, indexAxis:'y', scales:{ x:{beginAtZero:true,ticks:{stepSize:1,font:{size:10}}}, y:{ticks:{font:{size:9}}} } }}
            />
          </div>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="g3">
        <div className="cc">
          <div className="cc-title">💳 Pagamentos</div>
          <div className="cw" style={{ height:155 }}>
            <Doughnut
              data={{ labels:['Pix','Dinheiro','Cartão','Fiado'], datasets:[{
                data:[pC.pix,pC.dinheiro,pC.cartao,pC.pendente],
                backgroundColor:['#1565C0','#2E7D32','#6A1B9A','#E65100'], borderWidth:2, borderColor:'#fff',
              }]}}
              options={{ responsive:true, maintainAspectRatio:false, cutout:'60%', plugins:{ legend:{ position:'bottom', labels:{ boxWidth:8, font:{size:9} } } } }}
            />
          </div>
        </div>
        <div className="cc">
          <div className="cc-title">📊 Receita / Custo / Lucro</div>
          <div className="cw" style={{ height:155 }}>
            <Bar
              data={{ labels:['Receita','Custo','Lucro'], datasets:[{
                data:[rec,custo,luc],
                backgroundColor:['rgba(46,125,50,.75)','rgba(198,40,40,.65)','rgba(212,175,55,.85)'], borderRadius:5,
              }]}}
              options={{ ...CHART_OPTS, scales:{ y:{beginAtZero:true,ticks:{callback:v=>'R$'+Math.round(v),font:{size:10}}}, x:{ticks:{font:{size:10}}} } }}
            />
          </div>
        </div>
        <div className="cc">
          <div className="cc-title">🏷️ Status dos Pedidos</div>
          <div className="cw" style={{ height:155 }}>
            <Doughnut
              data={{ labels:sk.map(k=>STATUS_LABELS[k]), datasets:[{
                data:sk.map(k=>sC[k]), backgroundColor:sk.map(k=>STATUS_COLORS[k]),
                borderWidth:2, borderColor:'#fff',
              }]}}
              options={{ responsive:true, maintainAspectRatio:false, cutout:'55%', plugins:{ legend:{ position:'bottom', labels:{ boxWidth:8, font:{size:9} } } } }}
            />
          </div>
        </div>
      </div>

      {/* Low stock */}
      <div className="sec-hd" style={{ paddingTop:4 }}>
        <div className="sec-title" style={{ fontSize:13 }}>⚠️ Insumos com Estoque Baixo</div>
      </div>
      <div style={{ padding:'0 18px 18px' }}>
        {low.length === 0 ? (
          <p style={{ fontSize:12, color:'var(--mu)' }}>✅ Todos os insumos com estoque OK!</p>
        ) : (
          <div className="tbw" style={{ padding:0 }}>
            <table style={{ minWidth:400 }}>
              <thead><tr><th>Insumo</th><th>Estoque</th><th>Mínimo</th></tr></thead>
              <tbody>
                {low.map(i => (
                  <tr key={i.id}>
                    <td className="tdn">{i.name}</td>
                    <td style={{ fontWeight:700, color: i.stock<=0?'#C62828':'#E65100' }}>{i.stock} {i.unit}</td>
                    <td style={{ color:'var(--mu)' }}>{i.min_stock} {i.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
