import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';
import * as api from '../lib/api.js';
import { fD } from '../lib/utils.js';

const STEPS = [
  { key:'alcance',   label:'👁 Alcance',    color:'#1565C0', desc:'Quantas pessoas viram sua oferta' },
  { key:'interesse', label:'💡 Interesse',  color:'#6A1B9A', desc:'Quantas demonstraram interesse' },
  { key:'intencao',  label:'🎯 Intenção',   color:'#E65100', desc:'Quantas tinham intenção de comprar' },
  { key:'compra',    label:'🛒 Compra',     color:'#2E7D32', desc:'Quantas efetivamente compraram' },
  { key:'recompra',  label:'🔄 Recompra',   color:'#C4793A', desc:'Quantas compraram novamente' },
];

const EMPTY = { alcance:0, interesse:0, intencao:0, compra:0, recompra:0, notes:'' };

export function Funil() {
  const { funnel, refreshFunnel, toast } = useApp();
  const [selDate, setSelDate] = useState(today());
  const [form,    setForm]    = useState({ ...EMPTY });
  const [saving,  setSaving]  = useState(false);

  function today() { return new Date().toISOString().split('T')[0]; }

  // Load form when date or funnel changes
  useEffect(() => {
    const existing = funnel.find(f => f.date === selDate);
    if (existing) {
      setForm({ alcance:existing.alcance, interesse:existing.interesse, intencao:existing.intencao, compra:existing.compra, recompra:existing.recompra, notes:existing.notes||'' });
    } else {
      setForm({ ...EMPTY });
    }
  }, [selDate, funnel]);

  async function save() {
    setSaving(true);
    try {
      await api.saveFunnel(selDate, form);
      await refreshFunnel();
      toast('✅ Funil salvo!');
    } catch (e) {
      toast('❌ ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Funnel visualization ───────────────────────────────────────────────────
  const maxVal = Math.max(...STEPS.map(s => +form[s.key]||0), 1);

  // ── History ───────────────────────────────────────────────────────────────
  const history = [...funnel].sort((a,b) => new Date(b.date)-new Date(a.date)).slice(0,30);

  // ── Conversion rates ──────────────────────────────────────────────────────
  function pct(a, b) {
    const va = +form[a]||0, vb = +form[b]||0;
    if (!va) return '—';
    return ((vb/va)*100).toFixed(0)+'%';
  }

  return (
    <div>
      <div className="sec-hd">
        <div className="sec-title">🎯 Funil do Dia</div>
        <div style={{ display:'flex', gap:9, alignItems:'center' }}>
          <input type="date" className="fi" value={selDate} onChange={e=>setSelDate(e.target.value)} style={{ width:'auto' }} />
          <button className="btn btn-gold btn-sm" onClick={save} disabled={saving}>{saving?'Salvando...':'💾 Salvar Funil'}</button>
        </div>
      </div>

      <div className="g2" style={{ alignItems:'start' }}>
        {/* Input form */}
        <div>
          <div style={{ padding:'0 18px 14px' }}>
            <div style={{ background:'#fff', border:'1.5px solid var(--border)', borderRadius:'var(--r)', padding:16 }}>
              <p style={{ fontSize:11, color:'var(--mu)', marginBottom:14, lineHeight:1.6 }}>
                📅 <strong>{selDate}</strong> — Preencha ao fim do dia com os dados de hoje.
              </p>
              {STEPS.map(s => (
                <div key={s.key} className="fg">
                  <label className="fl" style={{ color: s.color }}>{s.label}</label>
                  <div style={{ fontSize:10, color:'var(--mu)', marginBottom:4 }}>{s.desc}</div>
                  <input
                    type="number" className="fi" min={0} value={form[s.key]}
                    onChange={e => setForm(f => ({...f, [s.key]: +e.target.value||0}))}
                    style={{ fontFamily:'Space Mono, monospace', fontSize:14, fontWeight:700 }}
                  />
                </div>
              ))}
              <div className="fg">
                <label className="fl">📝 Observações do dia</label>
                <textarea className="ft" rows={2} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="O que aconteceu hoje? Promoção, evento, clima..." />
              </div>
            </div>
          </div>
        </div>

        {/* Visualization */}
        <div>
          <div style={{ padding:'0 18px 14px' }}>
            <div style={{ background:'#fff', border:'1.5px solid var(--border)', borderRadius:'var(--r)', padding:16, marginBottom:12 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--bd)', marginBottom:14 }}>📊 Funil Visual</div>

              <div className="funnel-bar">
                {STEPS.map((s, idx) => {
                  const val = +form[s.key] || 0;
                  const widthPct = maxVal > 0 ? (val / maxVal) * 100 : 0;
                  const prevKey = idx > 0 ? STEPS[idx-1].key : null;
                  const convRate = prevKey ? pct(prevKey, s.key) : null;
                  return (
                    <div key={s.key} className="funnel-step">
                      <div className="funnel-label">{s.label}</div>
                      <div className="funnel-track">
                        <div className="funnel-fill" style={{ width:`${widthPct}%`, background:s.color }}>
                          {val > 0 && <span className="funnel-val">{val}</span>}
                        </div>
                      </div>
                      <div className="funnel-pct">{convRate ? `↓${convRate}` : '—'}</div>
                    </div>
                  );
                })}
              </div>

              {/* Conversion summary */}
              <div style={{ marginTop:16, padding:'10px 0', borderTop:'1px solid var(--border)' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--mu)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:8 }}>Taxas de Conversão</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                  {[
                    ['Alcance → Interesse',  'alcance',  'interesse'],
                    ['Interesse → Intenção', 'interesse','intencao'],
                    ['Intenção → Compra',    'intencao', 'compra'],
                    ['Alcance → Compra',     'alcance',  'compra'],
                    ['Compra → Recompra',    'compra',   'recompra'],
                  ].map(([lbl,a,b]) => (
                    <div key={lbl} style={{ background:'var(--cd)', borderRadius:'var(--rs)', padding:'6px 9px' }}>
                      <div style={{ fontSize:9, color:'var(--mu)', fontWeight:600, marginBottom:2 }}>{lbl}</div>
                      <div style={{ fontSize:14, fontWeight:700, fontFamily:'Space Mono,monospace', color:'var(--bd)' }}>{pct(a,b)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* History table */}
      <div className="sec-hd" style={{ paddingTop:2 }}>
        <div className="sec-title" style={{ fontSize:13 }}>📋 Histórico do Funil</div>
      </div>
      <div className="tbw">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              {STEPS.map(s => <th key={s.key}>{s.label}</th>)}
              <th>Conv. Final</th>
              <th>Obs.</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0
              ? <tr><td colSpan={8} style={{ padding:14, textAlign:'center', color:'var(--mu)' }}>Nenhum registro ainda. Comece preenchendo o funil de hoje!</td></tr>
              : history.map(row => {
                  const conv = row.alcance > 0 ? ((row.compra/row.alcance)*100).toFixed(0)+'%' : '—';
                  const isToday = row.date === today();
                  return (
                    <tr key={row.id} onClick={()=>setSelDate(row.date)} style={{ cursor:'pointer' }}>
                      <td className="tdn">
                        {fD(row.date)}
                        {isToday && <span className="badge" style={{ background:'var(--grl)', color:'var(--green)', marginLeft:5 }}>hoje</span>}
                      </td>
                      {STEPS.map(s => (
                        <td key={s.key} style={{ fontFamily:'Space Mono,monospace', fontWeight:700, color: +row[s.key]>0?'var(--bd)':'var(--mu)' }}>
                          {row[s.key] || '—'}
                        </td>
                      ))}
                      <td style={{ fontWeight:700, color:'var(--bl)', fontFamily:'Space Mono,monospace' }}>{conv}</td>
                      <td style={{ color:'var(--mu)', fontSize:11 }}>{row.notes||'—'}</td>
                    </tr>
                  );
                })
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}
