const { createClient } = require('@libsql/client');
const express  = require('express');
const cors     = require('cors');
const jwt      = require('jsonwebtoken');
const cobranca = require('./cobranca.js');

// ── AUTH ──────────────────────────────────────────────────────────────────────
const JWT_SECRET  = process.env.JWT_SECRET  || 'brownie-do-mig-secret-2025';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '24h';

const USERS = [
  { cpf: '81496770030', password: '123456', name: 'Lucas Pinheiro'  },
  { cpf: '83811150006', password: '123456', name: 'Daniela Maciel'  },
  { cpf: '86521489020', password: '123456', name: 'Miguel Pinheiro' },
];

const app  = express();
const PORT = process.env.PORT || 3001;

// ── BANCO (Turso em prod, arquivo local em dev) ───────────────────────────────
const db = createClient({
  url:       process.env.TURSO_URL       || 'file:brownie.db',
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

app.use(cors({ origin: process.env.FRONTEND_URL || true, credentials: true }));
app.use(express.json({ limit: '20mb' }));

// ── LOGIN (público) ───────────────────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { cpf, password } = req.body;
  const raw  = String(cpf || '').replace(/\D/g, '');
  const user = USERS.find(u => u.cpf === raw && u.password === String(password || ''));
  if (!user) return res.status(401).json({ error: 'CPF ou senha inválidos' });
  const token = jwt.sign({ cpf: user.cpf, name: user.name }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  res.json({ token, user: { cpf: user.cpf, name: user.name } });
});

// ── AUTH MIDDLEWARE ───────────────────────────────────────────────────────────
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/')) return next();
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ error: 'Não autenticado' });
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado. Faça login novamente.' });
  }
});

// ── HELPERS ───────────────────────────────────────────────────────────────────
function uid(p = '') { return p + Date.now() + Math.random().toString(36).slice(2, 5); }
function todayStr()  { return new Date().toISOString().split('T')[0]; }

function daysDiff(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dt = new Date(dateStr + 'T00:00:00');
  if (isNaN(dt)) return null;
  return Math.round((dt - today) / 86400000);
}

function autoClassify(o) {
  if (!o) return o;
  if (['pago', 'cancelado', 'novo'].includes(o.status) || !o.date) return o;
  const d = daysDiff(o.date);
  if (d === null) return o;
  if (d < 0) o.status = 'vencido';
  else if (d <= 3 && o.status === 'confirmado') o.status = 'avencer';
  return o;
}

async function withSales(order) {
  if (!order) return null;
  const o = { ...order };
  const { rows } = await db.execute({ sql: 'SELECT * FROM sales WHERE order_id=? ORDER BY date ASC', args: [o.id] });
  o.sales = rows.map(s => ({ ...s, items: JSON.parse(s.items || '[]') }));
  return autoClassify(o);
}

async function allOrdersWithSales() {
  const { rows: orders }   = await db.execute('SELECT * FROM orders ORDER BY created_at DESC');
  const { rows: allSales } = await db.execute('SELECT * FROM sales ORDER BY date ASC');
  const map = {};
  allSales.forEach(s => {
    if (!map[s.order_id]) map[s.order_id] = [];
    map[s.order_id].push({ ...s, items: JSON.parse(s.items || '[]') });
  });
  return orders.map(o => { const oo = { ...o }; oo.sales = map[oo.id] || []; return autoClassify(oo); });
}

async function recalcOrderTotal(orderId) {
  const { rows } = await db.execute({ sql: 'SELECT SUM(total) as t FROM sales WHERE order_id=?', args: [orderId] });
  await db.execute({ sql: 'UPDATE orders SET total=? WHERE id=?', args: [rows[0]?.t || 0, orderId] });
}

