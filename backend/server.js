// Node 22+ built-in SQLite — no native build needed
const { DatabaseSync } = require('node:sqlite');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');

// ── AUTH ──────────────────────────────────────────────────────────────────────
const JWT_SECRET  = process.env.JWT_SECRET  || 'brownie-do-mig-secret-2025';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '24h';

const USERS = [
  { cpf: '81496770030', password: '123456', name: 'Lucas Pinheiro'  },
  { cpf: '83811150006', password: '123456', name: 'Daniela Maciel'  },
  { cpf: '86521489020', password: '123456', name: 'Miguel Pinheiro' },
];

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json({ limit: '20mb' }));

// ── LOGIN (public — no token required) ───────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { cpf, password } = req.body;
  const raw = String(cpf || '').replace(/\D/g, '');
  const user = USERS.find(u => u.cpf === raw && u.password === String(password || ''));
  if (!user) return res.status(401).json({ error: 'CPF ou senha inválidos' });
  const token = jwt.sign({ cpf: user.cpf, name: user.name }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  res.json({ token, user: { cpf: user.cpf, name: user.name } });
});

// ── AUTH MIDDLEWARE (applies to all /api routes except /auth/login) ───────────
app.use('/api', (req, res, next) => {
  // req.path here is relative to /api, so /api/auth/login → /auth/login
  if (req.path.startsWith('/auth/')) return next();
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido ou expirado. Faça login novamente.' });
  }
});

