// Invio di un comando scritto a Google Assistant.
//
// E il modo ufficiale che Google offre per comandare, a nome tuo, tutto
// quello che e collegato a Google Home: luci, prese, televisore, clima. Il
// comando e una frase in italiano, come la diresti a un Nest.
//
// Google accetta questi comandi solo con il protocollo gRPC, che viaggia su
// HTTP/2. Qui lo parliamo direttamente con il modulo http2 di Node, senza
// librerie: il messaggio e piccolo e lo componiamo a mano, secondo la
// definizione ufficiale google.assistant.embedded.v1alpha2.

import http2 from 'node:http2';

const HOST = 'https://embeddedassistant.googleapis.com';
const PATH = '/google.assistant.embedded.v1alpha2.EmbeddedAssistant/Assist';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// ---------- codifica protobuf, solo quello che serve ----------

function varint(n) {
  const out = [];
  while (n > 127) { out.push((n & 0x7f) | 0x80); n = Math.floor(n / 128); }
  out.push(n);
  return Buffer.from(out);
}
const key = (field, wire) => varint((field << 3) | wire);
const bytesField = (field, buf) => Buffer.concat([key(field, 2), varint(buf.length), buf]);
const strField = (field, s) => bytesField(field, Buffer.from(s, 'utf8'));
const intField = (field, n) => Buffer.concat([key(field, 0), varint(n)]);

// AssistRequest con dentro la sola configurazione e la frase da eseguire.
export function buildRequest(text, languageCode) {
  const audioOut = Buffer.concat([intField(1, 2), intField(2, 16000), intField(3, 100)]); // MP3
  const dialog = Buffer.concat([strField(2, languageCode), intField(7, 1)]);             // nuova conversazione
  const device = Buffer.concat([strField(1, 'default'), strField(3, 'default')]);
  const screen = intField(1, 3);                                                          // PLAYING: risposta anche in HTML
  const config = Buffer.concat([
    bytesField(2, audioOut),
    bytesField(3, dialog),
    bytesField(4, device),
    strField(6, text),
    bytesField(8, screen)
  ]);
  return bytesField(1, config);
}

// ---------- decodifica protobuf generica ----------

function readVarint(buf, pos) {
  let result = 0, mult = 1, b;
  do {
    b = buf[pos++];
    result += (b & 0x7f) * mult;
    mult *= 128;
  } while (b & 0x80);
  return [result, pos];
}

// Restituisce un elenco di campi { field, wire, value }.
export function decode(buf) {
  const out = [];
  let pos = 0;
  while (pos < buf.length) {
    let tag;
    [tag, pos] = readVarint(buf, pos);
    const field = Math.floor(tag / 8), wire = tag & 7;
    if (wire === 0) { let v; [v, pos] = readVarint(buf, pos); out.push({ field, wire, value: v }); }
    else if (wire === 1) { out.push({ field, wire, value: buf.subarray(pos, pos + 8) }); pos += 8; }
    else if (wire === 2) { let len; [len, pos] = readVarint(buf, pos); out.push({ field, wire, value: buf.subarray(pos, pos + len) }); pos += len; }
    else if (wire === 5) { out.push({ field, wire, value: buf.subarray(pos, pos + 4) }); pos += 4; }
    else throw new Error('formato di risposta non riconosciuto');
  }
  return out;
}

// Estrae da una risposta quello che ci interessa: il testo, se Google lo
// manda, e se ha risposto a voce.
function readResponse(msg, acc) {
  for (const f of decode(msg)) {
    if (f.field === 5 && f.wire === 2) {             // dialog_state_out
      for (const g of decode(f.value)) {
        if (g.field === 1 && g.wire === 2) acc.text += g.value.toString('utf8');
      }
    } else if (f.field === 4 && f.wire === 2) {      // screen_out
      for (const g of decode(f.value)) {
        if (g.field === 2 && g.wire === 2) acc.html += g.value.toString('utf8');
      }
    } else if (f.field === 3 && f.wire === 2) {      // audio_out
      acc.audioBytes += f.value.length;
    }
  }
}

// Il testo leggibile di una risposta in HTML.
function htmlToText(html) {
  const principale = html.match(/<div[^>]*class="[^"]*show_text_content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  const pezzo = principale ? principale[1] : html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ');
  return pezzo.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim().slice(0, 300);
}

