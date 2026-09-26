// Servizio di appoggio per i pannelli di casa.
//
// Tiene il documento condiviso fra i tablet e, piu avanti, custodira le
// chiavi di Tuya, Spotify e Google Calendar, che non possono stare in una
// pagina pubblica. Gira gratuitamente su Cloudflare Workers.
//
// Installazione: dalla cartella del progetto sul computer
//   npx wrangler login
//   node worker/installa.mjs
// Lo script crea il deposito dei dati, genera la parola condivisa e le
// chiavi delle notifiche, pubblica il servizio e stampa il link che collega
// ogni dispositivo in un tocco.

import { sendToAll } from './push.js';

var CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Casa-Token',
  'Access-Control-Max-Age': '86400'
};

function json(body, status){
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, CORS)
  });
}

async function hashBreve(testo){
  var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(testo));
  var b = new Uint8Array(buf);
  var out = '';
  for (var i = 0; i < 6; i++) out += ('0' + b[i].toString(16)).slice(-2);
  return out;
}

function confrontoSicuro(a, b){
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    var url = new URL(request.url);

    // Senza parola impostata il servizio resta chiuso. Prima, una parola
    // vuota coincideva con una richiesta senza parola, e il servizio era
    // aperto a chiunque.
    if (!env.CASA_TOKEN) {
      return json({ error: 'parola condivisa non impostata sul servizio' }, 500);
    }

    // Chi sbaglia la parola troppe volte di fila viene messo in attesa. Il
    // conteggio riguarda solo quella parola sbagliata: tutti i dispositivi
    // di casa escono dallo stesso indirizzo internet, e un vecchio tablet
    // con la parola scaduta non deve bloccare anche gli altri.
    var data = request.headers.get('X-Casa-Token') || '';
    var chiamante = request.headers.get('CF-Connecting-IP') || 'ignoto';
    var impronta = await hashBreve(data);
    var chiaveTentativi = 'tentativi:' + chiamante + ':' + impronta;

    if (!confrontoSicuro(data, env.CASA_TOKEN)) {
      var tentativi = parseInt((await env.CASA.get(chiaveTentativi)) || '0', 10);
      if (tentativi >= 10) {
        return json({ error: 'troppi tentativi, riprova fra un quarto d ora' }, 429);
      }
      await env.CASA.put(chiaveTentativi, String(tentativi + 1), { expirationTtl: 900 });
      return json({ error: 'token rifiutato' }, 401);
    }

    // ---------- notifiche ----------

    if (url.pathname === '/push/key') {
      return new Response(env.VAPID_PUBLIC || '', {
        headers: Object.assign({ 'Content-Type': 'text/plain' }, CORS)
      });
    }

    if (url.pathname === '/push/subscribe' && request.method === 'POST') {
      var body = await request.json();
      var subs = JSON.parse((await env.CASA.get('subs')) || '[]');
      var endpoint = body.subscription && body.subscription.endpoint;
      if (!endpoint) return json({ error: 'registrazione incompleta' }, 400);

      // Lo stesso telefono non deve comparire due volte.
      subs = subs.filter(function(x){ return x.subscription.endpoint !== endpoint; });
      subs.push({
        id: 'ph' + Date.now(),
        subscription: body.subscription,
        device: body.device || 'sconosciuto',
        label: body.label || 'telefono',
        at: Date.now()
      });
      await env.CASA.put('subs', JSON.stringify(subs));
      return json({ ok: true, telefoni: subs.length });
    }

    // Il tablet chiama questo quando la sentinella rileva qualcosa.
    if (url.pathname === '/alarm' && request.method === 'POST') {
      var alarm = await request.json();
      var log = JSON.parse((await env.CASA.get('alarms')) || '[]');
      log.unshift({
        at: alarm.at || Date.now(),
        source: alarm.source || 'tablet',
        strength: alarm.strength || 0,
        thumb: alarm.thumb || null
      });
      // Teniamo solo gli ultimi, il resto non serve.
      log = log.slice(0, 30);
      await env.CASA.put('alarms', JSON.stringify(log));

      var phones = JSON.parse((await env.CASA.get('subs')) || '[]');
      var dead = await sendToAll(phones, env);
      if (dead.length) {
        phones = phones.filter(function(p){ return dead.indexOf(p.id) === -1; });
        await env.CASA.put('subs', JSON.stringify(phones));
      }
      return json({ ok: true, avvisati: phones.length });
    }

    // Il lavoratore in background lo chiama appena sveglio, per sapere
    // cosa scrivere nella notifica.
    if (url.pathname === '/alarms') {
      return json(JSON.parse((await env.CASA.get('alarms')) || '[]'));
    }

    // ---------- meteo di rimbalzo ----------

    // Alcune reti domestiche bloccano i server dei servizi meteo, e certi
    // tablet vecchi non riconoscono i loro certificati. Il servizio invece
    // li raggiunge senza problemi: qui fa da tramite e restituisce i dati
    // gia pronti. Per il tablet diventa una chiamata a un solo indirizzo,
    // lo stesso che usa per tutto il resto.
    if (url.pathname === '/weather') {
      var lat = url.searchParams.get('lat') || '41.9';
      var lon = url.searchParams.get('lon') || '12.5';

      var fonti = [
        'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
          '&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min' +
          '&forecast_days=1&timezone=auto',
        'https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=' + lat + '&lon=' + lon
      ];

      for (var f = 0; f < fonti.length; f++) {
        try {
          var risposta = await fetch(fonti[f], {
            headers: { 'User-Agent': 'CasaPanel/1.0' },
            cf: { cacheTtl: 600, cacheEverything: true }
          });
          if (!risposta.ok) continue;
          var dati = await risposta.json();
          return json({ fonte: f === 0 ? 'open-meteo' : 'met.no', dati: dati });
        } catch (e) {
          // Passiamo alla prossima fonte.
        }
      }
      return json({ error: 'nessuna fonte raggiungibile' }, 502);
    }

    // ---------- Google Home ----------

    // I comandi per Google Home passano da un piccolo programma su Vercel,
    // perche Google li accetta solo con un protocollo che qui non si puo
    // usare. Il tablet parla solo con questo servizio; l indirizzo e la
    // parola del programma su Vercel restano qui e non escono mai.
    if (url.pathname === '/google/stato') {
      return json({ collegato: !!(env.GOOGLE_RELAY_URL && env.GOOGLE_RELAY_TOKEN) });
    }

    if (url.pathname === '/google' && request.method === 'POST') {
      if (!env.GOOGLE_RELAY_URL || !env.GOOGLE_RELAY_TOKEN) {
        return json({ ok: false, error: 'Google Home non ancora collegato' }, 503);
      }
      var richiesta = null;
      try { richiesta = await request.json(); } catch (e) {}
      var testo = String((richiesta && richiesta.testo) || '').trim();
      if (!testo || testo.length > 200) {
        return json({ ok: false, error: 'frase mancante o troppo lunga' }, 400);
      }
      try {
        var r = await fetch(env.GOOGLE_RELAY_URL.replace(/\/+$/, '') + '/api/comando', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Relay-Token': env.GOOGLE_RELAY_TOKEN },
          body: JSON.stringify({ testo: testo })
        });
        var esito = null;
        try { esito = await r.json(); } catch (e) {}
        if (!esito) return json({ ok: false, error: 'risposta non valida dal ponte Google' }, 502);
        return json(esito, r.ok ? 200 : (r.status === 401 ? 502 : r.status));
      } catch (e) {
        return json({ ok: false, error: 'ponte Google non raggiungibile' }, 502);
      }
    }

    // ---------- chiavi delle luci ----------

    // Le chiavi entrano e non escono piu: nessuna richiesta puo rileggerle.
    // Servono solo al servizio stesso per parlare con Tuya.
    if (url.pathname === '/secrets' && request.method === 'POST') {
      var chiavi = await request.json();
      if (!chiavi || !chiavi.tuyaId || !chiavi.tuyaSecret) {
        return json({ error: 'chiavi incomplete' }, 400);
      }
      await env.CASA.put('secrets', JSON.stringify(chiavi));
      return json({ ok: true });
    }

    if (url.pathname === '/secrets') {
      return json({ error: 'le chiavi non si rileggono' }, 405);
    }

    // ---------- copia di sicurezza ----------

    // Il tablet deposita qui una copia completa del suo stato. Serve a far
    // ripartire un tablet nuovo, o uno che ha perso i dati, senza
    // riconfigurare niente a mano.
    if (url.pathname === '/backup') {
      // Ogni dispositivo ha la sua copia: prima c era una copia sola, e il
      // telefono sovrascriveva quella del tablet principale.
      var indice = JSON.parse((await env.CASA.get('backups')) || '[]');

      if (request.method === 'POST') {
        var copia = await request.json();
        if (!copia || !copia.data || !copia.device || !copia.device.id) {
          return json({ error: 'copia non valida' }, 400);
        }
        var chiave = 'backup:' + String(copia.device.id).slice(0, 40);
        await env.CASA.put(chiave, JSON.stringify(copia));
        indice = indice.filter(function(x){ return x.id !== copia.device.id; });
        indice.push({ id: copia.device.id, label: copia.device.label || '', role: copia.device.role || '', at: copia.at || Date.now() });
        await env.CASA.put('backups', JSON.stringify(indice.slice(-10)));
        return json({ ok: true, at: copia.at });
      }

      if (request.method === 'GET') {
        var quale = url.searchParams.get('device');
        if (!quale) return json(indice);
        var salvata = await env.CASA.get('backup:' + String(quale).slice(0, 40));
        return salvata
          ? new Response(salvata, { headers: Object.assign({ 'Content-Type': 'application/json' }, CORS) })
          : json(null, 404);
      }
    }

    // ---------- documento condiviso ----------

    if (url.pathname !== '/state') return json({ error: 'non trovato' }, 404);

    if (request.method === 'GET') {
      var stored = await env.CASA.get('state');
      return json(stored ? JSON.parse(stored) : { settings: {}, stamps: {}, reminders: [], shopping: [], messages: [], sentinel: null });
    }

    if (request.method === 'PUT') {
      var incoming;
      try { incoming = await request.json(); }
      catch (e) { return json({ error: 'corpo non valido' }, 400); }

      var previous = await env.CASA.get('state');
      var base = previous ? JSON.parse(previous) : { settings: {}, stamps: {}, reminders: [], shopping: [], messages: [], sentinel: null };
      var merged = merge(base, incoming);

      await env.CASA.put('state', JSON.stringify(merged));
      return json({ ok: true, sentinel: merged.sentinel });
    }

    return json({ error: 'metodo non ammesso' }, 405);
  }
};

