'use strict';

const axios = require('axios');

const zapClient = axios.create({
  baseURL: 'https://api.zap-api.tech/v1',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

function token() { return process.env.ZAP_API_TOKEN; }
function instanceId() { return process.env.ZAP_API_INSTANCE; }

function formatPhone(phone) {
  let digits = String(phone).replace(/\D/g, '').replace(/^0/, '');
  if (digits.startsWith('55')) digits = digits.slice(2);
  if (digits.length === 10) digits = digits.slice(0, 2) + '9' + digits.slice(2);
  return `55${digits}`;
}

async function sendText(phone, text) {
  const { data } = await zapClient.post(
    `/instances/${instanceId()}/send`,
    { phone: formatPhone(phone), type: 'text', body: text },
    { headers: { Authorization: `Bearer ${token()}` } }
  );
  return data;
}

async function sendMedia(phone, mediaUrl, caption = '') {
  const { data } = await zapClient.post(
    `/instances/${instanceId()}/messages`,
    { phone: formatPhone(phone), type: 'image', url: mediaUrl, caption },
    { headers: { Authorization: `Bearer ${token()}` } }
  );
  return data;
}

function interpolate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

module.exports = { sendText, sendMedia, interpolate, formatPhone };