async function recalcOrderCat(orderId) {
  const { rows } = await db.execute({ sql: 'SELECT items FROM sales WHERE order_id=?', args: [orderId] });
  let cat = 'brownie';
  rows.forEach(r => {
    const items = JSON.parse(r.items || '[]');
    if (items.some(i => i.k === 'kt')) { cat = 'kit'; return; }
    if (items.some(i => i.k === 'bp' || i.k === 'bn')) cat = 'bolo_pote';
  });
  await db.execute({ sql: 'UPDATE orders SET cat=? WHERE id=?', args: [cat, orderId] });
}

// ── ORDERS ────────────────────────────────────────────────────────────────────
app.get('/api/orders', async (_, res) => {
  try { res.json(await allOrdersWithSales()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/orders', async (req, res) => {
  try {
    const { name, phone, address, payment, date, notes, cat, items, saleDate, saleNotes, flavor } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
    const id        = uid('o');
    const saleTotal = (items || []).reduce((s, i) => s + i.qty * i.p, 0);
    await db.execute({
      sql:  `INSERT INTO orders (id,name,phone,address,payment,status,date,notes,cat,total,created_at) VALUES (?,?,?,?,?,'confirmado',?,?,?,?,?)`,
      args: [id, name, phone||'', address||'', payment||'pix', date||'', notes||'', cat||'brownie', saleTotal, Date.now()],
    });
    if ((items || []).length > 0) {
      await db.execute({
        sql:  `INSERT INTO sales (id,order_id,date,items,total,notes,flavor) VALUES (?,?,?,?,?,?,?)`,
        args: [uid('s'), id, saleDate||todayStr(), JSON.stringify(items), saleTotal, saleNotes||'', flavor||'tradicional'],
      });
    }
    const { rows } = await db.execute({ sql: 'SELECT * FROM orders WHERE id=?', args: [id] });
    res.json(await withSales(rows[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/orders/:id', async (req, res) => {
  try {
    const { rows: [o] } = await db.execute({ sql: 'SELECT * FROM orders WHERE id=?', args: [req.params.id] });
    if (!o) return res.status(404).json({ error: 'Não encontrado' });
    const { phone, address, payment, status, date, notes } = req.body;
    await db.execute({
      sql:  `UPDATE orders SET phone=?,address=?,payment=?,status=?,date=?,notes=? WHERE id=?`,
      args: [phone??o.phone, address??o.address, payment??o.payment, status??o.status, date??o.date, notes??o.notes, req.params.id],
    });
    const { rows } = await db.execute({ sql: 'SELECT * FROM orders WHERE id=?', args: [req.params.id] });
    res.json(await withSales(rows[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/orders/:id', async (req, res) => {
  try {
    await db.batch([
      { sql: 'DELETE FROM sales WHERE order_id=?', args: [req.params.id] },
      { sql: 'DELETE FROM orders WHERE id=?',      args: [req.params.id] },
    ], 'write');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/orders/:id/pay', async (req, res) => {
  try {
    const { rows: [o] } = await db.execute({ sql: 'SELECT * FROM orders WHERE id=?', args: [req.params.id] });
    if (!o) return res.status(404).json({ error: 'Não encontrado' });
    if (o.status !== 'pago') {
      await db.batch([
        { sql: `UPDATE orders SET status='pago' WHERE id=?`,                          args: [req.params.id] },
        { sql: `INSERT INTO lancs (id,tipo,desc,cat,valor,date) VALUES (?,?,?,?,?,?)`, args: [uid('l'), 'entrada', 'Conta quitada — '+o.name, 'venda', o.total, todayStr()] },
      ], 'write');
    }
    const { rows } = await db.execute({ sql: 'SELECT * FROM orders WHERE id=?', args: [req.params.id] });
    res.json(await withSales(rows[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/orders/:id/sales', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: [o] } = await db.execute({ sql: 'SELECT * FROM orders WHERE id=?', args: [id] });
    if (!o) return res.status(404).json({ error: 'Não encontrado' });
    const { items, date, notes, flavor } = req.body;
    const saleTotal = (items||[]).reduce((s,i) => s+i.qty*i.p, 0);
    await db.execute({
      sql:  `INSERT INTO sales (id,order_id,date,items,total,notes,flavor) VALUES (?,?,?,?,?,?,?)`,
      args: [uid('s'), id, date||todayStr(), JSON.stringify(items||[]), saleTotal, notes||'', flavor||'tradicional'],
    });
    await recalcOrderTotal(id);
    await recalcOrderCat(id);
    const { rows } = await db.execute({ sql: 'SELECT * FROM orders WHERE id=?', args: [id] });
    res.json(await withSales(rows[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/orders/:id/sales/:sid', async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM sales WHERE id=? AND order_id=?', args: [req.params.sid, req.params.id] });
    await recalcOrderTotal(req.params.id);
    const { rows } = await db.execute({ sql: 'SELECT * FROM orders WHERE id=?', args: [req.params.id] });
    res.json(await withSales(rows[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── INSUMOS ───────────────────────────────────────────────────────────────────
app.get('/api/insumos', async (_, res) => {
  try { const { rows } = await db.execute('SELECT * FROM insumos'); res.json(rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/insumos', async (req, res) => {
  try {
    const { name, cat, unit, stock, min_stock } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
    const id = uid('i');
    await db.execute({ sql: `INSERT INTO insumos (id,name,cat,unit,stock,min_stock) VALUES (?,?,?,?,?,?)`, args: [id, name, cat||'outros', unit||'un', +stock||0, +min_stock||0] });
    const { rows } = await db.execute({ sql: 'SELECT * FROM insumos WHERE id=?', args: [id] });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/insumos/:id', async (req, res) => {
  try {
    const { name, cat, unit, stock, min_stock } = req.body;
    await db.execute({ sql: `UPDATE insumos SET name=?,cat=?,unit=?,stock=?,min_stock=? WHERE id=?`, args: [name, cat, unit, +stock||0, +min_stock||0, req.params.id] });
    const { rows } = await db.execute({ sql: 'SELECT * FROM insumos WHERE id=?', args: [req.params.id] });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/insumos/:id', async (req, res) => {
  try { await db.execute({ sql: 'DELETE FROM insumos WHERE id=?', args: [req.params.id] }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── COMPRAS ───────────────────────────────────────────────────────────────────
app.get('/api/compras', async (_, res) => {
  try { const { rows } = await db.execute('SELECT * FROM compras ORDER BY date DESC'); res.json(rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/compras', async (req, res) => {
  try {
    const { ins_id, qty, price, date, forn } = req.body;
    if (!ins_id || !qty || !price) return res.status(400).json({ error: 'Campos obrigatórios' });
    const { rows: [ins] } = await db.execute({ sql: 'SELECT * FROM insumos WHERE id=?', args: [ins_id] });
    if (!ins) return res.status(404).json({ error: 'Insumo não encontrado' });
    const total = +qty * +price, id = uid('c'), dt = date || todayStr();
    await db.batch([
      { sql: `INSERT INTO compras (id,ins_id,ins_name,qty,price,total,date,forn) VALUES (?,?,?,?,?,?,?,?)`, args: [id, ins_id, ins.name, +qty, +price, total, dt, forn||''] },
      { sql: `UPDATE insumos SET stock=stock+? WHERE id=?`,                                                  args: [+qty, ins_id] },
      { sql: `INSERT INTO lancs (id,tipo,desc,cat,valor,date) VALUES (?,?,?,?,?,?)`,                         args: [uid('l'), 'saida', 'Compra: '+ins.name, 'insumo', total, dt] },
    ], 'write');
    const [{ rows: [compra] }, { rows: [insumo] }] = await Promise.all([
      db.execute({ sql: 'SELECT * FROM compras WHERE id=?',  args: [id]     }),
      db.execute({ sql: 'SELECT * FROM insumos WHERE id=?',  args: [ins_id] }),
    ]);
    res.json({ compra, insumo });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/compras/:id', async (req, res) => {
  try { await db.execute({ sql: 'DELETE FROM compras WHERE id=?', args: [req.params.id] }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── LANÇAMENTOS ───────────────────────────────────────────────────────────────
app.get('/api/lancs', async (_, res) => {
  try { const { rows } = await db.execute('SELECT * FROM lancs ORDER BY date DESC'); res.json(rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/lancs', async (req, res) => {
  try {
    const { tipo, desc, cat, valor, date } = req.body;
    if (!desc || !valor) return res.status(400).json({ error: 'Campos obrigatórios' });
    const id = uid('l');
    await db.execute({ sql: `INSERT INTO lancs (id,tipo,desc,cat,valor,date) VALUES (?,?,?,?,?,?)`, args: [id, tipo||'entrada', desc, cat||'outros', +valor, date||todayStr()] });
    const { rows } = await db.execute({ sql: 'SELECT * FROM lancs WHERE id=?', args: [id] });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/lancs/:id', async (req, res) => {
  try { await db.execute({ sql: 'DELETE FROM lancs WHERE id=?', args: [req.params.id] }); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── FUNIL ─────────────────────────────────────────────────────────────────────
app.get('/api/funnel', async (_, res) => {
  try { const { rows } = await db.execute('SELECT * FROM funnel_days ORDER BY date DESC'); res.json(rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/funnel/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const { alcance=0, interesse=0, intencao=0, compra=0, recompra=0, notes='' } = req.body;
    const { rows: [exists] } = await db.execute({ sql: 'SELECT id FROM funnel_days WHERE date=?', args: [date] });
    if (exists) {
      await db.execute({ sql: `UPDATE funnel_days SET alcance=?,interesse=?,intencao=?,compra=?,recompra=?,notes=? WHERE date=?`, args: [+alcance,+interesse,+intencao,+compra,+recompra,notes,date] });
    } else {
      await db.execute({ sql: `INSERT INTO funnel_days (id,date,alcance,interesse,intencao,compra,recompra,notes) VALUES (?,?,?,?,?,?,?,?)`, args: [uid('f'),date,+alcance,+interesse,+intencao,+compra,+recompra,notes] });
    }
    const { rows } = await db.execute({ sql: 'SELECT * FROM funnel_days WHERE date=?', args: [date] });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CONFIG ────────────────────────────────────────────────────────────────────
app.get('/api/config', async (_, res) => {
  try {
    const { rows } = await db.execute('SELECT * FROM config');
    const cfg = {};
    rows.forEach(r => { cfg[r.key] = r.value; });
    res.json(cfg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/config', async (req, res) => {
  try {
    const stmts = Object.entries(req.body).map(([k, v]) => ({ sql: 'INSERT OR REPLACE INTO config (key,value) VALUES (?,?)', args: [k, String(v||'')] }));
    if (stmts.length > 0) await db.batch(stmts, 'write');
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── BACKUP ────────────────────────────────────────────────────────────────────
app.get('/api/backup', async (_, res) => {
  try {
    const [{ rows: orders }, { rows: allSales }, { rows: insumos }, { rows: compras }, { rows: lancs }, { rows: funnel }, { rows: cfgRows }] = await Promise.all([
      db.execute('SELECT * FROM orders'),
      db.execute('SELECT * FROM sales ORDER BY date ASC'),
      db.execute('SELECT * FROM insumos'),
      db.execute('SELECT * FROM compras'),
      db.execute('SELECT * FROM lancs'),
      db.execute('SELECT * FROM funnel_days'),
      db.execute('SELECT * FROM config'),
    ]);
    const map = {};
    allSales.forEach(s => { if (!map[s.order_id]) map[s.order_id] = []; map[s.order_id].push({ ...s, items: JSON.parse(s.items||'[]') }); });
    const cfg = {};
    cfgRows.forEach(r => { cfg[r.key] = r.value; });
    res.json({
      version: 3, ts: new Date().toISOString(),
      orders:  orders.map(o => { const oo={...o}; oo.sales=map[oo.id]||[]; return oo; }),
      insumos: insumos.map(r => ({...r})),
      compras: compras.map(r => ({...r})),
      lancs:   lancs.map(r => ({...r})),
      funnel:  funnel.map(r => ({...r})),
      cfg,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── RESTORE ───────────────────────────────────────────────────────────────────
app.post('/api/restore', async (req, res) => {
  try {
    const { orders, insumos, compras, lancs, funnel, cfg } = req.body;
    if (orders) {
      const stmts = [
        { sql: 'DELETE FROM sales',  args: [] },
        { sql: 'DELETE FROM orders', args: [] },
        ...orders.map(o => ({ sql: `INSERT OR REPLACE INTO orders (id,name,phone,address,payment,status,date,notes,cat,total,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, args: [o.id,o.name,o.phone||'',o.address||'',o.payment||'pix',o.status||'confirmado',o.date||'',o.notes||'',o.cat||'brownie',o.total||0,o.created_at||Date.now()] })),
        ...orders.flatMap(o => (o.sales||[]).map(s => ({ sql: `INSERT OR REPLACE INTO sales (id,order_id,date,items,total,notes,flavor) VALUES (?,?,?,?,?,?,?)`, args: [s.id,o.id,s.date||'',typeof s.items==='string'?s.items:JSON.stringify(s.items||[]),s.total||0,s.notes||'',s.flavor||'tradicional'] }))),
      ];
      await db.batch(stmts, 'write');
    }
    if (insumos && insumos.length > 0) {
      await db.batch([
        { sql: 'DELETE FROM insumos', args: [] },
        ...insumos.map(i => ({ sql: `INSERT OR REPLACE INTO insumos (id,name,cat,unit,stock,min_stock) VALUES (?,?,?,?,?,?)`, args: [i.id,i.name,i.cat||'outros',i.unit||'un',+i.stock||0,+(i.min_stock||i.min)||0] })),
      ], 'write');
    }
    if (compras && compras.length > 0) {
      await db.batch([
        { sql: 'DELETE FROM compras', args: [] },
        ...compras.map(c => ({ sql: `INSERT OR REPLACE INTO compras (id,ins_id,ins_name,qty,price,total,date,forn) VALUES (?,?,?,?,?,?,?,?)`, args: [c.id,c.ins_id||'',c.ins_name||'',+c.qty||0,+c.price||0,+c.total||0,c.date||'',c.forn||''] })),
      ], 'write');
    }
    if (lancs && lancs.length > 0) {
      await db.batch([
        { sql: 'DELETE FROM lancs', args: [] },
        ...lancs.map(l => ({ sql: `INSERT OR REPLACE INTO lancs (id,tipo,desc,cat,valor,date) VALUES (?,?,?,?,?,?)`, args: [l.id,l.tipo||'entrada',l.desc||'',l.cat||'outros',+l.valor||0,l.date||''] })),
      ], 'write');
    }
    if (funnel && funnel.length > 0) {
      await db.batch([
        { sql: 'DELETE FROM funnel_days', args: [] },
        ...funnel.map(f => ({ sql: `INSERT OR REPLACE INTO funnel_days (id,date,alcance,interesse,intencao,compra,recompra,notes) VALUES (?,?,?,?,?,?,?,?)`, args: [f.id,f.date,+f.alcance||0,+f.interesse||0,+f.intencao||0,+f.compra||0,+f.recompra||0,f.notes||''] })),
      ], 'write');
    }
    if (cfg) {
      const cfgStmts = Object.entries(cfg).map(([k,v]) => ({ sql: 'INSERT OR REPLACE INTO config (key,value) VALUES (?,?)', args: [k,String(v||'')] }));
      if (cfgStmts.length > 0) await db.batch(cfgStmts, 'write');
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── COBRANÇAS ─────────────────────────────────────────────────────────────────
app.post('/api/cobrancas/disparar', async (req, res) => {
  try {
    const { orderId } = req.body;
    const result = orderId
      ? await cobranca.dispararUnica(db, orderId)
      : await cobranca.dispararTodas(db);
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/cobrancas/logs', async (_, res) => {
  try {
    const { rows } = await db.execute(`
      SELECT cl.*, o.name as order_name, o.phone as order_phone
      FROM cobrancas_log cl
      LEFT JOIN orders o ON o.id = cl.order_id
      ORDER BY cl.created_at DESC LIMIT 200
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── RAIZ ──────────────────────────────────────────────────────────────────────
app.get('/', (_, res) => res.send('🍫 API Brownie do Mig — backend online'));

// ── INIT DB + START ───────────────────────────────────────────────────────────
async function initDB() {
  await db.batch([
    { sql: `CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT DEFAULT '', address TEXT DEFAULT '', payment TEXT DEFAULT 'pix', status TEXT DEFAULT 'confirmado', date TEXT DEFAULT '', notes TEXT DEFAULT '', cat TEXT DEFAULT 'brownie', created_at INTEGER DEFAULT 0, total REAL DEFAULT 0)` },
    { sql: `CREATE TABLE IF NOT EXISTS sales (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, date TEXT DEFAULT '', items TEXT DEFAULT '[]', total REAL DEFAULT 0, notes TEXT DEFAULT '', flavor TEXT DEFAULT 'tradicional')` },
    { sql: `CREATE TABLE IF NOT EXISTS insumos (id TEXT PRIMARY KEY, name TEXT NOT NULL, cat TEXT DEFAULT 'outros', unit TEXT DEFAULT 'un', stock REAL DEFAULT 0, min_stock REAL DEFAULT 0)` },
    { sql: `CREATE TABLE IF NOT EXISTS compras (id TEXT PRIMARY KEY, ins_id TEXT DEFAULT '', ins_name TEXT DEFAULT '', qty REAL DEFAULT 0, price REAL DEFAULT 0, total REAL DEFAULT 0, date TEXT DEFAULT '', forn TEXT DEFAULT '')` },
    { sql: `CREATE TABLE IF NOT EXISTS lancs (id TEXT PRIMARY KEY, tipo TEXT DEFAULT 'entrada', desc TEXT DEFAULT '', cat TEXT DEFAULT 'outros', valor REAL DEFAULT 0, date TEXT DEFAULT '')` },
    { sql: `CREATE TABLE IF NOT EXISTS funnel_days (id TEXT PRIMARY KEY, date TEXT UNIQUE NOT NULL, alcance INTEGER DEFAULT 0, interesse INTEGER DEFAULT 0, intencao INTEGER DEFAULT 0, compra INTEGER DEFAULT 0, recompra INTEGER DEFAULT 0, notes TEXT DEFAULT '')` },
    { sql: `CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT DEFAULT '')` },
    { sql: `CREATE TABLE IF NOT EXISTS cobrancas_log (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, mensagem TEXT DEFAULT '', status TEXT DEFAULT 'enviado', created_at INTEGER DEFAULT 0, tentativa INTEGER DEFAULT 1)` },
  ], 'write');

  const { rows } = await db.execute('SELECT COUNT(*) as c FROM insumos');
  if (Number(rows[0].c) === 0) {
    await db.batch([
      ['i1','Chocolate em pó 100%','chocolate','kg',2.5,1],
      ['i2','Manteiga sem sal','lacteo','kg',1.8,0.5],
      ['i3','Ovos','lacteo','un',24,12],
      ['i4','Farinha de trigo','farinha','kg',3,1],
      ['i5','Açúcar','farinha','kg',4,1],
      ['i6','Nutella','chocolate','kg',0.5,0.5],
      ['i7','Caixas 6 unidades','embalagem','un',15,10],
      ['i8','Potinhos 200ml','embalagem','un',30,20],
      ['i9','Nozes picadas','outros','g',300,100],
    ].map(r => ({ sql: 'INSERT INTO insumos (id,name,cat,unit,stock,min_stock) VALUES (?,?,?,?,?,?)', args: r })), 'write');
  }
}

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🍫 Brownie do Mig — Backend em http://localhost:${PORT}\n`);
    });
  })
  .catch(err => {
    console.error('Erro fatal ao conectar ao banco:', err.message);
    process.exit(1);
  });
