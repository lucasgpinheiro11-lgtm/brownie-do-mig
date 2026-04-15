const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

function getToken() { return localStorage.getItem('mg_token'); }

async function req(path, opts = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    headers,
    ...opts,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) {
    localStorage.removeItem('mg_token');
    localStorage.removeItem('mg_user');
    window.dispatchEvent(new Event('auth:logout'));
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Sessão expirada. Faça login novamente.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Erro ${res.status}`);
  }
  return res.json();
}

export const login = (cpf, password) => req('/auth/login', { method: 'POST', body: { cpf, password } });

// Orders
export const getOrders    = ()         => req('/orders');
export const createOrder  = (data)     => req('/orders',          { method:'POST',   body: data });
export const updateOrder  = (id, data) => req(`/orders/${id}`,    { method:'PUT',    body: data });
export const deleteOrder  = (id)       => req(`/orders/${id}`,    { method:'DELETE' });
export const payOrder     = (id)       => req(`/orders/${id}/pay`,{ method:'POST' });
export const addSale      = (id, data) => req(`/orders/${id}/sales`,           { method:'POST',   body: data });
export const deleteSale   = (oid, sid) => req(`/orders/${oid}/sales/${sid}`,   { method:'DELETE' });

// Insumos
export const getInsumos    = ()         => req('/insumos');
export const createInsumo  = (data)     => req('/insumos',         { method:'POST',   body: data });
export const updateInsumo  = (id, data) => req(`/insumos/${id}`,   { method:'PUT',    body: data });
export const deleteInsumo  = (id)       => req(`/insumos/${id}`,   { method:'DELETE' });

// Compras de insumos
export const getCompras   = ()     => req('/compras');
export const createCompra = (data) => req('/compras', { method:'POST',   body: data });
export const deleteCompra = (id)   => req(`/compras/${id}`, { method:'DELETE' });

// Lançamentos
export const getLancs   = ()     => req('/lancs');
export const createLanc = (data) => req('/lancs', { method:'POST',   body: data });
export const deleteLanc = (id)   => req(`/lancs/${id}`, { method:'DELETE' });

// Funil
export const getFunnel   = ()          => req('/funnel');
export const saveFunnel  = (date, data)=> req(`/funnel/${date}`, { method:'PUT', body: data });

// Config
export const getConfig  = ()     => req('/config');
export const saveConfig = (data) => req('/config', { method:'POST', body: data });

// Backup / Restore
export const getBackup = ()     => req('/backup');
export const restore   = (data) => req('/restore', { method:'POST', body: data });
