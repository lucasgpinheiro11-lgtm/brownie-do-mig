// ── Agente de Cobrança com IA ─────────────────────────────────────────────────
'use strict';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Idempotência: IDs de mensagens já processadas (in-memory)
const processados = new Set();

function uid() { return 'wa' + Date.now() + Math.random().toString(36).slice(2, 5); }

// ── Normaliza telefone → 55XXXXXXXXXXX ───────────────────────────────────────
function normPhone(phone) {
  const d = (phone || '').replace(/\D/g, '').replace(/^0+/, '').replace(/^55/, '');
  return d.length >= 10 ? `55${d}` : null;
}

// ── Regras determinísticas (zero custo) ──────────────────────────────────────
function aplicarRegra(msg) {
  const m = msg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (/j[aá] paguei|j[aá] realizei|fiz o pix|fiz o pagamento|paguei hoje|mandei o pix|realizei/.test(m))
    return { regra: 'pagou', resposta: 'Perfeito! 😊 Pode me enviar o comprovante? Assim confirmo aqui e marco como pago! 🙏' };

  if (/vou pagar|pago amanh[aã]|pago hoje|pago essa semana|pago na sexta|pago segunda|pago em breve|prometo que pago/.test(m))
    return { regra: 'promessa', resposta: 'Ótimo! 😊 Fico no aguardo! Quando realizar, manda o comprovante para eu confirmar. Obrigado! 🙏' };

  if (/n[aã]o tenho|sem dinheiro|apertado|dificuldade|n[aã]o consigo|t[oô] sem/.test(m))
    return { regra: 'sem_dinheiro', resposta: 'Entendo! 😊 Sem problema, me fala qual a data que fica melhor para você, a gente combina um jeito. O importante é resolver juntos! 🙏' };

  if (/^(ok|certo|entendi|sim|claro|perfeito|combinado|blz|beleza|t[aá]|ta bom|show)[.!]?\s*$/.test(m))
    return { regra: 'confirmacao', resposta: 'Combinado! 😊 Qualquer dúvida é só me chamar.' };

  return null; // sem regra determinística → chama IA
}

// ── Groq (OpenAI-compatible, free tier) ──────────────────────────────────────
async function gerarRespostaIA(nome, valor, pix, dias, mensagem, historico = []) {
  const key   = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
  if (!key) { console.warn('[Agente] GROQ_API_KEY não configurado — usando fallback'); return null; }

  const ton = dias <= 3 ? 'leve e amigável' : dias <= 7 ? 'moderado e firme' : 'firme mas educado';

  const system = `Você é um assistente de cobrança da empresa Brownies do Mig.
Objetivo: receber pagamentos de forma educada, clara e firme.

Dados do cliente:
- Nome: ${nome}
- Valor devido: R$ ${valor}
- Chave Pix: ${pix || '(a informar)'}
- Dias em atraso: ${dias}
- Tom esperado: ${ton}

Regras obrigatórias:
- Nunca seja agressivo ou ameaçador
- Seja direto, estilo WhatsApp (máximo 3 linhas curtas)
- Se cliente disser que vai pagar → confirme e peça comprovante
- Se disser que não pode pagar → sugira combinar uma data
- Inclua a chave Pix apenas se fizer sentido no contexto da resposta
- Responda SOMENTE com o texto da mensagem, sem aspas ou explicações`;

  const messages = [
    { role: 'system', content: system },
    ...historico.slice(-6),       // últimas 3 trocas para contexto
    { role: 'user', content: mensagem },
  ];

  try {
    const ctrl    = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(GROQ_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body:    JSON.stringify({ model, messages, max_tokens: 180, temperature: 0.7 }),
      signal:  ctrl.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) { console.error('[Agente] Groq HTTP', res.status, await res.text()); return null; }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.error('[Agente] Groq falhou:', e.message);
    return null;
  }
}

// ── Resposta de segurança (tudo falhou) ───────────────────────────────────────
function respostaFallback(nome, pix) {
  return `Oi ${nome}! 😊 Vi sua mensagem! ${pix ? `Qualquer dúvida, o Pix é *${pix}*. ` : ''}Me chama que te ajudo! 🙏`;
}

