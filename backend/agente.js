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

  // "já paguei" → NUNCA aceitar como confirmação, sempre pedir comprovante
  if (/j[aá] paguei|j[aá] realizei|fiz o pix|fiz o pagamento|paguei hoje|mandei o pix|realizei/.test(m))
    return { regra: 'pagou_sem_comprovante', resposta: 'Que ótimo! 😊 Para confirmarmos e liberar seu pedido, preciso do comprovante de pagamento. Pode enviar uma foto ou o código da transação? 🙏' };

  // Promessa de pagamento → agradecer e definir prazo
  if (/vou pagar|pago amanh[aã]|pago essa semana|pago na sexta|pago segunda|pago em breve|prometo/.test(m))
    return { regra: 'promessa', resposta: 'Perfeito! 😊 Anota o Pix para facilitar na hora H. Assim que realizar, me manda o comprovante para eu confirmar na hora! 🙏' };

  // Dificuldade financeira → empatia e negociação
  if (/n[aã]o tenho|sem dinheiro|apertado|dificuldade|n[aã]o consigo|t[oô] sem|nao posso/.test(m))
    return { regra: 'sem_dinheiro', resposta: 'Entendo, sem problema! 😊 Me conta qual data fica melhor pra você e a gente encontra uma solução juntos. O importante é manter a comunicação! 🤝' };

  // Pede a chave Pix → fornecer via IA (que tem o dado no contexto)
  if (/\bpix\b|qual.*chave|como.*pago|como.*transfer|manda.*pix|qual.*pix|chave.*pix/.test(m))
    return null; // IA inclui o pix no contexto

  // Confirmações curtas → encerrar amigavelmente
  if (/^(ok|certo|entendi|sim|claro|perfeito|combinado|blz|beleza|t[aá]|ta bom|show|otimo|obrigad)[.!]?\s*$/.test(m))
    return { regra: 'confirmacao', resposta: 'Combinado! 😊 Qualquer dúvida pode me chamar.' };

  return null; // sem regra → IA
}

// ── Groq (OpenAI-compatible, free tier) ──────────────────────────────────────
async function gerarRespostaIA(nome, valor, pix, dias, mensagem, historico = []) {
  const key   = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
  if (!key) { console.warn('[Agente] GROQ_API_KEY não configurado — usando fallback'); return null; }

  const ton = dias <= 3 ? 'leve e acolhedor' : dias <= 7 ? 'firme e objetivo' : 'sério mas respeitoso';

  const system = `Você é um assistente especializado em cobranças da empresa *Brownies do Mig*, uma confeitaria artesanal.
Seu nome é Mig. Você é experiente, amigável e profissional — como um atendente humano de alto nível.

━━━ DADOS DO CLIENTE ━━━
Nome: ${nome}
Valor em aberto: R$ ${valor}
Chave Pix: ${pix || 'solicitar ao financeiro'}
Dias em atraso: ${dias}
Tom desta conversa: ${ton}

━━━ REGRAS INEGOCIÁVEIS ━━━
1. NUNCA confirme pagamento sem comprovante — palavras como "já paguei" NÃO são prova
2. Sempre solicite: foto do comprovante OU código/ID da transação Pix
3. Se receber comprovante em imagem: agradeça, informe que está analisando e peça o código da transação para confirmar manualmente
4. Jamais seja agressivo, ameaçador ou irônico
5. Se cliente pedir prazo → acolha, peça data específica, confirme o combinado
6. Se detectar informação suspeita ou inconsistente → informe que vai verificar e não confirme nada

━━━ ESTILO ━━━
- WhatsApp: direto, no máximo 3 linhas
- Use emojis com moderação (1-2 por mensagem)
- Linguagem próxima, mas profissional — não use gírias
- Sempre assine como: _Brownies do Mig_ 🍫 (apenas no primeiro contato ou quando encerrar conversa)

━━━ FLUXO DE COMPROVANTE ━━━
- Cliente diz que pagou → peça comprovante
- Cliente envia comprovante/foto → "Recebi! Estou verificando os dados... Pode confirmar o código da transação Pix? (começa com E ou começa após 'ID:')"
- Comprovante confirmado → "Pagamento verificado! ✅ Muito obrigado, ${nome}! Seu pedido está regularizado."

Responda SOMENTE com o texto da mensagem. Sem aspas, sem prefixo "Mig:", sem explicações.`;

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

  // ── Detecta tipo de mídia (imagem/documento = possível comprovante) ─────────
  const temImagem   = !!(payload.image || payload.document || payload.video);
  const textoBase   = (payload.body || payload.text?.message || payload.message?.body || payload.caption || '').trim();
  const legendaImagem = payload.image?.caption || payload.document?.caption || '';

  // Texto final: se veio imagem sem texto, sinaliza internamente
  const texto = textoBase || (temImagem ? '[COMPROVANTE_IMAGEM]' : '');
  if (!texto) return { ignorado: true, motivo: 'sem texto' };

  console.log(`[Agente] ← ${phone}: ${temImagem ? '[imagem] ' : ''}"${textoBase.slice(0, 80)}"`);

  // ── Busca pedido ──────────────────────────────────────────────────────────
  const order = await buscarPedidoPendente(db, phone);
  const logTexto = temImagem ? `[imagem enviada] ${legendaImagem}`.trim() : texto;
  await logMsg(db, phone, order?.id || null, 'entrada', logTexto, 'cliente');

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

  // ── Resposta para comprovante em imagem ──────────────────────────────────
  if (temImagem) {
    const resposta = `Recebi a imagem, obrigado ${nome}! 😊\n\nEstou verificando os dados... Para agilizar a confirmação, pode me informar também o *código da transação Pix*? (é o código que começa com "E" no comprovante) 🙏`;
    console.log('[Agente] Imagem recebida → solicitando código da transação');
    await logMsg(db, phone, order.id, 'saida', resposta, 'regra');
    await zapiSend(phone, resposta);
    return { processado: true, phone, orderId: order.id, fonte: 'regra', resposta };
  }

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
