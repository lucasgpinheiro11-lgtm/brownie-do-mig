const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function headers() {
  const token = localStorage.getItem('mg_token');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: headers(),
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const flowService = {
  listar:        ()           => req('GET',    '/api/flows'),
  criar:         (flow)       => req('POST',   '/api/flows', flow),
  atualizar:     (id, flow)   => req('PUT',    `/api/flows/${id}`, flow),
  deletar:       (id)         => req('DELETE', `/api/flows/${id}`),
  toggle:        (id)         => req('PATCH',  `/api/flows/${id}/toggle`),
  execucoes:     ()           => req('GET',    '/api/flows/execucoes'),
  executarAgora: ()           => req('POST',   '/api/flows/executar-agora'),
};
