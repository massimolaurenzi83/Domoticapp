// Spotify, comandato dal servizio di casa.
//
// Cosi la musica sui Nest si comanda anche da fuori casa e con i tablet
// spenti: il servizio parla con Spotify a nome tuo. Il permesso lo chiede
// una volta sola lo script spotify/autorizza.mjs dal computer, e resta qui
// nel deposito dei dati: i tablet non lo vedono mai.
//
// Serve Spotify Premium: senza, Spotify non permette di comandare la
// riproduzione da fuori.

var API = 'https://api.spotify.com/v1';
var TOKEN_URL = 'https://accounts.spotify.com/api/token';

// ---------- permesso ----------

async function leggi(env){
  var t = await env.CASA.get('spotify');
  if (!t) return null;
  try { return JSON.parse(t); } catch (e) { return null; }
}

// Chiede a Spotify un permesso breve a partire da quello lungo. Spotify a
// volte ne rilascia anche uno lungo nuovo: va conservato, altrimenti il
// vecchio smette di valere.
async function permesso(env, forza){
  var c = await leggi(env);
  if (!c || !c.refresh || !c.clientId) {
    var e0 = new Error('Spotify non ancora collegato');
    e0.stato = 503;
    throw e0;
  }
  if (!forza && c.access && Date.now() < c.until) return c.access;

  var r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: c.refresh, client_id: c.clientId }).toString()
  });
  var j = null;
  try { j = await r.json(); } catch (e) {}
  if (!r.ok || !j || !j.access_token) {
    var e1 = new Error(j && j.error === 'invalid_grant'
      ? 'permesso Spotify scaduto o revocato: va rifatto dal computer'
      : 'Spotify non ha rilasciato il permesso');
    e1.stato = 502;
    e1.auth = true;
    throw e1;
  }
  c.access = j.access_token;
  c.until = Date.now() + Math.max(60, (j.expires_in || 3600) - 120) * 1000;
  if (j.refresh_token) c.refresh = j.refresh_token;
  await env.CASA.put('spotify', JSON.stringify(c));
  return c.access;
}

// Spiegazioni in italiano per gli errori piu comuni di Spotify.
function spiega(stato, corpo){
  var motivo = corpo && corpo.error && (corpo.error.reason || corpo.error.message) || '';
  if (stato === 404 || /NO_ACTIVE_DEVICE/.test(motivo)) return 'Spotify non vede nessun altoparlante acceso: fai partire la musica una volta dall’app Spotify, poi riprova';
  if (/PREMIUM_REQUIRED/.test(motivo)) return 'serve Spotify Premium';
  if (stato === 403) return 'Spotify non permette questo comando adesso' + (motivo ? ' (' + motivo + ')' : '');
  if (stato === 429) return 'troppi comandi in poco tempo, riprova fra un minuto';
  return 'Spotify ha risposto con un errore' + (motivo ? ': ' + motivo : ', codice ' + stato);
}

// Chiamata a Spotify, con un secondo tentativo se il permesso breve e
// scaduto prima del previsto.
async function chiama(env, metodo, percorso, corpo){
  for (var tentativo = 0; tentativo < 2; tentativo++) {
    var token = await permesso(env, tentativo > 0);
    var r = await fetch(API + percorso, {
      method: metodo,
      headers: Object.assign({ 'Authorization': 'Bearer ' + token },
        corpo ? { 'Content-Type': 'application/json' } : {}),
      body: corpo ? JSON.stringify(corpo) : (metodo === 'GET' ? undefined : '')
    });
    if (r.status === 401 && tentativo === 0) continue;
    if (r.status === 204) return null;
    var j = null;
    try { j = await r.json(); } catch (e) {}
    if (!r.ok) {
      var e = new Error(spiega(r.status, j));
      e.stato = 502;
      throw e;
    }
    return j;
  }
}

// ---------- risposte per il pannello ----------

