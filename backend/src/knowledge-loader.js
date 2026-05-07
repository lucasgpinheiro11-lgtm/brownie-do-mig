'use strict';

const fs   = require('fs');
const path = require('path');

/**
 * Carrega todos os arquivos .md da pasta /knowledge em ordem alfabética
 * e retorna uma string única para o system prompt cacheado.
 * Executado uma vez na inicialização — resultado fixo em memória.
 */
function carregarKnowledge() {
  const dir = path.join(__dirname, '..', 'knowledge');

  if (!fs.existsSync(dir)) {
    console.warn('[Knowledge] Pasta /knowledge não encontrada — usando conhecimento vazio');
    return '';
  }

  const arquivos = fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .sort(); // ordem alfabética garante 01_, 02_, 03_...

  if (arquivos.length === 0) {
    console.warn('[Knowledge] Nenhum arquivo .md encontrado em /knowledge');
    return '';
  }

  const partes = arquivos.map(arquivo => {
    const conteudo = fs.readFileSync(path.join(dir, arquivo), 'utf8');
    // Remove comentários HTML de instrução (<!-- ... -->) do texto final
    const limpo = conteudo.replace(/<!--[\s\S]*?-->/g, '').trim();
    return `## ${arquivo}\n\n${limpo}`;
  });

  const conhecimento = partes.join('\n\n---\n\n');

  console.log(`[Knowledge] ${arquivos.length} arquivo(s) carregado(s) — ${conhecimento.length.toLocaleString()} caracteres (~${Math.round(conhecimento.length / 4).toLocaleString()} tokens)`);

  return conhecimento;
}

// Carrega uma vez e exporta o resultado fixo
const CONHECIMENTO = carregarKnowledge();

module.exports = { CONHECIMENTO };