// ---------- credenziali ----------

let cached = { token: null, until: 0 };

export async function accessToken({ clientId, clientSecret, refreshToken }) {
  if (cached.token && Date.now() < cached.until) return cached.token;
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshToken, grant_type: 'refresh_token'
    })
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) {
    const e = new Error(j.error === 'invalid_grant'
      ? 'autorizzazione Google scaduta o revocata: va rifatta dal computer'
      : 'Google non ha rilasciato il permesso: ' + (j.error_description || j.error || r.status));
    e.code = 'auth';
    throw e;
  }
  cached = { token: j.access_token, until: Date.now() + (Math.max(60, (j.expires_in || 3600) - 120)) * 1000 };
  return cached.token;
}

// ---------- invio ----------

const SPIEGAZIONI = {
  3: 'Google ha rifiutato la frase',
  7: 'permesso negato: controlla che la Google Assistant API sia abilitata nel progetto',
  8: 'troppi comandi in poco tempo, riprova fra un minuto',
  14: 'Google non raggiungibile in questo momento',
  16: 'autorizzazione Google non valida: va rifatta dal computer'
};

// Manda una frase a Google Assistant e aspetta la risposta. Restituisce
// { ok, text, spoke } oppure lancia un errore con una spiegazione in italiano.
export async function assist(text, creds, { languageCode = 'it-IT', timeoutMs = 15000 } = {}) {
  const token = creds.accessToken || await accessToken(creds);
  const payload = buildRequest(text, languageCode);
  const frame = Buffer.alloc(5 + payload.length);
  frame.writeUInt8(0, 0);
  frame.writeUInt32BE(payload.length, 1);
  payload.copy(frame, 5);

  return await new Promise((resolve, reject) => {
    const client = http2.connect(HOST);
    let finito = false;
    const chiudi = (fn, v) => {
      if (finito) return;
      finito = true;
      clearTimeout(timer);
      try { client.close(); } catch (e) {}
      fn(v);
    };
    const timer = setTimeout(() => chiudi(reject, new Error('Google non ha risposto in tempo')), timeoutMs);

    client.on('error', (e) => chiudi(reject, new Error('collegamento a Google non riuscito: ' + e.message)));

    const req = client.request({
      ':method': 'POST',
      ':path': PATH,
      'content-type': 'application/grpc',
      'te': 'trailers',
      'authorization': 'Bearer ' + token,
      'grpc-accept-encoding': 'identity'
    });

    let buffer = Buffer.alloc(0);
    const acc = { text: '', html: '', audioBytes: 0 };
    let status = null, message = '';

    const leggiStato = (h) => {
      if (h['grpc-status'] !== undefined) status = parseInt(h['grpc-status'], 10);
      if (h['grpc-message']) message = decodeURIComponent(h['grpc-message']);
    };

    req.on('response', (h) => {
      if (h[':status'] && h[':status'] !== 200) {
        chiudi(reject, new Error('Google ha risposto con stato ' + h[':status']));
        return;
      }
      leggiStato(h);
    });
    req.on('trailers', leggiStato);

    req.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 5) {
        const len = buffer.readUInt32BE(1);
        if (buffer.length < 5 + len) break;
        try { readResponse(buffer.subarray(5, 5 + len), acc); } catch (e) {}
        buffer = buffer.subarray(5 + len);
      }
    });

    req.on('end', () => {
      if (status !== null && status !== 0) {
        const e = new Error(SPIEGAZIONI[status] || ('Google ha risposto con un errore, codice ' + status + (message ? ': ' + message : '')));
        e.code = status === 16 ? 'auth' : 'google';
        e.grpcStatus = status;
        chiudi(reject, e);
        return;
      }
      const testo = acc.text.trim() || (acc.html ? htmlToText(acc.html) : '');
      chiudi(resolve, { ok: true, text: testo, spoke: acc.audioBytes > 0 });
    });

    req.on('error', (e) => chiudi(reject, new Error('comando interrotto: ' + e.message)));

    // Una sola richiesta, poi si chiude il lato di invio: Google risponde.
    req.end(frame);
  });
}
