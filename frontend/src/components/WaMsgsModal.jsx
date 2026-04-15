import { useState, useEffect } from 'react';
import { Modal } from './Modal.jsx';
import { useApp } from '../context/AppContext.jsx';
import { buildWaMsg } from '../lib/utils.js';
import * as api from '../lib/api.js';

const DEFAULT_MSGS = {
  confirmado:
`Olá {nome}! 🍫

Seu pedido foi *confirmado*! ✅

📋 *Pedido:*
{itens}

💰 *Total: {total}*
💳 Pagamento: {pagamento}
📅 Pgto até: {data}
{endereco}
_Brownie do Mig_ 🍫`,

  vencido:
`Olá {nome}! 🍫

Passando para te lembrar que seu pedido está *aguardando pagamento* 🙏

💰 Total: {total}
🔵 Pix: *{pix}*

Qualquer dúvida é só me chamar! 😊

_Brownie do Mig_ 🍫`,

  pago:
`Olá {nome}! 🍫

Muito obrigado pela sua compra! 💚

Espero que goste muito! 😋
Se curtir, manda uma foto! 📸🙏

_Brownie do Mig_ 🍫`,
};

const SAMPLE = {
  name: 'Maria Silva', total: 81, payment: 'pix',
  date: '2025-12-31', address: 'Rua das Flores, 12',
  sales: [{ items: [{ e: '🍫', qty: 1, n: 'Caixa 6 Brownies', p: 45 }, { e: '🍮', qty: 2, n: 'Bolo de Pote', p: 18 }] }],
};

const VARS_MANUAL = ['{nome}', '{itens}', '{total}', '{pagamento}', '{data}', '{endereco}', '{pix}'];
const VARS_AUTO   = ['{nome}', '{total}', '{dias}', '{data}', '{pix}', '{extrato}'];

const STATUS_OPTS = [
  { value: 'vencido', label: '🔴 Vencido' },
  { value: 'avencer', label: '⏰ A Vencer' },
];

const EMPTY_FORM = { status: 'vencido', dias_min: 1, dias_max: '', sem_max: false, mensagem: '' };

const SAMPLE_EXTRATO = `📋 Extrato:\n• 10/04 — 1x Caixa 6 Brownies — R$ 45,00\n• 13/04 — 2x Bolo de Pote — R$ 36,00`;

// ── Interpola preview do template automático ──────────────────────────────────
function interpolatePreview(tpl, dias = 5, pix = '(chave pix)') {
  return tpl
    .replace(/\{nome\}/gi,    'Maria')
    .replace(/\{total\}/gi,   'R$ 81,00')
    .replace(/\{dias\}/gi,    String(dias))
    .replace(/\{data\}/gi,    '05/04/2025')
    .replace(/\{pix\}/gi,     pix)
    .replace(/\{extrato\}/gi, SAMPLE_EXTRATO);
}

// ── Tab: Mensagens manuais ────────────────────────────────────────────────────
function TabManual({ tab, msgs, setMsgs, config }) {
  const TEXTAREA_ID = 'wa-msg-textarea';
  const VARS = VARS_MANUAL;

  function insertVar(v) {
    const ta = document.getElementById(TEXTAREA_ID);
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const newVal = msgs[tab].slice(0, s) + v + msgs[tab].slice(e);
    setMsgs(prev => ({ ...prev, [tab]: newVal }));
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + v.length; ta.focus(); }, 0);
  }

  const preview = buildWaMsg(msgs[tab] || '', SAMPLE, config.pix || '(chave pix)');

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>
          Variáveis disponíveis — clique para inserir
        </div>
        <div className="var-chips">
          {VARS.map(v => <span key={v} className="var-chip" onClick={() => insertVar(v)}>{v}</span>)}
        </div>
      </div>
      <div className="fg">
        <label className="fl">
          {tab === 'confirmado' ? 'Pedido Confirmado / A Vencer' : tab === 'vencido' ? 'Cobrança (Vencido)' : 'Pós-venda (Pago)'}
        </label>
        <textarea
          id={TEXTAREA_ID}
          className="ft"
          rows={7}
          style={{ fontSize: 12, lineHeight: 1.6, height: 160 }}
          value={msgs[tab] || ''}
          onChange={e => setMsgs(prev => ({ ...prev, [tab]: e.target.value }))}
        />
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
          👁 Preview
        </div>
        <div className="msg-preview">{preview}</div>
      </div>
    </div>
  );
}

