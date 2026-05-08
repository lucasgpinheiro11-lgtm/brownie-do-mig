const BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

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
  listar:        ()           => req('GET',    '/flows'),
  criar:         (flow)       => req('POST',   '/flows', flow),
  atualizar:     (id, flow)   => req('PUT',    `/flows/${id}`, flow),
  deletar:       (id)         => req('DELETE', `/flows/${id}`),
  toggle:        (id)         => req('PATCH',  `/flows/${id}/toggle`),
  execucoes:     ()           => req('GET',    '/flows/execucoes'),
  executarAgora: ()           => req('POST',   '/flows/executar-agora'),
};
