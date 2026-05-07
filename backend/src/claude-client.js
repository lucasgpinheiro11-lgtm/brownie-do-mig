'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { CONHECIMENTO } = require('./knowledge-loader');

const anthropic = new Anthropic.default({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-4-6';

/**
 * Gera resposta via Claude Sonnet 4.6 com Prompt Caching.
 *
 * O bloco de conhecimento fixo (/knowledge) é marcado com cache_control
 * e reutilizado entre conversas — economiza até 90% nos tokens de entrada.
 *
 * @param {object} contexto   - { nome, valor, pix, dias, politicasExtras }
 * @param {string} mensagem   - Mensagem atual do cliente
 * @param {Array}  historico  - Array de { role: 'user'|'assistant', content: string }
 * @returns {Promise<string|null>}
 */
async function gerarRespostaClaude(contexto, mensagem, historico = []) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('[Claude] ANTHROPIC_API_KEY não configurado — usando fallback');
    return null;
  }

  const { nome, valor, pix, dias, politicasExtras = [] } = contexto;
  const ton = dias <= 3 ? 'leve e acolhedor' : dias <= 7 ? 'firme e objetivo' : 'sério mas respeitoso';

  // Contexto dinâmico (NÃO cacheado — muda por cliente)
  const contextoDinamico = `
## CONTEXTO DESTA CONVERSA

- **Cliente:** ${nome}
- **Valor em aberto:** R$ ${valor}
- **Chave Pix:** ${pix || '(disponível mediante solicitação)'}
- **Dias em atraso:** ${dias}
- **Tom sugerido:** ${ton}

${politicasExtras.length > 0
  ? `## POLÍTICAS ADICIONAIS DA EMPRESA\n${politicasExtras.map((p, i) => `${i + 1}. ${p}`).join('\n')}`
  : ''}

---
Responda SOMENTE com o texto da mensagem para o WhatsApp. Sem aspas, sem prefixo "Mig:", sem explicações extras. Máximo 3 linhas.
  `.trim();

  // Monta histórico + mensagem atual
  const messages = [
    ...historico.slice(-6),  // últimas 3 trocas de contexto
    { role: 'user', content: mensagem },
  ];

  try {
    const ctrl    = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 12000);

    const response = await anthropic.messages.create({
      model:      MODEL,
      max_tokens: 300,
      system: [
        // ── Bloco 1: Conhecimento fixo (CACHEADO) ─────────────────────────
        {
          type:          'text',
          text:          CONHECIMENTO || 'Você é Mig, assistente de cobranças da Brownie do Mig.',
          cache_control: { type: 'ephemeral' },
        },
        // ── Bloco 2: Contexto dinâmico (NÃO cacheado) ────────────────────
        {
          type: 'text',
          text: contextoDinamico,
        },
      ],
      messages,
    });

    clearTimeout(timeout);

    // ── Log de uso de tokens ───────────────────────────────────────────────
    const uso = response.usage;
    console.log(
      `[Claude] tokens → entrada: ${uso.input_tokens} | saída: ${uso.output_tokens}` +
      (uso.cache_creation_input_tokens  ? ` | cache criado: ${uso.cache_creation_input_tokens}`  : '') +
      (uso.cache_read_input_tokens      ? ` | cache lido: ${uso.cache_read_input_tokens} (💰 economia!)`      : '')
    );

    return response.content?.[0]?.text?.trim() || null;

  } catch (e) {
    if (e.name === 'AbortError') {
      console.error('[Claude] Timeout na requisição');
    } else {
      console.error('[Claude] Erro:', e.message);
    }
    return null;
  }
}

module.exports = { gerarRespostaClaude };
