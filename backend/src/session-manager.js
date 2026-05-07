'use strict';

const MAX_MESSAGES = parseInt(process.env.MAX_HISTORY_MESSAGES || '20', 10);

/**
 * Gerenciador de sessão em memória.
 * Chave = número de telefone normalizado (55XXXXXXXXXXX)
 * Valor = array de { role: 'user'|'assistant', content: string }
 *
 * Nota: para o projeto Brownie do Mig, o histórico é buscado do banco
 * via buscarHistorico(). Este manager é um cache em memória opcional
 * para evitar queries repetidas na mesma sessão.
 */
const sessoes = new Map();

function addMessage(userId, role, content) {
  if (!sessoes.has(userId)) sessoes.set(userId, []);
  const hist = sessoes.get(userId);
  hist.push({ role, content });
  // Mantém apenas as últimas MAX_MESSAGES mensagens
  if (hist.length > MAX_MESSAGES) hist.splice(0, hist.length - MAX_MESSAGES);
}

function getHistory(userId) {
  return sessoes.get(userId) || [];
}

function clearSession(userId) {
  sessoes.delete(userId);
  console.log(`[Session] Sessão encerrada: ${userId}`);
}

function clearAll() {
  sessoes.clear();
  console.log('[Session] Todas as sessões encerradas');
}

function stats() {
  return { sessoes_ativas: sessoes.size, max_mensagens: MAX_MESSAGES };
}

module.exports = { addMessage, getHistory, clearSession, clearAll, stats };