// ── Tab: Templates automáticos ────────────────────────────────────────────────
function TabAuto({ config, toast }) {
  const [templates, setTemplates] = useState([]);
  const [form,      setForm]      = useState({ ...EMPTY_FORM });
  const [saving,    setSaving]    = useState(false);
  const [showForm,  setShowForm]  = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try { setTemplates(await api.getCobrancaTemplates()); } catch {}
  }

  function insertVar(v) {
    setForm(f => ({ ...f, mensagem: f.mensagem + v }));
  }

  async function save() {
    if (!form.mensagem.trim()) { toast('⚠️ Mensagem obrigatória'); return; }
    if (!form.dias_min || +form.dias_min < 1) { toast('⚠️ Dias mínimo deve ser ≥ 1'); return; }
    if (!form.sem_max && form.dias_max !== '' && +form.dias_max < +form.dias_min) {
      toast('⚠️ Dias máximo deve ser ≥ dias mínimo'); return;
    }
    setSaving(true);
    try {
      await api.createCobrancaTemplate({
        status:   form.status,
        dias_min: +form.dias_min,
        dias_max: form.sem_max ? null : (form.dias_max !== '' ? +form.dias_max : null),
        mensagem: form.mensagem.trim(),
      });
      await load();
      setForm({ ...EMPTY_FORM });
      setShowForm(false);
      toast('✅ Regra criada!');
    } catch (e) {
      toast('❌ ' + e.message);
    } finally { setSaving(false); }
  }

  async function remove(id) {
    if (!confirm('Excluir esta regra?')) return;
    try { await api.deleteCobrancaTemplate(id); await load(); toast('🗑 Removida'); }
    catch (e) { toast('❌ ' + e.message); }
  }

  const byStatus = STATUS_OPTS.map(s => ({
    ...s,
    items: templates.filter(t => t.status === s.value).sort((a, b) => a.dias_min - b.dias_min),
  }));

  const preview = form.mensagem
    ? interpolatePreview(form.mensagem, form.dias_min || 5, config.pix || '(chave pix)')
    : '';

  return (
    <div>
      <p style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 12, lineHeight: 1.6 }}>
        Configure uma mensagem para cada faixa de dias de atraso. O sistema escolhe automaticamente a regra certa ao enviar a cobrança.
        <br/>Variáveis disponíveis: <strong>{VARS_AUTO.join(' ')}</strong>
      </p>

      {/* Lista de regras */}
      {byStatus.map(({ value, label, items }) => (
        <div key={value} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>
            {label}
          </div>
          {items.length === 0 ? (
            <div style={{ fontSize: 11, color: 'var(--mu)', padding: '8px 0' }}>Nenhuma regra configurada.</div>
          ) : (
            items.map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', background: 'var(--cd)', borderRadius: 'var(--rs)', marginBottom: 5 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--bl)', marginBottom: 3 }}>
                    {t.dias_min === t.dias_max ? `${t.dias_min} dia(s)` : t.dias_max == null ? `${t.dias_min}+ dias` : `${t.dias_min} a ${t.dias_max} dias`}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--bd)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {t.mensagem.length > 120 ? t.mensagem.slice(0, 120) + '…' : t.mensagem}
                  </div>
                </div>
                <button className="btn-xs" style={{ background: 'var(--rl)', color: 'var(--red)', border: 'none', flexShrink: 0, marginTop: 2 }} onClick={() => remove(t.id)}>🗑</button>
              </div>
            ))
          )}
        </div>
      ))}

      {/* Botão / Formulário */}
      {!showForm ? (
        <button className="btn btn-outline btn-sm" style={{ width: '100%', marginTop: 4 }} onClick={() => setShowForm(true)}>
          + Nova Regra
        </button>
      ) : (
        <div style={{ border: '1.5px solid var(--gold)', borderRadius: 'var(--r)', padding: 14, marginTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--bd)', marginBottom: 12 }}>Nova Regra de Cobrança</div>

          <div className="frow" style={{ gap: 8 }}>
            <div className="fg">
              <label className="fl">Status</label>
              <select className="fs" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="fg">
              <label className="fl">Dias mínimo</label>
              <input type="number" className="fi" min={1} value={form.dias_min} onChange={e => setForm(f => ({ ...f, dias_min: e.target.value }))} />
            </div>
            <div className="fg">
              <label className="fl">
                Dias máximo
                <label style={{ marginLeft: 8, fontWeight: 400, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.sem_max} onChange={e => setForm(f => ({ ...f, sem_max: e.target.checked, dias_max: '' }))} style={{ marginRight: 4 }} />
                  em diante
                </label>
              </label>
              <input type="number" className="fi" min={form.dias_min} value={form.dias_max} disabled={form.sem_max} onChange={e => setForm(f => ({ ...f, dias_max: e.target.value }))} placeholder={form.sem_max ? '∞' : ''} />
            </div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--mu)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 5 }}>
              Variáveis — clique para inserir
            </div>
            <div className="var-chips">
              {VARS_AUTO.map(v => <span key={v} className="var-chip" onClick={() => insertVar(v)}>{v}</span>)}
            </div>
          </div>

          <div className="fg">
            <label className="fl">Mensagem</label>
            <textarea
              className="ft"
              rows={5}
              style={{ fontSize: 12, lineHeight: 1.6 }}
              value={form.mensagem}
              onChange={e => setForm(f => ({ ...f, mensagem: e.target.value }))}
              placeholder={`Oi {nome}! Tô passando pra lembrar do brownie (R$ {total}). Já faz {dias} dias 😅 Me chama quando puder!`}
            />
          </div>

          {preview && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>
                👁 Preview
              </div>
              <div className="msg-preview" style={{ marginBottom: 10 }}>{preview}</div>
            </>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-outline btn-sm" onClick={() => { setShowForm(false); setForm({ ...EMPTY_FORM }); }}>Cancelar</button>
            <button className="btn btn-gold btn-sm" onClick={save} disabled={saving}>{saving ? 'Salvando…' : '💾 Salvar Regra'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modal principal ───────────────────────────────────────────────────────────
export function WaMsgsModal({ isOpen, onClose }) {
  const { config, toast } = useApp();
  const [tab,  setTab]  = useState('confirmado');
  const [msgs, setMsgs] = useState({ ...DEFAULT_MSGS });

  const LS_KEY = 'mg_wamsgs';
  const isAuto = tab === 'auto';

  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) setMsgs(JSON.parse(saved));
      else setMsgs({ ...DEFAULT_MSGS });
    }
  }, [isOpen]);

  function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(msgs));
    toast('✅ Mensagens salvas!');
    onClose();
  }

  function reset() {
    if (!confirm('Restaurar mensagens para o padrão?')) return;
    setMsgs({ ...DEFAULT_MSGS });
    localStorage.setItem(LS_KEY, JSON.stringify(DEFAULT_MSGS));
    toast('↩ Mensagens restauradas!');
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="💬 Mensagens WhatsApp"
      maxWidth="560px"
      footer={
        isAuto ? (
          <button className="btn btn-outline" onClick={onClose}>Fechar</button>
        ) : (
          <>
            <button className="btn btn-outline" onClick={reset}>↩ Restaurar Padrão</button>
            <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
            <button className="btn btn-green"   onClick={save}>💾 Salvar Mensagens</button>
          </>
        )
      }
    >
      <p style={{ fontSize: 11, color: 'var(--mu)', marginBottom: 11, lineHeight: 1.6 }}>
        {isAuto
          ? 'Regras usadas pelo disparo automático de cobranças.'
          : 'Personalize cada mensagem. Use as variáveis abaixo — elas são substituídas automaticamente pelos dados do pedido.'}
      </p>

      <div className="msg-tabs">
        {[
          ['confirmado', '✅ Confirmado'],
          ['vencido',    '🔴 Vencido'],
          ['pago',       '💰 Pós-venda'],
          ['auto',       '🔔 Automático'],
        ].map(([k, lbl]) => (
          <button key={k} className={`msg-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{lbl}</button>
        ))}
      </div>

      {isAuto ? (
        <TabAuto config={config} toast={toast} />
      ) : (
        <TabManual tab={tab} msgs={msgs} setMsgs={setMsgs} config={config} />
      )}
    </Modal>
  );
}

export function getWaMsgs() {
  const saved = localStorage.getItem('mg_wamsgs');
  return saved ? JSON.parse(saved) : { ...DEFAULT_MSGS };
}