async function stato(env){
  var player = await chiama(env, 'GET', '/me/player');
  var dev = await chiama(env, 'GET', '/me/player/devices');
  var brano = player && player.item;
  return {
    collegato: true,
    suona: !!(player && player.is_playing),
    titolo: brano ? brano.name : '',
    artista: brano && brano.artists ? brano.artists.map(function(a){ return a.name; }).join(', ') : (brano && brano.show ? brano.show.name : ''),
    dispositivo: player && player.device ? player.device.name : '',
    dispositivoId: player && player.device ? player.device.id : '',
    volume: player && player.device ? player.device.volume_percent : null,
    dispositivi: ((dev && dev.devices) || []).map(function(d){
      return { id: d.id, nome: d.name, tipo: d.type, attivo: !!d.is_active, volume: d.volume_percent };
    })
  };
}

async function playlist(env){
  var j = await chiama(env, 'GET', '/me/playlists?limit=50');
  return ((j && j.items) || []).filter(Boolean).map(function(p){
    return { nome: p.name, uri: p.uri };
  });
}

function conDispositivo(percorso, id){
  return id ? percorso + (percorso.indexOf('?') === -1 ? '?' : '&') + 'device_id=' + encodeURIComponent(id) : percorso;
}

async function comando(env, c){
  var id = c.dispositivo ? String(c.dispositivo) : '';
  switch (c.azione) {
    case 'play':
      // Con un dispositivo scelto e niente da far partire, si sposta li
      // quello che stava suonando.
      if (id && !c.uri) {
        await chiama(env, 'PUT', '/me/player', { device_ids: [id], play: true });
        return;
      }
      await chiama(env, 'PUT', conDispositivo('/me/player/play', id), c.uri ? { context_uri: String(c.uri) } : null);
      return;
    case 'pausa':
      await chiama(env, 'PUT', conDispositivo('/me/player/pause', id));
      return;
    case 'successivo':
      await chiama(env, 'POST', conDispositivo('/me/player/next', id));
      return;
    case 'precedente':
      await chiama(env, 'POST', conDispositivo('/me/player/previous', id));
      return;
    case 'volume':
      var v = Math.max(0, Math.min(100, Math.round(Number(c.volume))));
      if (!isFinite(v)) throw Object.assign(new Error('volume non valido'), { stato: 400 });
      await chiama(env, 'PUT', conDispositivo('/me/player/volume?volume_percent=' + v, id));
      return;
    default:
      throw Object.assign(new Error('comando sconosciuto'), { stato: 400 });
  }
}

// ---------- ingresso ----------

// Restituisce la risposta per le richieste che riguardano Spotify, oppure
// null se la richiesta e per qualcun altro.
export async function gestisciSpotify(url, request, env, json){
  if (url.pathname.indexOf('/spotify') !== 0) return null;

  try {
    // Lo script dal computer consegna qui il permesso.
    if (url.pathname === '/spotify/collega' && request.method === 'POST') {
      var dati = null;
      try { dati = await request.json(); } catch (e) {}
      if (!dati || !dati.clientId || !dati.refresh) return json({ ok: false, error: 'dati mancanti' }, 400);
      await env.CASA.put('spotify', JSON.stringify({ clientId: String(dati.clientId), refresh: String(dati.refresh) }));
      return json({ ok: true });
    }

    if (url.pathname === '/spotify/stato') {
      if (!(await leggi(env))) return json({ collegato: false });
      return json(await stato(env));
    }

    if (url.pathname === '/spotify/playlist') return json({ ok: true, playlist: await playlist(env) });

    if (url.pathname === '/spotify/comando' && request.method === 'POST') {
      var c = null;
      try { c = await request.json(); } catch (e) {}
      if (!c || !c.azione) return json({ ok: false, error: 'comando mancante' }, 400);
      await comando(env, c);
      return json({ ok: true });
    }

    return json({ error: 'non trovato' }, 404);
  } catch (e) {
    return json({ ok: false, error: e.message, auth: !!e.auth }, e.stato || 502);
  }
}
