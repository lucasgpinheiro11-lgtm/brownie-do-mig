// ── Formatting ────────────────────────────────────────────────────────────────
export function fR(v) {
  return `R$${(+v || 0).toFixed(0)}`;
}

export function fRDec(v) {
  return `R$ ${(+v || 0).toFixed(2).replace('.', ',')}`;
}

export function fD(dateStr) {
  if (!dateStr) return '';
  const s = String(dateStr);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  return `${m[3]}/${m[2]}`;
}

export function today() {
  return new Date().toISOString().split('T')[0];
}

export function daysDiff(dateStr) {
  if (!dateStr) return null;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d)) return null;
  return Math.round((d - t) / 86400000);
}

// ── Period filter ─────────────────────────────────────────────────────────────
export function filtPer(arr, per, field = 'date') {
  const now = new Date();
  return arr.filter(item => {
    const raw = item[field] || '';
    if (!raw) return per === 'tudo';
    const d = new Date(raw + 'T00:00:00');
    if (per === 'semana') { const w = new Date(now); w.setDate(w.getDate() - 7); return d >= w; }
    if (per === 'mes') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (per === 'mesant') { const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1); return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear(); }
    return true;
  });
}

// ── Data constants ────────────────────────────────────────────────────────────
export const PRODS = {
  bt: { n: 'Brownie Tradicional', p: 8,  e: '🍫', c: 'brownie' },
  br: { n: 'Brownie Recheado',    p: 10, e: '🍫', c: 'brownie' },
  bc: { n: 'Caixa 6 Brownies',   p: 45, e: '📦', c: 'brownie' },
  bp: { n: 'Bolo de Pote',        p: 18, e: '🍮', c: 'bolo_pote' },
  bn: { n: 'Bolo Pote Nutella',   p: 22, e: '🍮', c: 'bolo_pote' },
  kt: { n: 'Kit Presente',        p: 55, e: '🎁', c: 'kit' },
  cx: { n: 'Personalizado',       p: 0,  e: '✏️', c: 'brownie' },
};

export const STATUS_COLORS = {
  novo:       '#9C27B0',
  confirmado: '#1976D2',
  avencer:    '#F57F17',
  vencido:    '#C62828',
  pago:       '#2E7D32',
  cancelado:  '#D32F2F',
};

export const STATUS_LABELS = {
  novo:       '📩 Novo',
  confirmado: '✅ Confirmado',
  avencer:    '⏰ A Vencer',
  vencido:    '🔴 Vencido',
  pago:       '💰 Pago',
  cancelado:  '❌ Cancelado',
};

export const PAYMENT_LABELS = {
  pix:      '🔵 Pix',
  dinheiro: '💵 Din.',
  cartao:   '💳 Crt.',
  pendente: '⏳ Fiado',
};

export const PAYMENT_COLORS = {
  pix:      ['#E3F2FD', '#1565C0'],
  dinheiro: ['#E8F5E9', '#1B5E20'],
  cartao:   ['#F3E5F5', '#6A1B9A'],
  pendente: ['#FFF3E0', '#E65100'],
};

export const FLAVOR_LABELS = {
  tradicional: 'Tradicional',
  ninho:       'Ninho',
  oreo:        'Oreo',
  outro:       'Outro',
};

export const CAT_ICONS = {
  chocolate: '🍫',
  farinha:   '🌾',
  lacteo:    '🥛',
  embalagem: '📦',
  outros:    '📌',
};

export const WEEK_DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// ── Misc ──────────────────────────────────────────────────────────────────────
export function uid(prefix = '') {
  return prefix + Date.now() + Math.random().toString(36).slice(2, 5);
}

export function buildWaMsg(template, order, pixKey) {
  const its = (order.sales || []).flatMap(s => s.items || [])
    .map(i => `  ${i.e || '🍫'} ${i.qty}x ${i.n} - R$ ${(i.qty * i.p).toFixed(2).replace('.', ',')}`)
    .join('\n');
  const payLabel = { pix: 'Pix 🔵', dinheiro: 'Dinheiro 💵', cartao: 'Cartão 💳', pendente: 'A Combinar ⏳' }[order.payment] || order.payment;
  return template
    .replace(/{nome}/g,      order.name || '')
    .replace(/{itens}/g,     its)
    .replace(/{total}/g,     fRDec(order.total))
    .replace(/{pagamento}/g, payLabel)
    .replace(/{data}/g,      fD(order.date) || '')
    .replace(/{endereco}/g,  order.address ? `📍 ${order.address}` : '')
    .replace(/{pix}/g,       pixKey || '(chave pix não configurada)');
}
