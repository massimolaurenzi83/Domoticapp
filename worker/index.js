// Servizio di appoggio per i pannelli di casa.
//
// Tiene il documento condiviso fra i tablet e, piu avanti, custodira le
// chiavi di Tuya, Spotify e Google Calendar, che non possono stare in una
// pagina pubblica. Gira gratuitamente su Cloudflare Workers.
//
// Pubblicazione:
//   npm create cloudflare@latest casa-ponte
//   sostituisci src/index.js con questo file
//   npx wrangler kv namespace create CASA
//   aggiungi il binding a wrangler.toml e imposta il segreto:
//   npx wrangler secret put CASA_TOKEN
//   npx wrangler deploy

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

    // Chi sbaglia il token troppe volte di fila viene messo in attesa.
    // Senza questo, una parola corta si indovina provandole tutte.
    var chiamante = request.headers.get('CF-Connecting-IP') || 'ignoto';
    var chiaveTentativi = 'tentativi:' + chiamante;
    var tentativi = parseInt((await env.CASA.get(chiaveTentativi)) || '0', 10);

    if (tentativi >= 10) {
      return json({ error: 'troppi tentativi, riprova fra un quarto d ora' }, 429);
    }

    // Il confronto non deve rivelare quanti caratteri erano giusti: per
    // questo scorre sempre tutta la parola invece di fermarsi al primo
    // carattere diverso.
    if (!confrontoSicuro(request.headers.get('X-Casa-Token') || '', env.CASA_TOKEN || '')) {
      await env.CASA.put(chiaveTentativi, String(tentativi + 1), { expirationTtl: 900 });
      return json({ error: 'token rifiutato' }, 401);
    }

    if (tentativi > 0) await env.CASA.delete(chiaveTentativi);

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
      if (request.method === 'POST') {
        var copia = await request.json();
        if (!copia || !copia.data) return json({ error: 'copia non valida' }, 400);

        // Teniamo la piu recente e la precedente, cosi una copia sbagliata
        // non cancella l ultima buona.
        var vecchia = await env.CASA.get('backup');
        if (vecchia) await env.CASA.put('backup_prec', vecchia);
        await env.CASA.put('backup', JSON.stringify(copia));
        return json({ ok: true, at: copia.at });
      }

      if (request.method === 'GET') {
        var quale = url.searchParams.get('quale') === 'precedente' ? 'backup_prec' : 'backup';
        var salvata = await env.CASA.get(quale);
        return salvata
          ? new Response(salvata, { headers: Object.assign({ 'Content-Type': 'application/json' }, CORS) })
          : json(null);
      }
    }

    // ---------- documento condiviso ----------

    if (url.pathname !== '/state') return json({ error: 'non trovato' }, 404);

    if (request.method === 'GET') {
      var stored = await env.CASA.get('state');
      return json(stored ? JSON.parse(stored) : { settings: {}, stamps: {}, reminders: [], messages: [] });
    }

    if (request.method === 'PUT') {
      var incoming;
      try { incoming = await request.json(); }
      catch (e) { return json({ error: 'corpo non valido' }, 400); }

      var previous = await env.CASA.get('state');
      var base = previous ? JSON.parse(previous) : { settings: {}, stamps: {}, reminders: [], messages: [] };
      var merged = merge(base, incoming);

      await env.CASA.put('state', JSON.stringify(merged));
      return json({ ok: true });
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
    reminders: [],
    messages: []
  };

  var theirs = incoming.stamps || {};
  for (var k in (incoming.settings || {})) {
    if ((theirs[k] || 0) >= (out.stamps[k] || 0)) {
      out.settings[k] = incoming.settings[k];
      out.stamps[k] = theirs[k] || Date.now();
    }
  }

  var byId = {};
  var lists = [base.reminders || [], incoming.reminders || []];
  for (var i = 0; i < lists.length; i++) {
    for (var j = 0; j < lists[i].length; j++) {
      var r = lists[i][j];
      if (!r || !r.id) continue;
      if (!byId[r.id] || (r.editedAt || 0) > (byId[r.id].editedAt || 0)) byId[r.id] = r;
    }
  }

  var cutoff = Date.now() - 30 * 86400000;
  for (var id in byId) {
    // I segnaposto delle cancellazioni si buttano dopo un mese.
    if (byId[id].deleted && (byId[id].editedAt || 0) < cutoff) continue;
    out.reminders.push(byId[id]);
  }
  out.reminders.sort(function(a, b){ return (a.when || 0) - (b.when || 0); });

  // I messaggi dell interfono durano un giorno e poi spariscono.
  var msgById = {};
  var msgLists = [base.messages || [], incoming.messages || []];
  var dayAgo = Date.now() - 86400000;
  for (var a = 0; a < msgLists.length; a++) {
    for (var b = 0; b < msgLists[a].length; b++) {
      var m = msgLists[a][b];
      if (m && m.id && m.at > dayAgo) msgById[m.id] = m;
    }
  }
  for (var mid in msgById) out.messages.push(msgById[mid]);
  out.messages.sort(function(x, y){ return x.at - y.at; });

  return out;
}
