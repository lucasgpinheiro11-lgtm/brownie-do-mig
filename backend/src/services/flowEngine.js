'use strict';

const { sendText, interpolate } = require('./messageSender');

function uid() { return 'fe' + Date.now() + Math.random().toString(36).slice(2, 5); }
function nowISO() { return new Date().toISOString(); }

// Avança execução até encontrar um nó de espera ou finalizar
async function executarFluxo(db, flow, card, execucaoExistente = null) {
  const nos = typeof flow.nos === 'string' ? JSON.parse(flow.nos) : flow.nos;
  if (!nos || nos.length === 0) return;

  let execId, noAtual, historico;

  if (execucaoExistente) {
    execId   = execucaoExistente.id;
    noAtual  = execucaoExistente.no_atual;
    historico = typeof execucaoExistente.historico === 'string'
      ? JSON.parse(execucaoExistente.historico)
      : execucaoExistente.historico;
  } else {
    execId   = uid();
    noAtual  = nos[0]?.id;
    historico = [];
    await db.execute({
      sql:  `INSERT INTO flow_executions (id,flow_id,card_id,cliente_nome,cliente_contato,no_atual,status,historico,iniciado_em,proximo_disparo) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      args: [execId, flow.id, card.id, card.name || '', card.phone || '', noAtual, 'em_andamento', '[]', nowISO(), null],
    });
  }

  const vars = buildVars(card);

  while (noAtual) {
    const no = nos.find(n => n.id === noAtual);
    if (!no) break;

    const resultado = await executarNo(db, no, card, vars, execId, historico);

    historico.push({ no_id: no.id, executado_em: nowISO(), resultado: resultado.resultado, detalhes: resultado.detalhes || {} });
    await salvarHistorico(db, execId, historico);

    if (resultado.pausar) {
      // Nó de espera: registrar próximo disparo e pausar
      await db.execute({
        sql:  `UPDATE flow_executions SET no_atual=?, status='em_andamento', proximo_disparo=?, historico=? WHERE id=?`,
        args: [resultado.proximo_no, resultado.proximo_disparo, JSON.stringify(historico), execId],
      });
      return;
    }

    if (resultado.finalizar) {
      await db.execute({
        sql:  `UPDATE flow_executions SET no_atual='', status='concluido', historico=? WHERE id=?`,
        args: [JSON.stringify(historico), execId],
      });
      return;
    }

    noAtual = resultado.proximo_no;
  }

  // Chegou ao fim sem nó finalizador explícito
  await db.execute({
    sql:  `UPDATE flow_executions SET no_atual='', status='concluido', historico=? WHERE id=?`,
    args: [JSON.stringify(historico), execId],
  });
}

async function executarNo(db, no, card, vars, execId, historico) {
  switch (no.tipo) {
    case 'mensagem': {
      const texto = interpolate(no.config.texto || '', vars);
      try {
        await sendText(card.phone, texto);
        return { resultado: 'mensagem_enviada', proximo_no: no.proximo };
      } catch (e) {
        console.error(`[FlowEngine] Erro ao enviar mensagem no ${no.id}:`, e.message);
        return { resultado: 'erro_envio', detalhes: { erro: e.message }, proximo_no: no.proximo };
      }
    }

    case 'espera': {
      const horas = no.config.horas || 24;
      const proximo_disparo = new Date(Date.now() + horas * 3600 * 1000).toISOString();
      return { resultado: 'aguardando', pausar: true, proximo_no: no.proximo, proximo_disparo };
    }

    case 'condicao': {
      const { variavel, operador, valor } = no.config;
      const valCard = vars[variavel];
      let ok = false;
      if (operador === '=')  ok = String(valCard) === String(valor);
      if (operador === '!=') ok = String(valCard) !== String(valor);
      if (operador === '>')  ok = Number(valCard)  >  Number(valor);
      if (operador === '<')  ok = Number(valCard)  <  Number(valor);
      const proximo_no = ok ? no.proximo_sim : no.proximo_nao;
      return { resultado: ok ? 'condicao_verdadeira' : 'condicao_falsa', proximo_no };
    }

    case 'finalizar':
      return { resultado: 'finalizado', detalhes: { motivo: no.config.motivo }, finalizar: true };

    case 'gatilho':
      return { resultado: 'gatilho_inicio', proximo_no: no.proximo };

    default:
      return { resultado: 'no_desconhecido', proximo_no: no.proximo };
  }
}

async function salvarHistorico(db, execId, historico) {
  await db.execute({
    sql:  `UPDATE flow_executions SET historico=? WHERE id=?`,
    args: [JSON.stringify(historico), execId],
  });
}

function buildVars(card) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dt   = card.date ? new Date(card.date + 'T00:00:00') : null;
  const dias = dt ? Math.round((hoje - dt) / 86400000) : 0;
  return {
    nome:            card.name       || '',
    telefone:        card.phone      || '',
    valor:           card.total      || 0,
    pedido:          card.id         || '',
    dias:            dias,
    link_pagamento:  card.link_pagamento || '',
    respondeu:       card.respondeu  || 'nao',
    status:          card.status     || '',
  };
}

// Encontra o fluxo aplicável para um card com base nos gatilhos
function encontrarFluxoParaCard(card, fluxos) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dt   = card.date ? new Date(card.date + 'T00:00:00') : null;
  const diasVencido = dt ? Math.round((hoje - dt) / 86400000) : 0;

  for (const flow of fluxos) {
    const g = typeof flow.gatilho === 'string' ? JSON.parse(flow.gatilho) : flow.gatilho;
    if (!g || !g.tipo) continue;

    if (g.tipo === 'tempo_vencido') {
      const dias = g.parametro?.dias ?? 1;
      if (card.status === 'vencido' && diasVencido >= dias) return flow;
    }
    if (g.tipo === 'mudanca_status' && card.status === g.parametro?.status_origem) return flow;
    if (g.tipo === 'nao_respondeu' && card.respondeu !== 'sim') return flow;
  }
  return null;
}

// Retoma execuções pausadas cujo proximo_disparo já passou
async function retomarExecucoesPendentes(db) {
  const agora = nowISO();
  const { rows: execucoes } = await db.execute({
    sql:  `SELECT fe.*, f.nos FROM flow_executions fe JOIN flows f ON f.id = fe.flow_id WHERE fe.status='em_andamento' AND fe.proximo_disparo IS NOT NULL AND fe.proximo_disparo <= ?`,
    args: [agora],
  });

  for (const exec of execucoes) {
    const { rows: [card] } = await db.execute({ sql: 'SELECT * FROM orders WHERE id=?', args: [exec.card_id] });
    if (!card) continue;
    const flow = { id: exec.flow_id, nos: exec.nos };
    try {
      await executarFluxo(db, flow, card, exec);
    } catch (e) {
      console.error(`[FlowEngine] Erro ao retomar execução ${exec.id}:`, e.message);
      await db.execute({ sql: `UPDATE flow_executions SET status='erro' WHERE id=?`, args: [exec.id] });
    }
  }
}

module.exports = { executarFluxo, encontrarFluxoParaCard, retomarExecucoesPendentes };
