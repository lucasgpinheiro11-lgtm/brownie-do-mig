'use strict';

const axios = require('axios');

const evolutionClient = axios.create({
  baseURL: process.env.EVOLUTION_API_URL,
  headers: {
    'Content-Type': 'application/json',
    'apikey': process.env.EVOLUTION_API_KEY,
  },
  timeout: 15000,
});

const INSTANCE = () => process.env.EVOLUTION_INSTANCE;

function formatPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

async function sendText(phone, text) {
  const number = formatPhone(phone);
  const { data } = await evolutionClient.post(
    `/message/sendText/${INSTANCE()}`,
    { number, text, options: { delay: 1200 } }
  );
  return data;
}

async function sendMedia(phone, mediaUrl, caption = '') {
  const number = formatPhone(phone);
  const { data } = await evolutionClient.post(
    `/message/sendMedia/${INSTANCE()}`,
    { number, mediatype: 'image', media: mediaUrl, caption }
  );
  return data;
}

function interpolate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

module.exports = { sendText, sendMedia, interpolate, formatPhone };
