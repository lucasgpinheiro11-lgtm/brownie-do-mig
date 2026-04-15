// ── Serviço de Cobranças via Z-API ────────────────────────────────────────────
const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE_ID;
const ZAPI_TOKEN    = process.env.ZAPI_TOKEN;
const ZAPI_URL      = `https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`;

// ── Helpers ───────────────────────────────────────────────────────────────────
function uid() { return 'cb' + Date.now() + Math.random().toString(36).slice(2, 5); }
function todayStr() { return new Date().toISOString().split('T')[0]; }

function formatPhone(phone) {
  const d = (phone || '').replace(/\D/g, '');
  if (!d) return null;
  return d.startsWith('55') ? d : '55' + d;
}

function daysPast(dateStr) {
  if (!dateStr) return 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dt    = new Date(dateStr + 'T00:00:00');
  if (isNaN(dt)) return 0;
  return Math.max(0, Math.round((today - dt) / 86400000));
}

// ── Templates por fase ────────────────────────────────────────────────────────
const TEMPLATES = {
  cedo: [ // 1–3 dias
    (n, v)    => `Ei ${n}! 😊 Lembra do brownie? São R$ ${v} ainda pendentes. Me chama aqui quando puder!`,
    (n, v)    => `Oi ${n}! Tô passando pra lembrar do brownie (R$ ${v}). Sem pressa, mas qualquer hora tá bom 🍫`,
    (n, v)    => `Fala ${n}! O brownie foi R$ ${v}, qualquer hora que der me passa o Pix 😄`,
  ],
  meio: [ // 4–7 dias
    (n, v)    => `Oi ${n}! Já faz alguns dias do brownie né? R$ ${v} ainda tá em aberto 😅 Me chama lá!`,
    (n, v)    => `Ei ${n}, tudo bem? Passando pra ver se consegue acertar os R$ ${v} do brownie essa semana 🍫`,
  ],
  tarde: [ // 8+ dias
    (n, v, d) => `Oi ${n}! Faz bastante tempo que tá em aberto os R$ ${v} do brownie 😬 Consegue acertar hoje?`,
    (n, v, d) => `Ei ${n}, vou precisar acertar o brownie com você. São R$ ${v} há ${d} dias. Me fala quando puder!`,
  ],
};

function buildMensagem(order, tentativa) {
  const nome  = order.name.split(' ')[0];
  const valor = (+order.total || 0).toFixed(2).replace('.', ',');
  const dias  = daysPast(order.date);

  let pool;
  if (dias <= 3)      pool = TEMPLATES.cedo;
  else if (dias <= 7) pool = TEMPLATES.meio;
  else                pool = TEMPLATES.tarde;

  const idx = (tentativa - 1) % pool.length;
  return pool[idx](nome, valor, dias);
}

// ── Z-API send ────────────────────────────────────────────────────────────────
async function sendZapi(phone, message) {
  if (!ZAPI_INSTANCE || !ZAPI_TOKEN) throw new Error('Credenciais Z-API não configuradas (ZAPI_INSTANCE_ID / ZAPI_TOKEN)');
  const res = await fetch(ZAPI_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ phone, message }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Z-API erro ${res.status}`);
  }
  return res.json();
}

// ── Log helper ────────────────────────────────────────────────────────────────
function logCobranca(db, orderId, mensagem, status, tentativa) {
  db.prepare(`
    INSERT INTO cobrancas_log (id, order_id, mensagem, status, created_at, tentativa)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uid(), orderId, mensagem, status, Date.now(), tentativa);
}

// ── Verificações comuns ───────────────────────────────────────────────────────
function checkarLimites(db, orderId) {
  const today = todayStr();

  const prev = db.prepare(`SELECT COUNT(*) as c FROM cobrancas_log WHERE order_id = ? AND status = 'enviado'`).get(orderId).c;
  if (prev >= 3) throw new Error('Limite de 3 cobranças já atingido para este pedido');

  const hoje = db.prepare(`
    SELECT COUNT(*) as c FROM cobrancas_log
    WHERE order_id = ? AND status = 'enviado'
      AND date(created_at / 1000, 'unixepoch', 'localtime') = ?
  `).get(orderId, today).c;
  if (hoje > 0) throw new Error('Já foi enviada uma cobrança hoje para este pedido');

  return prev + 1; // próxima tentativa
}

// ── Disparo único (manual — sem restrição de horário) ─────────────────────────
async function dispararUnica(db, orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order)       throw new Error('Pedido não encontrado');
  if (!order.phone) throw new Error('Telefone não cadastrado neste pedido');

  const tentativa = checkarLimites(db, orderId);
  const phone     = formatPhone(order.phone);
  if (!phone)     throw new Error('Telefone inválido');

  const mensagem = buildMensagem(order, tentativa);
  try {
    await sendZapi(phone, mensagem);
    logCobranca(db, orderId, mensagem, 'enviado', tentativa);
    return { enviado: true, mensagem, tentativa, phone };
  } catch (e) {
    logCobranca(db, orderId, mensagem, 'falha', tentativa);
    throw e;
  }
}

// ── Disparo em massa (com restrições de horário e dia) ────────────────────────
async function dispararTodas(db) {
  const now = new Date();
  const dow  = now.getDay();
  const hour = now.getHours();

  if (dow === 0 || dow === 6)      return { skipped: 'fim de semana', enviados: 0, falhas: 0, results: [] };
  if (hour < 10 || hour >= 17)    return { skipped: 'fora do horário permitido (10h–17h)', enviados: 0, falhas: 0, results: [] };

  const today = todayStr();
  const orders = db.prepare(`
    SELECT * FROM orders
    WHERE status IN ('vencido', 'avencer')
      AND total > 0
      AND phone IS NOT NULL AND phone != ''
  `).all();

  let enviados = 0, falhas = 0;
  const results = [];

  for (const order of orders) {
    // Verificar limites sem lançar exceção — só pular
    const prev = db.prepare(`SELECT COUNT(*) as c FROM cobrancas_log WHERE order_id = ? AND status = 'enviado'`).get(order.id).c;
    if (prev >= 3) continue;

    const hoje = db.prepare(`
      SELECT COUNT(*) as c FROM cobrancas_log
      WHERE order_id = ? AND status = 'enviado'
        AND date(created_at / 1000, 'unixepoch', 'localtime') = ?
    `).get(order.id, today).c;
    if (hoje > 0) continue;

    const tentativa = prev + 1;
    const phone     = formatPhone(order.phone);
    if (!phone) continue;

    const mensagem = buildMensagem(order, tentativa);
    try {
      await sendZapi(phone, mensagem);
      logCobranca(db, order.id, mensagem, 'enviado', tentativa);
      enviados++;
      results.push({ name: order.name, status: 'enviado', tentativa });
    } catch (e) {
      logCobranca(db, order.id, mensagem, 'falha', tentativa);
      falhas++;
      results.push({ name: order.name, status: 'falha', tentativa, erro: e.message });
    }
  }

  return { enviados, falhas, results };
}

module.exports = { dispararUnica, dispararTodas };