// ── Envia via Z-API ───────────────────────────────────────────────────────────
async function zapiSend(phone, message) {
  const inst  = process.env.ZAPI_INSTANCE_ID;
  const token = process.env.ZAPI_TOKEN;
  const ct    = process.env.ZAPI_CLIENT_TOKEN;
  if (!inst || !token) { console.warn('[Agente] Z-API não configurado'); return false; }

  const url     = `https://api.z-api.io/instances/${inst}/token/${token}/send-text`;
  const headers = { 'Content-Type': 'application/json' };
  if (ct) headers['Client-Token'] = ct;

  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ phone, message }) });
    const raw = await res.text();
    console.log('[Agente] Z-API send →', res.status, raw.slice(0, 120));
    return res.ok;
  } catch (e) {
    console.error('[Agente] Z-API send error:', e.message);
    return false;
  }
}

// ── Persiste mensagem no banco ────────────────────────────────────────────────
async function logMsg(db, phone, orderId, direcao, mensagem, fonte) {
  await db.execute({
    sql:  `INSERT INTO mensagens_wa (id,phone,order_id,direcao,mensagem,fonte,created_at) VALUES (?,?,?,?,?,?,?)`,
    args: [uid(), phone, orderId || null, direcao, mensagem, fonte || 'sistema', Date.now()],
  });
}

// ── Atualiza / cria estado da conversa (UPSERT) ───────────────────────────────
async function upsertConversa(db, phone, orderId, pausar) {
  await db.execute({
    sql: `INSERT INTO conversas (phone,order_id,pausar_automacao,ultima_interacao,status_conversa)
          VALUES (?,?,?,?,'ativo')
          ON CONFLICT(phone) DO UPDATE SET
            order_id         = excluded.order_id,
            pausar_automacao = excluded.pausar_automacao,
            ultima_interacao = excluded.ultima_interacao`,
    args: [phone, orderId || null, pausar ? 1 : 0, Date.now()],
  });
}

// ── Busca histórico para contexto da IA (cronológico) ────────────────────────
async function buscarHistorico(db, phone) {
  const { rows } = await db.execute({
    sql:  `SELECT direcao, mensagem FROM mensagens_wa WHERE phone=? ORDER BY created_at DESC LIMIT 10`,
    args: [phone],
  });
  return rows.reverse().map(r => ({
    role:    r.direcao === 'entrada' ? 'user' : 'assistant',
    content: r.mensagem,
  }));
}

// ── Busca pedido pendente pelo telefone ───────────────────────────────────────
// Lida com o problema do "9" extra: Z-API pode enviar 8 dígitos (ex: 5181889218)
// enquanto o pedido foi cadastrado com 9 dígitos (ex: 51981889218) ou vice-versa.
async function buscarPedidoPendente(db, phone) {
  const norm = normPhone(phone);
  if (!norm) return null;

  const local = norm.replace(/^55/, ''); // ex: "5181889218" ou "51981889218"

  // Gera variantes com e sem o dígito 9 após o DDD
  const variants = new Set([local]);
  if (local.length === 10) {
    // Formato antigo (8 dígitos): insere 9 após o DDD (primeiros 2 dígitos)
    variants.add(local.slice(0, 2) + '9' + local.slice(2));
  } else if (local.length === 11 && local[2] === '9') {
    // Formato novo (9 dígitos): tenta sem o 9 também
    variants.add(local.slice(0, 2) + local.slice(3));
  }

  const strip = `replace(replace(replace(replace(replace(phone,'+',''),'-',''),' ',''),'(',''),')','')`;
  const conds = [...variants].map(() => `${strip} LIKE ?`).join(' OR ');

  const { rows } = await db.execute({
    sql: `SELECT * FROM orders
          WHERE (${conds})
            AND status IN ('vencido','avencer','confirmado','novo')
            AND total > 0
          ORDER BY date ASC
          LIMIT 1`,
    args: [...variants].map(v => `%${v}`),
  });
  return rows[0] || null;
}

// ── Verifica se automação está pausada ───────────────────────────────────────
async function automacaoPausada(db, phone) {
  const norm = normPhone(phone);
  if (!norm) return false;
  const { rows } = await db.execute({
    sql:  `SELECT pausar_automacao FROM conversas WHERE phone=?`,
    args: [norm],
  });
  return rows[0]?.pausar_automacao === 1;
}

