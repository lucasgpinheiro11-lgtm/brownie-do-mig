// ── Serviço de Cobranças via Z-API ────────────────────────────────────────────
const ZAPI_INSTANCE     = process.env.ZAPI_INSTANCE_ID;
const ZAPI_TOKEN        = process.env.ZAPI_TOKEN;
const ZAPI_CLIENT_TOKEN = process.env.ZAPI_CLIENT_TOKEN;
const ZAPI_URL          = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`;

// ── Helpers ───────────────────────────────────────────────────────────────────
function uid() { return 'cb' + Date.now() + Math.random().toString(36).slice(2, 5); }
function todayStr() { return new Date().toISOString().split('T')[0]; }

function formatPhone(phone) {
  const d = (phone || '').replace(/\D/g, '').replace(/^0/, '').replace(/^55/, '');
  return d ? `55${d}` : null;
}

function daysPast(dateStr) {
  if (!dateStr) return 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dt    = new Date(dateStr + 'T00:00:00');
  if (isNaN(dt)) return 0;
  return Math.max(0, Math.round((today - dt) / 86400000));
}

// ── Busca template no banco ───────────────────────────────────────────────────
async function getTemplate(db, status, dias) {
  const { rows } = await db.execute({
    sql:  `SELECT * FROM cobranca_templates WHERE status=? AND dias_min<=? AND (dias_max IS NULL OR dias_max>=?) LIMIT 1`,
    args: [status, dias, dias],
  });
  return rows[0] || null;
}

// ── Busca chave Pix do config ─────────────────────────────────────────────────
async function getPixKey(db) {
  const { rows } = await db.execute(`SELECT value FROM config WHERE key='pix'`);
  return rows[0]?.value || '';
}

// ── Monta extrato de compras ──────────────────────────────────────────────────
function buildExtrato(sales) {
  if (!sales || sales.length === 0) return '';
  const lines = sales.map(s => {
    const dt    = s.date ? (() => { const [,m,d] = s.date.split('-'); return `${d}/${m}`; })() : '';
    const items = (Array.isArray(s.items) ? s.items : JSON.parse(s.items || '[]'));
    const prods = items.map(i => `${i.qty}x ${i.n}`).join(', ');
    const val   = `R$ ${(+s.total || 0).toFixed(2).replace('.', ',')}`;
    return `• ${dt}${dt ? ' — ' : ''}${prods} — ${val}`;
  }).join('\n');
  return `📋 Extrato:\n${lines}`;
}

// ── Interpola variáveis na mensagem ──────────────────────────────────────────
function interpolate(mensagem, order, dias, pixKey, sales = []) {
  const nome    = order.name.split(' ')[0];
  const total   = `R$ ${(+order.total || 0).toFixed(2).replace('.', ',')}`;
  const extrato = buildExtrato(sales);
  const fmtDate = (d) => {
    if (!d) return '';
    const [y, m, dd] = d.split('-');
    return `${dd}/${m}/${y}`;
  };
  return mensagem
    .replace(/\{nome\}/gi,    nome)
    .replace(/\{total\}/gi,   total)
    .replace(/\{dias\}/gi,    String(dias))
    .replace(/\{data\}/gi,    fmtDate(order.date))
    .replace(/\{pix\}/gi,     pixKey)
    .replace(/\{extrato\}/gi, extrato);
}

// ── Z-API send ────────────────────────────────────────────────────────────────
async function sendZapi(phone, message) {
  if (!ZAPI_INSTANCE || !ZAPI_TOKEN)
    throw new Error('Credenciais Z-API não configuradas (ZAPI_INSTANCE_ID / ZAPI_TOKEN)');
  const headers = { 'Content-Type': 'application/json' };
  if (ZAPI_CLIENT_TOKEN) headers['Client-Token'] = ZAPI_CLIENT_TOKEN;
  const payload = { phone, message };
  console.log('Payload Z-API:', JSON.stringify(payload));
  const res     = await fetch(ZAPI_URL, { method: 'POST', headers, body: JSON.stringify(payload) });
  const rawText = await res.text();
  console.log('Resposta Z-API:', rawText);
  if (!res.ok) {
    const err = JSON.parse(rawText || '{}');
    throw new Error(err.message || err.error || `Z-API erro ${res.status}`);
  }
  return JSON.parse(rawText);
}

// ── Log ───────────────────────────────────────────────────────────────────────
async function logCobranca(db, orderId, mensagem, status, tentativa) {
  await db.execute({
    sql:  `INSERT INTO cobrancas_log (id,order_id,mensagem,status,created_at,tentativa) VALUES (?,?,?,?,?,?)`,
    args: [uid(), orderId, mensagem, status, Date.now(), tentativa],
  });
}

// ── Verificações de limite ────────────────────────────────────────────────────
async function checkarLimites(db, orderId) {
  const today = todayStr();
  const { rows: [r1] } = await db.execute({ sql: `SELECT COUNT(*) as c FROM cobrancas_log WHERE order_id=? AND status='enviado'`, args: [orderId] });
  const prev = Number(r1.c);
  if (prev >= 3) throw new Error('Limite de 3 cobranças já atingido para este pedido');
  const { rows: [r2] } = await db.execute({
    sql:  `SELECT COUNT(*) as c FROM cobrancas_log WHERE order_id=? AND status='enviado' AND date(created_at/1000,'unixepoch','localtime')=?`,
    args: [orderId, today],
  });
  if (Number(r2.c) > 0) throw new Error('Já foi enviada uma cobrança hoje para este pedido');
  return prev + 1;
}

// ── Disparo único (manual — sem restrição de horário) ────────────────────────
async function dispararUnica(db, orderId) {
  const { rows: [order] } = await db.execute({ sql: 'SELECT * FROM orders WHERE id=?', args: [orderId] });
  if (!order)       throw new Error('Pedido não encontrado');
  if (!order.phone) throw new Error('Telefone não cadastrado neste pedido');

  const tentativa = await checkarLimites(db, orderId);
  const phone     = formatPhone(order.phone);
  if (!phone)     throw new Error('Telefone inválido');

  const dias     = daysPast(order.date);
  const tmpl     = await getTemplate(db, order.status, dias);
  if (!tmpl) throw new Error(`Nenhuma regra de cobrança configurada para "${order.status}" com ${dias} dia(s) de atraso. Configure em Mensagens WA → 🔔 Automático.`);

  const pixKey = await getPixKey(db);
  const { rows: salesRows } = await db.execute({ sql: 'SELECT * FROM sales WHERE order_id=? ORDER BY date ASC', args: [orderId] });
  const sales = salesRows.map(s => ({ ...s, items: JSON.parse(s.items || '[]') }));
  const mensagem = interpolate(tmpl.mensagem, order, dias, pixKey, sales);

  try {
    await sendZapi(phone, mensagem);
    await logCobranca(db, orderId, mensagem, 'enviado', tentativa);
    return { enviado: true, mensagem, tentativa, phone };
  } catch (e) {
    await logCobranca(db, orderId, mensagem, 'falha', tentativa);
    throw e;
  }
}

// ── Disparo em massa (seg–sex 10h–17h) ───────────────────────────────────────
async function dispararTodas(db) {
  const now  = new Date();
  const dow  = now.getDay();
  const hour = now.getHours();
  if (dow === 0 || dow === 6)   return { skipped: 'fim de semana', enviados: 0, falhas: 0, results: [] };
  if (hour < 10 || hour >= 17) return { skipped: 'fora do horário permitido (10h–17h)', enviados: 0, falhas: 0, results: [] };

  const today  = todayStr();
  const pixKey = await getPixKey(db);
  const { rows: orders } = await db.execute(`SELECT * FROM orders WHERE status IN ('vencido','avencer') AND total>0 AND phone IS NOT NULL AND phone!=''`);

  // Busca todas as sales de uma vez e agrupa por order_id
  const { rows: allSales } = orders.length > 0
    ? await db.execute({ sql: `SELECT * FROM sales WHERE order_id IN (${orders.map(() => '?').join(',')}) ORDER BY date ASC`, args: orders.map(o => o.id) })
    : { rows: [] };
  const salesMap = {};
  allSales.forEach(s => {
    if (!salesMap[s.order_id]) salesMap[s.order_id] = [];
    salesMap[s.order_id].push({ ...s, items: JSON.parse(s.items || '[]') });
  });
  let enviados = 0, falhas = 0;
  const results = [];

  for (const order of orders) {
    // Limite: máx 3 enviados, 1 por dia
    const { rows: [r1] } = await db.execute({ sql: `SELECT COUNT(*) as c FROM cobrancas_log WHERE order_id=? AND status='enviado'`, args: [order.id] });
    if (Number(r1.c) >= 3) continue;
    const { rows: [r2] } = await db.execute({
      sql:  `SELECT COUNT(*) as c FROM cobrancas_log WHERE order_id=? AND status='enviado' AND date(created_at/1000,'unixepoch','localtime')=?`,
      args: [order.id, today],
    });
    if (Number(r2.c) > 0) continue;

    const tentativa = Number(r1.c) + 1;
    const phone     = formatPhone(order.phone);
    if (!phone) continue;

    const dias = daysPast(order.date);
    const tmpl = await getTemplate(db, order.status, dias);
    if (!tmpl) continue; // Sem regra configurada para este período — pula silenciosamente

    const mensagem = interpolate(tmpl.mensagem, order, dias, pixKey, salesMap[order.id] || []);
    try {
      await sendZapi(phone, mensagem);
      await logCobranca(db, order.id, mensagem, 'enviado', tentativa);
      enviados++;
      results.push({ name: order.name, status: 'enviado', tentativa, dias });
    } catch (e) {
      await logCobranca(db, order.id, mensagem, 'falha', tentativa);
      falhas++;
      results.push({ name: order.name, status: 'falha', tentativa, erro: e.message });
    }
  }
  return { enviados, falhas, results };
}

module.exports = { dispararUnica, dispararTodas };