// ── DATABASE ─────────────────────────────────────────────────────────────────
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'brownie.db');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode=WAL');
db.exec('PRAGMA foreign_keys=ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    phone       TEXT DEFAULT '',
    address     TEXT DEFAULT '',
    payment     TEXT DEFAULT 'pix',
    status      TEXT DEFAULT 'confirmado',
    date        TEXT DEFAULT '',
    notes       TEXT DEFAULT '',
    cat         TEXT DEFAULT 'brownie',
    created_at  INTEGER DEFAULT 0,
    total       REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sales (
    id          TEXT PRIMARY KEY,
    order_id    TEXT NOT NULL,
    date        TEXT DEFAULT '',
    items       TEXT DEFAULT '[]',
    total       REAL DEFAULT 0,
    notes       TEXT DEFAULT '',
    flavor      TEXT DEFAULT 'tradicional'
  );

  CREATE TABLE IF NOT EXISTS insumos (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    cat         TEXT DEFAULT 'outros',
    unit        TEXT DEFAULT 'un',
    stock       REAL DEFAULT 0,
    min_stock   REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS compras (
    id          TEXT PRIMARY KEY,
    ins_id      TEXT DEFAULT '',
    ins_name    TEXT DEFAULT '',
    qty         REAL DEFAULT 0,
    price       REAL DEFAULT 0,
    total       REAL DEFAULT 0,
    date        TEXT DEFAULT '',
    forn        TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS lancs (
    id          TEXT PRIMARY KEY,
    tipo        TEXT DEFAULT 'entrada',
    desc        TEXT DEFAULT '',
    cat         TEXT DEFAULT 'outros',
    valor       REAL DEFAULT 0,
    date        TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS funnel_days (
    id          TEXT PRIMARY KEY,
    date        TEXT UNIQUE NOT NULL,
    alcance     INTEGER DEFAULT 0,
    interesse   INTEGER DEFAULT 0,
    intencao    INTEGER DEFAULT 0,
    compra      INTEGER DEFAULT 0,
    recompra    INTEGER DEFAULT 0,
    notes       TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT DEFAULT ''
  );
`);

// ── SEED ─────────────────────────────────────────────────────────────────────
const insCount = db.prepare('SELECT COUNT(*) as c FROM insumos').get();
if (insCount.c === 0) {
  const stmt = db.prepare('INSERT INTO insumos (id,name,cat,unit,stock,min_stock) VALUES (?,?,?,?,?,?)');
  [
    ['i1','Chocolate em pó 100%','chocolate','kg',2.5,1],
    ['i2','Manteiga sem sal','lacteo','kg',1.8,0.5],
    ['i3','Ovos','lacteo','un',24,12],
    ['i4','Farinha de trigo','farinha','kg',3,1],
    ['i5','Açúcar','farinha','kg',4,1],
    ['i6','Nutella','chocolate','kg',0.5,0.5],
    ['i7','Caixas 6 unidades','embalagem','un',15,10],
    ['i8','Potinhos 200ml','embalagem','un',30,20],
    ['i9','Nozes picadas','outros','g',300,100],
  ].forEach(row => stmt.run(...row));
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function uid(prefix = '') {
  return prefix + Date.now() + Math.random().toString(36).slice(2, 5);
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

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

function withSales(order) {
  if (!order) return null;
  const sales = db.prepare('SELECT * FROM sales WHERE order_id=? ORDER BY date ASC').all(order.id);
  order.sales = sales.map(s => ({ ...s, items: JSON.parse(s.items || '[]') }));
  return autoClassify(order);
}

function allOrdersWithSales() {
  const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  const allSales = db.prepare('SELECT * FROM sales ORDER BY date ASC').all();
  const map = {};
  allSales.forEach(s => {
    if (!map[s.order_id]) map[s.order_id] = [];
    map[s.order_id].push({ ...s, items: JSON.parse(s.items || '[]') });
  });
  return orders.map(o => { o.sales = map[o.id] || []; return autoClassify(o); });
}

function recalcOrderTotal(orderId) {
  const res = db.prepare('SELECT SUM(total) as t FROM sales WHERE order_id=?').get(orderId);
  db.prepare('UPDATE orders SET total=? WHERE id=?').run(res.t || 0, orderId);
}

function recalcOrderCat(orderId) {
  const rows = db.prepare('SELECT items FROM sales WHERE order_id=?').all(orderId);
  let cat = 'brownie';
  rows.forEach(r => {
    const items = JSON.parse(r.items || '[]');
    if (items.some(i => i.k === 'kt')) { cat = 'kit'; return; }
    if (items.some(i => i.k === 'bp' || i.k === 'bn')) cat = 'bolo_pote';
  });
  db.prepare('UPDATE orders SET cat=? WHERE id=?').run(cat, orderId);
}

// ── ORDERS ────────────────────────────────────────────────────────────────────
app.get('/api/orders', (_, res) => {
  try { res.json(allOrdersWithSales()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/orders', (req, res) => {
  try {
    const { name, phone, address, payment, date, notes, cat, items, saleDate, saleNotes, flavor } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
    const id = uid('o');
    const saleTotal = (items || []).reduce((s, i) => s + i.qty * i.p, 0);
    db.prepare(`INSERT INTO orders (id,name,phone,address,payment,status,date,notes,cat,total,created_at)
                VALUES (?,?,?,?,?,'confirmado',?,?,?,?,?)`)
      .run(id, name, phone||'', address||'', payment||'pix', date||'', notes||'', cat||'brownie', saleTotal, Date.now());
    if ((items||[]).length > 0) {
      db.prepare(`INSERT INTO sales (id,order_id,date,items,total,notes,flavor) VALUES (?,?,?,?,?,?,?)`)
        .run(uid('s'), id, saleDate||todayStr(), JSON.stringify(items), saleTotal, saleNotes||'', flavor||'tradicional');
    }
    res.json(withSales(db.prepare('SELECT * FROM orders WHERE id=?').get(id)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/orders/:id', (req, res) => {
  try {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
    if (!o) return res.status(404).json({ error: 'Não encontrado' });
    const { phone, address, payment, status, date, notes } = req.body;
    db.prepare(`UPDATE orders SET phone=?,address=?,payment=?,status=?,date=?,notes=? WHERE id=?`)
      .run(phone??o.phone, address??o.address, payment??o.payment, status??o.status, date??o.date, notes??o.notes, req.params.id);
    res.json(withSales(db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/orders/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM sales WHERE order_id=?').run(req.params.id);
    db.prepare('DELETE FROM orders WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/orders/:id/pay', (req, res) => {
  try {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
    if (!o) return res.status(404).json({ error: 'Não encontrado' });
    if (o.status !== 'pago') {
      db.prepare(`UPDATE orders SET status='pago' WHERE id=?`).run(req.params.id);
      db.prepare(`INSERT INTO lancs (id,tipo,desc,cat,valor,date) VALUES (?,?,?,?,?,?)`)
        .run(uid('l'), 'entrada', 'Conta quitada — '+o.name, 'venda', o.total, todayStr());
    }
    res.json(withSales(db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/orders/:id/sales', (req, res) => {
  try {
    const { id } = req.params;
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
    if (!o) return res.status(404).json({ error: 'Não encontrado' });
    const { items, date, notes, flavor } = req.body;
    const saleTotal = (items||[]).reduce((s,i)=>s+i.qty*i.p, 0);
    db.prepare(`INSERT INTO sales (id,order_id,date,items,total,notes,flavor) VALUES (?,?,?,?,?,?,?)`)
      .run(uid('s'), id, date||todayStr(), JSON.stringify(items||[]), saleTotal, notes||'', flavor||'tradicional');
    recalcOrderTotal(id);
    recalcOrderCat(id);
    res.json(withSales(db.prepare('SELECT * FROM orders WHERE id=?').get(id)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/orders/:id/sales/:sid', (req, res) => {
  try {
    db.prepare('DELETE FROM sales WHERE id=? AND order_id=?').run(req.params.sid, req.params.id);
    recalcOrderTotal(req.params.id);
    res.json(withSales(db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── INSUMOS ───────────────────────────────────────────────────────────────────
app.get('/api/insumos', (_, res) => {
  try { res.json(db.prepare('SELECT * FROM insumos').all()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/insumos', (req, res) => {
  try {
    const { name, cat, unit, stock, min_stock } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
    const id = uid('i');
    db.prepare(`INSERT INTO insumos (id,name,cat,unit,stock,min_stock) VALUES (?,?,?,?,?,?)`)
      .run(id, name, cat||'outros', unit||'un', +stock||0, +min_stock||0);
    res.json(db.prepare('SELECT * FROM insumos WHERE id=?').get(id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/insumos/:id', (req, res) => {
  try {
    const { name, cat, unit, stock, min_stock } = req.body;
    db.prepare(`UPDATE insumos SET name=?,cat=?,unit=?,stock=?,min_stock=? WHERE id=?`)
      .run(name, cat, unit, +stock||0, +min_stock||0, req.params.id);
    res.json(db.prepare('SELECT * FROM insumos WHERE id=?').get(req.params.id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/insumos/:id', (req, res) => {
  try { db.prepare('DELETE FROM insumos WHERE id=?').run(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── COMPRAS ───────────────────────────────────────────────────────────────────
app.get('/api/compras', (_, res) => {
  try { res.json(db.prepare('SELECT * FROM compras ORDER BY date DESC').all()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/compras', (req, res) => {
  try {
    const { ins_id, qty, price, date, forn } = req.body;
    if (!ins_id || !qty || !price) return res.status(400).json({ error: 'Campos obrigatórios' });
    const ins = db.prepare('SELECT * FROM insumos WHERE id=?').get(ins_id);
    if (!ins) return res.status(404).json({ error: 'Insumo não encontrado' });
    const total = +qty * +price, id = uid('c'), dt = date || todayStr();
    db.prepare(`INSERT INTO compras (id,ins_id,ins_name,qty,price,total,date,forn) VALUES (?,?,?,?,?,?,?,?)`)
      .run(id, ins_id, ins.name, +qty, +price, total, dt, forn||'');
    db.prepare(`UPDATE insumos SET stock=stock+? WHERE id=?`).run(+qty, ins_id);
    db.prepare(`INSERT INTO lancs (id,tipo,desc,cat,valor,date) VALUES (?,?,?,?,?,?)`)
      .run(uid('l'), 'saida', 'Compra: '+ins.name, 'insumo', total, dt);
    res.json({
      compra: db.prepare('SELECT * FROM compras WHERE id=?').get(id),
      insumo: db.prepare('SELECT * FROM insumos WHERE id=?').get(ins_id),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/compras/:id', (req, res) => {
  try { db.prepare('DELETE FROM compras WHERE id=?').run(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── LANÇAMENTOS ───────────────────────────────────────────────────────────────
app.get('/api/lancs', (_, res) => {
  try { res.json(db.prepare('SELECT * FROM lancs ORDER BY date DESC').all()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/lancs', (req, res) => {
  try {
    const { tipo, desc, cat, valor, date } = req.body;
    if (!desc || !valor) return res.status(400).json({ error: 'Campos obrigatórios' });
    const id = uid('l');
    db.prepare(`INSERT INTO lancs (id,tipo,desc,cat,valor,date) VALUES (?,?,?,?,?,?)`)
      .run(id, tipo||'entrada', desc, cat||'outros', +valor, date||todayStr());
    res.json(db.prepare('SELECT * FROM lancs WHERE id=?').get(id));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/lancs/:id', (req, res) => {
  try { db.prepare('DELETE FROM lancs WHERE id=?').run(req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ── FUNIL ─────────────────────────────────────────────────────────────────────
app.get('/api/funnel', (_, res) => {
  try { res.json(db.prepare('SELECT * FROM funnel_days ORDER BY date DESC').all()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/funnel/:date', (req, res) => {
  try {
    const { date } = req.params;
    const { alcance=0, interesse=0, intencao=0, compra=0, recompra=0, notes='' } = req.body;
    const exists = db.prepare('SELECT id FROM funnel_days WHERE date=?').get(date);
    if (exists) {
      db.prepare(`UPDATE funnel_days SET alcance=?,interesse=?,intencao=?,compra=?,recompra=?,notes=? WHERE date=?`)
        .run(+alcance, +interesse, +intencao, +compra, +recompra, notes, date);
    } else {
      db.prepare(`INSERT INTO funnel_days (id,date,alcance,interesse,intencao,compra,recompra,notes) VALUES (?,?,?,?,?,?,?,?)`)
        .run(uid('f'), date, +alcance, +interesse, +intencao, +compra, +recompra, notes);
    }
    res.json(db.prepare('SELECT * FROM funnel_days WHERE date=?').get(date));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CONFIG ────────────────────────────────────────────────────────────────────
app.get('/api/config', (_, res) => {
  try {
    const rows = db.prepare('SELECT * FROM config').all();
    const cfg = {};
    rows.forEach(r => { cfg[r.key] = r.value; });
    res.json(cfg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/config', (req, res) => {
  try {
    const stmt = db.prepare('INSERT OR REPLACE INTO config (key,value) VALUES (?,?)');
    Object.entries(req.body).forEach(([k,v]) => stmt.run(k, String(v||'')));
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── BACKUP / RESTORE ──────────────────────────────────────────────────────────
app.get('/api/backup', (_, res) => {
  try {
    const cfgRows = db.prepare('SELECT * FROM config').all();
    const cfg = {};
    cfgRows.forEach(r => { cfg[r.key] = r.value; });
    res.json({
      version: 3, ts: new Date().toISOString(),
      orders:  allOrdersWithSales(),
      insumos: db.prepare('SELECT * FROM insumos').all(),
      compras: db.prepare('SELECT * FROM compras').all(),
      lancs:   db.prepare('SELECT * FROM lancs').all(),
      funnel:  db.prepare('SELECT * FROM funnel_days').all(),
      cfg,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/restore', (req, res) => {
  try {
    const { orders, insumos, compras, lancs, funnel, cfg } = req.body;
    db.exec('BEGIN');
    try {
      if (orders) {
        db.exec('DELETE FROM sales'); db.exec('DELETE FROM orders');
        const oS = db.prepare(`INSERT OR REPLACE INTO orders (id,name,phone,address,payment,status,date,notes,cat,total,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
        const sS = db.prepare(`INSERT OR REPLACE INTO sales (id,order_id,date,items,total,notes,flavor) VALUES (?,?,?,?,?,?,?)`);
        orders.forEach(o => {
          oS.run(o.id,o.name,o.phone||'',o.address||'',o.payment||'pix',o.status||'confirmado',o.date||'',o.notes||'',o.cat||'brownie',o.total||0,o.created_at||o.createdAt||Date.now());
          (o.sales||[]).forEach(s => sS.run(s.id,o.id,s.date||'',typeof s.items==='string'?s.items:JSON.stringify(s.items||[]),s.total||0,s.notes||'',s.flavor||'tradicional'));
        });
      }
      if (insumos) {
        db.exec('DELETE FROM insumos');
        const iS = db.prepare(`INSERT OR REPLACE INTO insumos (id,name,cat,unit,stock,min_stock) VALUES (?,?,?,?,?,?)`);
        insumos.forEach(i => iS.run(i.id,i.name,i.cat||'outros',i.unit||'un',+i.stock||0,+(i.min_stock||i.min)||0));
      }
      if (compras) {
        db.exec('DELETE FROM compras');
        const cS = db.prepare(`INSERT OR REPLACE INTO compras (id,ins_id,ins_name,qty,price,total,date,forn) VALUES (?,?,?,?,?,?,?,?)`);
        compras.forEach(c => cS.run(c.id,c.ins_id||c.insId||'',c.ins_name||c.insName||'',+c.qty||0,+c.price||0,+c.total||0,c.date||'',c.forn||''));
      }
      if (lancs) {
        db.exec('DELETE FROM lancs');
        const lS = db.prepare(`INSERT OR REPLACE INTO lancs (id,tipo,desc,cat,valor,date) VALUES (?,?,?,?,?,?)`);
        lancs.forEach(l => lS.run(l.id,l.tipo||'entrada',l.desc||l.descricao||'',l.cat||'outros',+l.valor||0,l.date||''));
      }
      if (funnel) {
        db.exec('DELETE FROM funnel_days');
        const fS = db.prepare(`INSERT OR REPLACE INTO funnel_days (id,date,alcance,interesse,intencao,compra,recompra,notes) VALUES (?,?,?,?,?,?,?,?)`);
        funnel.forEach(f => fS.run(f.id,f.date,+f.alcance||0,+f.interesse||0,+f.intencao||0,+f.compra||0,+f.recompra||0,f.notes||''));
      }
      if (cfg) {
        const cfgS = db.prepare('INSERT OR REPLACE INTO config (key,value) VALUES (?,?)');
        Object.entries(cfg).forEach(([k,v]) => cfgS.run(k,String(v||'')));
      }
      db.exec('COMMIT');
      res.json({ ok: true });
    } catch (inner) {
      db.exec('ROLLBACK');
      throw inner;
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send('🍫 API Brownie do Mig rodando ONLINE 🚀');
});

app.listen(PORT, () => {
  console.log(`\n🍫 Brownie do Mig — Backend em http://localhost:${PORT}\n`);
});