// ── Retoma automação (ex: ao marcar pedido como pago) ────────────────────────
async function retomarAutomacao(db, phone) {
  const norm = normPhone(phone);
  if (!norm) return;
  await db.execute({
    sql:  `UPDATE conversas SET pausar_automacao=0 WHERE phone=?`,
    args: [norm],
  });
}

// ── Ponto de entrada principal ────────────────────────────────────────────────
async function processarMensagem(db, payload) {
  // ── Idempotência ──────────────────────────────────────────────────────────
  const msgId = payload.messageId || payload.id || '';
  if (msgId && processados.has(msgId)) {
    console.log('[Agente] Duplicado ignorado:', msgId);
    return { ignorado: true };
  }
  if (msgId) {
    processados.add(msgId);
    if (processados.size > 2000) processados.delete(processados.values().next().value);
  }

  // ── Filtros básicos ───────────────────────────────────────────────────────
  if (payload.fromMe === true || payload.fromMe === 'true')
    return { ignorado: true, motivo: 'fromMe' };

  // Aceita ReceivedCallback ou ausência de type (compatibilidade)
  if (payload.type && payload.type !== 'ReceivedCallback')
    return { ignorado: true, motivo: payload.type };

  const rawPhone = payload.phone || payload.sender || '';
  const phone    = normPhone(rawPhone);
  if (!phone) return { erro: 'telefone inválido', rawPhone };

  const texto = (payload.body || payload.text?.message || payload.message?.body || '').trim();
  if (!texto) return { ignorado: true, motivo: 'sem texto' };

  console.log(`[Agente] ← ${phone}: "${texto.slice(0, 80)}"`);

  // ── Busca pedido ──────────────────────────────────────────────────────────
  const order = await buscarPedidoPendente(db, phone);
  await logMsg(db, phone, order?.id || null, 'entrada', texto, 'cliente');

  if (!order) {
    console.log('[Agente] Sem pedido pendente para', phone);
    await upsertConversa(db, phone, null, true);
    return { processado: true, resposta: null, motivo: 'sem_pedido' };
  }

  // Pausa automação: cliente respondeu → suspende envios automáticos
  await upsertConversa(db, phone, order.id, true);

  // ── Contexto ──────────────────────────────────────────────────────────────
  const nome  = (order.name || 'Cliente').split(' ')[0];
  const valor = (+order.total || 0).toFixed(2).replace('.', ',');
  const { rows: pixRows } = await db.execute(`SELECT value FROM config WHERE key='pix'`);
  const pix   = pixRows[0]?.value || '';

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dtO  = order.date ? new Date(order.date + 'T00:00:00') : null;
  const dias = dtO && !isNaN(dtO) ? Math.max(0, Math.round((hoje - dtO) / 86400000)) : 0;

  // ── 1. Regra determinística ───────────────────────────────────────────────
  const regra = aplicarRegra(texto);
  let resposta, fonte;

  if (regra?.resposta) {
    resposta = regra.resposta;
    fonte    = 'regra';
    console.log(`[Agente] Regra aplicada: ${regra.regra}`);
  } else {
    // ── 2. IA com histórico de contexto ───────────────────────────────────
    console.log('[Agente] Chamando IA (Groq)...');
    const historico = await buscarHistorico(db, phone);
    resposta = await gerarRespostaIA(nome, valor, pix, dias, texto, historico);
    fonte    = 'ia';

    if (!resposta) {
      // ── 3. Fallback de segurança ──────────────────────────────────────
      resposta = respostaFallback(nome, pix);
      fonte    = 'fallback';
      console.log('[Agente] Usando fallback');
    }
  }

  console.log(`[Agente] → ${phone} [${fonte}]: "${resposta.slice(0, 80)}"`);

  await logMsg(db, phone, order.id, 'saida', resposta, fonte);
  await zapiSend(phone, resposta);

  return { processado: true, phone, orderId: order.id, fonte, resposta };
}

module.exports = { processarMensagem, automacaoPausada, retomarAutomacao, normPhone };
