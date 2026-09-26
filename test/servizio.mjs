// Prove del servizio di collegamento, da eseguire sul computer:
//   node test/servizio.mjs
// Il servizio gira con un deposito finto in memoria: non tocca niente di vero,
// tranne l ultima prova che chiede davvero il meteo.

import { generateKeyPairSync, createPublicKey, verify as nodeVerify } from 'node:crypto';

const W = (await import(new URL('../worker/index.js', import.meta.url).href)).default;
const P = await import(new URL('../worker/push.js', import.meta.url).href);

let passate = 0, fallite = 0;
function prova(nome, ok, dett) {
  if (ok) passate++; else fallite++;
  console.log((ok ? 'OK   ' : 'KO   ') + nome + (dett ? '  (' + dett + ')' : ''));
}

function kv() {
  const m = new Map();
  return {
    get: async (k) => (m.has(k) ? m.get(k) : null),
    put: async (k, v) => { m.set(k, v); },
    delete: async (k) => { m.delete(k); },
    _m: m
  };
}

function req(path, { method = 'GET', token, body, ip = '1.2.3.4' } = {}) {
  const h = { 'CF-Connecting-IP': ip };
  if (token !== undefined) h['X-Casa-Token'] = token;
  if (body) h['Content-Type'] = 'application/json';
  return new Request('https://casa.test' + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
}

const TOKEN = 'abcd-efgh-ijkm-npqr';

// 1. servizio senza parola impostata
{
  const env = { CASA: kv() };
  const r = await W.fetch(req('/state'), env);
  prova('senza parola impostata il servizio resta chiuso', r.status === 500);
  const r2 = await W.fetch(req('/state', { token: '' }), env);
  prova('una richiesta con parola vuota non entra', r2.status === 500);
}

const env = { CASA: kv(), CASA_TOKEN: TOKEN };

// 2. tentativi
{
  let ultimo;
  for (let i = 0; i < 11; i++) ultimo = await W.fetch(req('/state', { token: 'vecchia-parola' }), env);
  prova('dieci tentativi sbagliati portano al blocco', ultimo.status === 429);
  const giusto = await W.fetch(req('/state', { token: TOKEN }), env);
  prova('il blocco non ferma gli altri dispositivi di casa con la parola giusta', giusto.status === 200);
}

// 3. impostazioni: un valore di fabbrica non sovrascrive una scelta
{
  await W.fetch(req('/state', { method: 'PUT', token: TOKEN, body: {
    settings: { placeName: 'Bologna', settingsPin: '1234' }, stamps: { placeName: 1000, settingsPin: 1000 } } }), env);
  await W.fetch(req('/state', { method: 'PUT', token: TOKEN, body: {
    settings: { placeName: 'Roma', settingsPin: '' }, stamps: {} } }), env);
  const st = await (await W.fetch(req('/state', { token: TOKEN }), env)).json();
  prova('i valori di fabbrica del secondo tablet non cancellano citta e codice del primo',
    st.settings.placeName === 'Bologna' && st.settings.settingsPin === '1234', st.settings.placeName + ', ' + st.settings.settingsPin);

  await W.fetch(req('/state', { method: 'PUT', token: TOKEN, body: {
    settings: { placeName: 'Roma' }, stamps: { placeName: 2000 } } }), env);
  const st2 = await (await W.fetch(req('/state', { token: TOKEN }), env)).json();
  prova('una scelta piu recente invece vince', st2.settings.placeName === 'Roma');
}

// 4. spesa e promemoria, cancellazioni
{
  const ora = Date.now();
  await W.fetch(req('/state', { method: 'PUT', token: TOKEN, body: {
    shopping: [{ id: 's1', text: 'latte', editedAt: ora }],
    reminders: [{ id: 'r1', text: 'dentista', editedAt: ora, when: ora + 1000 }] } }), env);
  await W.fetch(req('/state', { method: 'PUT', token: TOKEN, body: {
    shopping: [{ id: 's1', text: 'latte', editedAt: ora + 5, deleted: true }],
    reminders: [] } }), env);
  const st = await (await W.fetch(req('/state', { token: TOKEN }), env)).json();
  prova('la spesa viaggia attraverso il servizio', Array.isArray(st.shopping) && st.shopping.length === 1);
  prova('una voce tolta resta come segnaposto e non ricompare', st.shopping[0].deleted === true);
  prova('un dispositivo che non sa di un promemoria non lo cancella', st.reminders.length === 1);
}

// 5. sentinella
{
  const env2 = { CASA: kv(), CASA_TOKEN: TOKEN };
  const t0 = Date.now();
  const r1 = await (await W.fetch(req('/state', { method: 'PUT', token: TOKEN, body: {
    sentinel: { armed: false, at: t0, from: 'tablet', serverAt: null } } }), env2)).json();
  prova('una decisione nuova riceve la marcatura del servizio', !!(r1.sentinel && r1.sentinel.serverAt));
  const tabletDec = r1.sentinel;

  await new Promise((f) => setTimeout(f, 5));
  // il telefono arma, con l orologio indietro di dieci minuti
  const r2 = await (await W.fetch(req('/state', { method: 'PUT', token: TOKEN, body: {
    sentinel: { armed: true, at: t0 - 600000, from: 'telefono', serverAt: null } } }), env2)).json();
  prova('il telefono con l orologio indietro riesce comunque ad armare', r2.sentinel.armed === true);

  // il tablet ripete la sua vecchia decisione, gia marcata
  const r3 = await (await W.fetch(req('/state', { method: 'PUT', token: TOKEN, body: {
    sentinel: tabletDec } }), env2)).json();
  prova('l eco della vecchia decisione del tablet non disarma', r3.sentinel.armed === true);

  // lo stesso invio ripetuto due volte non genera una seconda decisione
  const ripetuta = { armed: false, at: t0 + 10, from: 'tablet', serverAt: null };
  const a = await (await W.fetch(req('/state', { method: 'PUT', token: TOKEN, body: { sentinel: ripetuta } }), env2)).json();
  const b = await (await W.fetch(req('/state', { method: 'PUT', token: TOKEN, body: { sentinel: ripetuta } }), env2)).json();
  prova('lo stesso invio ripetuto non cambia la marcatura', a.sentinel.serverAt === b.sentinel.serverAt);
}

// 6. copie di sicurezza per dispositivo
{
  const env3 = { CASA: kv(), CASA_TOKEN: TOKEN };
  await W.fetch(req('/backup', { method: 'POST', token: TOKEN, body: { at: 1, data: { a: 'tablet' }, device: { id: 'dev-tablet', label: 'Galaxy', role: 'pannello' } } }), env3);
  await W.fetch(req('/backup', { method: 'POST', token: TOKEN, body: { at: 2, data: { a: 'telefono' }, device: { id: 'dev-tel', label: 'Telefono', role: 'telecomando' } } }), env3);
  const indice = await (await W.fetch(req('/backup', { token: TOKEN }), env3)).json();
  const tablet = await (await W.fetch(req('/backup?device=dev-tablet', { token: TOKEN }), env3)).json();
  prova('ogni dispositivo ha la sua copia', indice.length === 2 && tablet.data.a === 'tablet');
  const senza = await W.fetch(req('/backup', { method: 'POST', token: TOKEN, body: { at: 3, data: {} } }), env3);
  prova('una copia senza dispositivo viene rifiutata', senza.status === 400);
}

// 7. chiavi delle notifiche generate come fa lo script di installazione
{
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const priv = privateKey.export({ format: 'jwk' });
  const pub = publicKey.export({ format: 'jwk' });
  const b64url = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const VAPID_PUBLIC = b64url(Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]));
  const VAPID_PRIVATE = priv.d;

  // intercetto la chiamata verso il servizio di notifiche per leggere la firma
  const veroFetch = globalThis.fetch;
  let intestazione = null;
  globalThis.fetch = async (u, o) => { intestazione = o.headers.Authorization; return new Response(null, { status: 201 }); };
  const stato = await P.sendTo({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc' }, { VAPID_PUBLIC, VAPID_PRIVATE });
  globalThis.fetch = veroFetch;

  const m = intestazione && intestazione.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
  let firmaValida = false;
  if (m) {
    const firma = Buffer.from(m[3], 'base64url');
    firmaValida = nodeVerify('sha256', Buffer.from(m[1] + '.' + m[2]), { key: createPublicKey({ key: pub, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, firma);
  }
  prova('la firma delle notifiche e valida con le chiavi dello script', stato === 201 && firmaValida);
  prova('la chiave pubblica esposta ai telefoni e quella giusta', m && m[4] === VAPID_PUBLIC);
}

// 8b. Google Home: tramite verso il programma su Vercel, senza rete vera
{
  const st0 = await (await W.fetch(req('/google/stato', { token: TOKEN }), env)).json();
  prova('senza ponte Google il servizio dice non collegato', st0.collegato === false);
  const r0 = await W.fetch(req('/google', { method: 'POST', token: TOKEN, body: { testo: 'accendi la luce' } }), env);
  prova('senza ponte Google un comando riceve 503', r0.status === 503);

  const envG = Object.assign({}, env, { GOOGLE_RELAY_URL: 'https://ponte.test/', GOOGLE_RELAY_TOKEN: 'segreto-ponte' });
  const st1 = await (await W.fetch(req('/google/stato', { token: TOKEN }), envG)).json();
  prova('con il ponte impostato il servizio dice collegato', st1.collegato === true);

  const veroFetch = globalThis.fetch;
  let visto = null;
  globalThis.fetch = async (u, o) => {
    visto = { u, token: o.headers['X-Relay-Token'], body: JSON.parse(o.body) };
    return new Response(JSON.stringify({ ok: true, risposta: 'Ok, accendo la luce.', voce: true }), { status: 200 });
  };
  const r1 = await W.fetch(req('/google', { method: 'POST', token: TOKEN, body: { testo: 'accendi la luce', lat: 41.9, lon: 12.5 } }), envG);
  const j1 = await r1.json();
  prova('il comando arriva al ponte con la sua parola',
    visto && visto.u === 'https://ponte.test/api/comando' && visto.token === 'segreto-ponte' && visto.body.testo === 'accendi la luce');
  prova('la risposta di Google torna al pannello', r1.ok && j1.ok && j1.risposta === 'Ok, accendo la luce.');
  prova('la posizione di casa passa al ponte', visto.body.lat === 41.9 && visto.body.lon === 12.5);
  await W.fetch(req('/google', { method: 'POST', token: TOKEN, body: { testo: 'accendi', lat: null } }), envG);
  prova('una posizione mancante non diventa zero', visto.body.lat === null && visto.body.lon === null);

  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error: 'autorizzazione Google scaduta', auth: true }), { status: 401 });
  const r2 = await W.fetch(req('/google', { method: 'POST', token: TOKEN, body: { testo: 'accendi' } }), envG);
  const j2 = await r2.json();
  prova('un permesso Google scaduto non sembra una parola di casa sbagliata', r2.status === 502 && j2.auth === true);

  globalThis.fetch = async () => { throw new Error('rete giu'); };
  const r3 = await W.fetch(req('/google', { method: 'POST', token: TOKEN, body: { testo: 'accendi' } }), envG);
  prova('ponte irraggiungibile: errore chiaro', r3.status === 502);
  globalThis.fetch = veroFetch;

  const r4 = await W.fetch(req('/google', { method: 'POST', token: TOKEN, body: { testo: 'x'.repeat(201) } }), envG);
  prova('frasi troppo lunghe rifiutate', r4.status === 400);
  const r5 = await W.fetch(req('/google', { method: 'POST', token: 'sbagliata', body: { testo: 'accendi' } }), envG);
  prova('senza parola di casa niente comandi a Google', r5.status === 401);
}

// 8c. Spotify, con uno Spotify finto
{
  const envS = { CASA: kv(), CASA_TOKEN: TOKEN };
  const s0 = await (await W.fetch(req('/spotify/stato', { token: TOKEN }), envS)).json();
  prova('senza permesso Spotify il servizio dice non collegato', s0.collegato === false);
  const c0 = await W.fetch(req('/spotify/comando', { method: 'POST', token: TOKEN, body: { azione: 'pausa' } }), envS);
  prova('senza permesso un comando Spotify riceve 503', c0.status === 503);
  const senza = await W.fetch(req('/spotify/collega', { method: 'POST', token: 'sbagliata', body: { clientId: 'x', refresh: 'y' } }), envS);
  prova('senza parola di casa non si consegna il permesso Spotify', senza.status === 401);

  const k = await W.fetch(req('/spotify/collega', { method: 'POST', token: TOKEN, body: { clientId: 'cid', refresh: 'R1' } }), envS);
  prova('lo script consegna il permesso Spotify', k.ok);

  const veroFetch = globalThis.fetch;
  const chiamate = [];
  let rinnovi = 0, playerRisposta = 200;
  globalThis.fetch = async (u, o) => {
    u = String(u);
    chiamate.push({ u, m: o.method, body: o.body, auth: o.headers && o.headers.Authorization });
    if (u.startsWith('https://accounts.spotify.com/api/token')) {
      rinnovi++;
      const p = new URLSearchParams(o.body);
      if (p.get('refresh_token') !== (rinnovi === 1 ? 'R1' : 'R2') || p.get('client_id') !== 'cid') return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
      return new Response(JSON.stringify({ access_token: 'A' + rinnovi, expires_in: 3600, refresh_token: 'R2' }), { status: 200 });
    }
    if (u.endsWith('/me/player') && o.method === 'GET') {
      if (playerRisposta === 204) return new Response(null, { status: 204 });
      return new Response(JSON.stringify({ is_playing: true, item: { name: 'Azzurro', artists: [{ name: 'Paolo Conte' }] }, device: { id: 'd1', name: 'Cucina', volume_percent: 40 } }), { status: 200 });
    }
    if (u.endsWith('/me/player/devices')) return new Response(JSON.stringify({ devices: [{ id: 'd1', name: 'Cucina', type: 'CastAudio', is_active: true, volume_percent: 40 }, { id: 'd2', name: 'Soggiorno', type: 'CastAudio', is_active: false }] }), { status: 200 });
    if (u.includes('/me/playlists')) return new Response(JSON.stringify({ items: [{ name: 'Cena', uri: 'spotify:playlist:1' }, null] }), { status: 200 });
    if (u.includes('/me/player/pause') && u.includes('device_id=spento')) return new Response(JSON.stringify({ error: { status: 404, message: 'Device not found', reason: 'NO_ACTIVE_DEVICE' } }), { status: 404 });
    if (u.includes('/me/player')) return new Response(null, { status: 204 });
    return new Response('{}', { status: 404 });
  };

  try {
    const st = await (await W.fetch(req('/spotify/stato', { token: TOKEN }), envS)).json();
    prova('lo stato dice cosa suona e dove', st.collegato && st.suona && st.titolo === 'Azzurro' && st.artista === 'Paolo Conte' && st.dispositivo === 'Cucina' && st.volume === 40, JSON.stringify(st).slice(0, 120));
    prova('l elenco degli altoparlanti visti da Spotify arriva al pannello', st.dispositivi.length === 2 && st.dispositivi[1].nome === 'Soggiorno');
    prova('il permesso lungo nuovo di Spotify viene conservato', JSON.parse(envS.CASA._m.get('spotify')).refresh === 'R2');
    const usati = rinnovi;
    await W.fetch(req('/spotify/stato', { token: TOKEN }), envS);
    prova('il permesso breve si riusa finché vale', rinnovi === usati);

    playerRisposta = 204;
    const st2 = await (await W.fetch(req('/spotify/stato', { token: TOKEN }), envS)).json();
    prova('senza niente in riproduzione lo stato resta leggibile', st2.collegato && !st2.suona && st2.titolo === '');

    const pl = await (await W.fetch(req('/spotify/playlist', { token: TOKEN }), envS)).json();
    prova('le playlist arrivano al pannello', pl.ok && pl.playlist.length === 1 && pl.playlist[0].uri === 'spotify:playlist:1');

    chiamate.length = 0;
    await W.fetch(req('/spotify/comando', { method: 'POST', token: TOKEN, body: { azione: 'play', dispositivo: 'd2' } }), envS);
    const sposta = chiamate.find(c => c.u.endsWith('/me/player') && c.m === 'PUT');
    prova('suonare su un altro Nest sposta lì la musica', sposta && JSON.parse(sposta.body).device_ids[0] === 'd2');

    chiamate.length = 0;
    await W.fetch(req('/spotify/comando', { method: 'POST', token: TOKEN, body: { azione: 'play', dispositivo: 'd1', uri: 'spotify:playlist:1' } }), envS);
    const parte = chiamate.find(c => c.u.includes('/me/player/play'));
    prova('una playlist parte sul Nest scelto', parte && parte.u.includes('device_id=d1') && JSON.parse(parte.body).context_uri === 'spotify:playlist:1');

    chiamate.length = 0;
    await W.fetch(req('/spotify/comando', { method: 'POST', token: TOKEN, body: { azione: 'volume', volume: 130 } }), envS);
    prova('il volume resta fra 0 e 100', chiamate.some(c => c.u.includes('volume_percent=100')));

    const spento = await W.fetch(req('/spotify/comando', { method: 'POST', token: TOKEN, body: { azione: 'pausa', dispositivo: 'spento' } }), envS);
    const js = await spento.json();
    prova('un Nest che Spotify non vede viene spiegato', spento.status === 502 && /app Spotify/.test(js.error), js.error);

    const ignoto = await W.fetch(req('/spotify/comando', { method: 'POST', token: TOKEN, body: { azione: 'balla' } }), envS);
    prova('un comando sconosciuto viene rifiutato', ignoto.status === 400);

    // permesso revocato
    const c = JSON.parse(envS.CASA._m.get('spotify'));
    envS.CASA._m.set('spotify', JSON.stringify({ clientId: 'cid', refresh: 'VECCHIO' }));
    const rev = await W.fetch(req('/spotify/comando', { method: 'POST', token: TOKEN, body: { azione: 'pausa' } }), envS);
    const jr = await rev.json();
    prova('un permesso Spotify revocato si dice chiaramente', rev.status === 502 && jr.auth === true && /rifatto/.test(jr.error), jr.error);
    prova('il permesso Spotify non si puo rileggere dal servizio', !JSON.stringify(await (await W.fetch(req('/spotify/stato', { token: TOKEN }), envS)).json()).includes('VECCHIO'));
  } finally {
    globalThis.fetch = veroFetch;
  }
}

// 8. meteo di rimbalzo, dalla rete vera
{
  try {
    const r = await W.fetch(req('/weather?lat=41.9&lon=12.5', { token: TOKEN }), env);
    const j = await r.json();
    prova('il servizio fa da tramite per il meteo', r.ok && !!j.dati, j.fonte);
  } catch (e) { prova('il servizio fa da tramite per il meteo', false, e.message); }
}

console.log('\n' + passate + ' passate, ' + fallite + ' fallite');
process.exit(fallite ? 1 : 0);
