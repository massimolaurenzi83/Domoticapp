// Punto di arrivo dei comandi per Google Home.
//
// Gira come funzione su Vercel, gratuitamente. Riceve una frase dal
// servizio di collegamento di casa, mai direttamente dai tablet, e la gira a
// Google Assistant a nome tuo. Accetta solo chi conosce la parola del ponte.
//
// Variabili da impostare sul servizio, le imposta google/autorizza.mjs:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, RELAY_TOKEN

import { assist } from '../lib/assistant.js';

function uguali(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!process.env.RELAY_TOKEN || !process.env.GOOGLE_REFRESH_TOKEN) {
    res.status(500).json({ ok: false, error: 'ponte non configurato' });
    return;
  }
  if (!uguali(req.headers['x-relay-token'] || '', process.env.RELAY_TOKEN)) {
    res.status(401).json({ ok: false, error: 'non autorizzato' });
    return;
  }

  // Controllo di salute: risponde senza disturbare Google.
  if (req.method === 'GET') { res.status(200).json({ ok: true }); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'metodo non ammesso' }); return; }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const testo = String((body && body.testo) || '').trim();
  if (!testo || testo.length > 200) {
    res.status(400).json({ ok: false, error: 'frase mancante o troppo lunga' });
    return;
  }

  try {
    const r = await assist(testo, {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      refreshToken: process.env.GOOGLE_REFRESH_TOKEN
    });
    res.status(200).json({ ok: true, risposta: r.text, voce: r.spoke });
  } catch (e) {
    res.status(e.code === 'auth' ? 401 : 502).json({ ok: false, error: e.message, auth: e.code === 'auth' });
  }
}
