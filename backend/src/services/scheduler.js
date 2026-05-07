'use strict';

const cron = require('node-cron');
const { executarFluxo, encontrarFluxoParaCard, retomarExecucoesPendentes } = require('./flowEngine');

function iniciarScheduler(db) {
  // Execução diária às 08:00 — dispara fluxos para cards elegíveis
  cron.schedule('0 8 * * *', () => rodarFluxos(db), { timezone: 'America/Sao_Paulo' });

  // A cada 30 min — retoma execuções pausadas (nós de espera que já venceram)
  cron.schedule('*/30 * * * *', () => retomarExecucoesPendentes(db));

  console.log('[Scheduler] Cron de fluxos iniciado (08h diário + retomada a cada 30min)');
}

async function rodarFluxos(db) {
  console.log('[Scheduler] Iniciando rodada de fluxos...');
  try {
    const [{ rows: cards }, { rows: fluxos }] = await Promise.all([
      db.execute(`SELECT * FROM orders WHERE status IN ('vencido','avencer')`),
      db.execute(`SELECT * FROM flows WHERE ativo=1`),
    ]);

    if (fluxos.length === 0) {
      console.log('[Scheduler] Nenhum fluxo ativo.');
      return;
    }

    let disparados = 0;
    for (const card of cards) {
      // Verifica se já há execução em andamento para este card
      const { rows: [emAndamento] } = await db.execute({
        sql:  `SELECT id FROM flow_executions WHERE card_id=? AND status='em_andamento'`,
        args: [card.id],
      });
      if (emAndamento) continue;

      const flow = encontrarFluxoParaCard(card, fluxos);
      if (!flow) continue;

      try {
        await executarFluxo(db, flow, card);
        disparados++;
      } catch (e) {
        console.error(`[Scheduler] Erro ao executar fluxo para card ${card.id}:`, e.message);
      }
    }

    console.log(`[Scheduler] Rodada concluída — ${disparados} fluxo(s) disparado(s).`);
  } catch (e) {
    console.error('[Scheduler] Erro na rodada de fluxos:', e.message);
  }
}

module.exports = { iniciarScheduler, rodarFluxos };