// Stessa regola del lato tablet: per ogni campo vince la marcatura piu
// recente, e i promemoria si fondono per identificativo.
function merge(base, incoming){
  var out = {
    settings: Object.assign({}, base.settings),
    stamps: Object.assign({}, base.stamps),
    reminders: mergeList(base.reminders, incoming.reminders, function(a, b){ return (a.when || 0) - (b.when || 0); }),
    shopping: mergeList(base.shopping, incoming.shopping, null),
    messages: [],
    sentinel: base.sentinel || null
  };

  // Impostazioni: vince solo un valore scelto da qualcuno e piu recente.
  // Un valore senza marcatura e un valore di fabbrica, e non deve
  // sovrascrivere la scelta di una persona.
  var theirs = incoming.stamps || {};
  for (var k in (incoming.settings || {})) {
    var t = theirs[k] || 0;
    var m = out.stamps[k] || 0;
    if (!(k in out.settings) || t > m) {
      out.settings[k] = incoming.settings[k];
      out.stamps[k] = t;
    }
  }

  // I messaggi dell interfono durano un giorno e poi spariscono.
  var msgById = {};
  var msgLists = [base.messages || [], incoming.messages || []];
  var dayAgo = Date.now() - 86400000;
  for (var a = 0; a < msgLists.length; a++) {
    for (var b = 0; b < msgLists[a].length; b++) {
      var msg = msgLists[a][b];
      if (msg && msg.id && msg.at > dayAgo) msgById[msg.id] = msg;
    }
  }
  for (var mid in msgById) out.messages.push(msgById[mid]);
  out.messages.sort(function(x, y){ return x.at - y.at; });

  // Sentinella. Una decisione senza marcatura del servizio e nuova: e
  // appena stata presa su un dispositivo, quindi e la piu recente, e riceve
  // qui la marcatura. Una decisione gia marcata e solo l eco di qualcosa
  // gia registrato: vince solo se e davvero piu recente di quella in
  // memoria. Cosi un tablet che ripete la sua vecchia decisione non annulla
  // quella appena presa dal telefono.
  var qui = base.sentinel || null;
  var la = incoming.sentinel || null;
  if (la && typeof la.armed === 'boolean') {
    if (!la.serverAt) {
      var stessa = qui && qui.at === la.at && qui.armed === la.armed && qui.from === la.from;
      if (!stessa) {
        out.sentinel = { armed: la.armed, at: la.at || 0, from: la.from || 'sconosciuto', serverAt: Date.now() };
      }
    } else if (!qui || la.serverAt > (qui.serverAt || 0)) {
      out.sentinel = la;
    }
  }

  return out;
}

// Fonde due liste di voci con identificativo: per ogni voce vince la
// modifica piu recente. I segnaposto delle cancellazioni si tengono un
// mese, poi si buttano.
function mergeList(a, b, sortFn){
  var byId = {};
  var order = [];
  var lists = [a || [], b || []];
  for (var i = 0; i < lists.length; i++) {
    for (var j = 0; j < lists[i].length; j++) {
      var r = lists[i][j];
      if (!r || !r.id) continue;
      if (!byId[r.id]) { byId[r.id] = r; order.push(r.id); }
      else if ((r.editedAt || 0) > (byId[r.id].editedAt || 0)) byId[r.id] = r;
    }
  }
  var cutoff = Date.now() - 30 * 86400000;
  var out = [];
  for (var k = 0; k < order.length; k++) {
    var v = byId[order[k]];
    if (v.deleted && (v.editedAt || 0) < cutoff) continue;
    out.push(v);
  }
  if (sortFn) out.sort(sortFn);
  return out;
}
