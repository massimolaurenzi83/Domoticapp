// Allineamento fra i dispositivi di casa.
//
// Ogni dispositivo tiene la sua copia locale e continua a funzionare anche
// senza rete. Quando la rete c e, la copia viene confrontata con quella del
// servizio. Per le impostazioni vince la modifica piu recente, campo per
// campo; per promemoria e spesa vince la modifica piu recente di ciascuna
// voce, e le cancellazioni viaggiano come segnaposto per un mese.
//
// Regole che evitano i guai trovati in collaudo:
//   - si invia solo quando qualcosa cambia su questo dispositivo, mai come
//     conseguenza di un dato appena ricevuto, altrimenti due tablet si
//     rimbalzano gli stessi dati all infinito;
//   - un valore mai toccato da nessuno non ha marcatura, e non puo
//     sovrascrivere un valore scelto da una persona;
//   - la sentinella segue l ordine d arrivo al servizio, non l orologio dei
//     dispositivi, che si sfasa.

import { settings, save as saveLocal } from './config.js';
import { receive, mergeForSync, pruneQueue } from './intercom.js';
import { lastDecision, applyRemoteDecision, adoptServerStamp } from './presence.js';

var CONF_KEY = 'domapp.sync.v1';
var STAMP_KEY = 'domapp.stamps.v1';
var REM_KEY = 'domapp.reminders.v1';
var SHOP_KEY = 'domapp.shopping.v1';
var MONTH = 30 * 86400000;

// Valori propri di ogni schermo, che non devono viaggiare.
export var LOCAL_ONLY = { syncUrl: 1, syncToken: 1, bridgeUrl: 1, uiScale: 1, wallpaper: 1, deviceRole: 1 };

var conf = loadConf();
var timer = null;
var pushTimer = null;
var status = 'non configurato';
var lastError = '';
var onRemoteChange = null;
var firstPullDone = false;

function loadConf(){
  try { return JSON.parse(localStorage.getItem(CONF_KEY) || '{}'); } catch (e) { return {}; }
}

export function syncConfigured(){ return !!(conf.url && conf.token); }

export function setSyncConfig(url, token){
  conf = { url: String(url || '').trim().replace(/\/+$/, ''), token: String(token || '').trim() };
  try { localStorage.setItem(CONF_KEY, JSON.stringify(conf)); } catch (e) {}
  firstPullDone = false;
  if (syncConfigured()) startSync(onRemoteChange);
}

export function syncStatus(){ return status + (lastError ? ', ' + lastError : ''); }

// ---------- marcature temporali per campo ----------

function stamps(){
  try { return JSON.parse(localStorage.getItem(STAMP_KEY) || '{}'); } catch (e) { return {}; }
}

function writeStamps(s){
  try { localStorage.setItem(STAMP_KEY, JSON.stringify(s)); } catch (e) {}
}

// Da chiamare quando una persona cambia un impostazione su questo
// dispositivo. Accetta anche piu nomi insieme.
export function touch(){
  var s = stamps();
  var ora = Date.now();
  for (var i = 0; i < arguments.length; i++) s[arguments[i]] = ora;
  writeStamps(s);
  pushSoon();
}

// Promemoria, spesa e messaggi annunciano le loro modifiche con questo
// evento, cosi non devono conoscere questo modulo.
window.addEventListener('casa-dati', function(){ pushSoon(); });

// Un modulo che cambia un impostazione per conto di una persona, come
// l ultimo comando dato a una luce, la segna con questo evento.
window.addEventListener('casa-tocca', function(e){
  touch.apply(null, (e && e.detail) || []);
});

// Le modifiche ravvicinate partono insieme, un attimo dopo l ultima.
export function pushSoon(){
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(function(){ pushTimer = null; push(); }, 1500);
}

// ---------- ciclo ----------

export function startSync(callback){
  if (callback) onRemoteChange = callback;
  if (!syncConfigured()) { status = 'non configurato'; return; }
  if (timer) clearInterval(timer);
  pull();
  timer = setInterval(pull, 30000);
}

export function stopSync(){
  if (timer) { clearInterval(timer); timer = null; }
}

// Allinea subito, senza aspettare il prossimo giro. Restituisce quando ha
// finito di scaricare e, se serve, di inviare.
export function syncNow(){
  return pull().then(function(){ return push(); });
}

function headers(){
  return { 'Content-Type': 'application/json', 'X-Casa-Token': conf.token };
}

function explain(r){
  if (r.status === 401) return 'parola condivisa rifiutata dal servizio';
  if (r.status === 429) return 'troppi tentativi con una parola sbagliata, riprova fra un quarto d’ora';
  if (r.status === 500) return 'il servizio non ha ancora la parola condivisa impostata';
  return 'il servizio ha risposto ' + r.status;
}

function pull(){
  if (!syncConfigured()) return Promise.resolve(false);
  return fetch(conf.url + '/state', { headers: headers(), cache: 'no-store' })
    .then(function(r){
      if (!r.ok) throw new Error(explain(r));
      return r.json();
    })
    .then(function(remote){
      var visible = merge(remote);
      status = 'allineato';
      lastError = '';
      if (visible && onRemoteChange) onRemoteChange();
      // Al primo giro si consegna quello che questo dispositivo aveva gia,
      // per esempio promemoria scritti prima di collegarlo.
      if (!firstPullDone) { firstPullDone = true; pushSoon(); }
      return visible;
    })
    .catch(function(e){
      status = 'non allineato';
      lastError = e && e.message ? e.message : 'servizio non raggiungibile';
      return false;
    });
}

function readList(key){
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
}

function push(){
  if (!syncConfigured()) return Promise.resolve(false);
  var shared = {};
  for (var k in settings) if (!LOCAL_ONLY[k]) shared[k] = settings[k];
  pruneQueue();

  var decision = lastDecision();
  var body = {
    settings: shared,
    stamps: stamps(),
    reminders: readList(REM_KEY),
    shopping: readList(SHOP_KEY),
    messages: mergeForSync(lastRemoteMessages),
    sentinel: decision
  };

  return fetch(conf.url + '/state', {
    method: 'PUT', headers: headers(), body: JSON.stringify(body)
  }).then(function(r){
    if (!r.ok) throw new Error(explain(r));
    return r.json();
  }).then(function(res){
    status = 'allineato';
    lastError = '';
    // Il servizio restituisce la sua marcatura della nostra decisione: da
    // ora in poi il confronto con gli altri dispositivi usa quella.
    if (res && res.sentinel) adoptServerStamp(res.sentinel);
    return true;
  }).catch(function(e){
    status = 'invio non riuscito';
    lastError = e && e.message ? e.message : 'servizio non raggiungibile';
    return false;
  });
}

// ---------- fusione ----------

var lastRemoteMessages = [];

// Restituisce vero se qualcosa di visibile e cambiato su questo schermo.
function merge(remote){
  if (!remote || typeof remote !== 'object') return false;
  var mine = stamps();
  var theirs = remote.stamps || {};
  var visible = false;
  var stampsChanged = false;

  for (var k in (remote.settings || {})) {
    if (LOCAL_ONLY[k]) continue;
    var t = theirs[k] || 0;
    var m = mine[k] || 0;
    // Solo un valore scelto da qualcuno, e piu recente del nostro, vince.
    if (t > m) {
      if (settings[k] !== remote.settings[k]) { settings[k] = remote.settings[k]; visible = true; }
      mine[k] = t;
      stampsChanged = true;
    }
  }
  if (visible) saveLocal();
  if (stampsChanged) writeStamps(mine);

  if (mergeList(REM_KEY, remote.reminders, byWhen)) visible = true;
  if (mergeList(SHOP_KEY, remote.shopping, null)) visible = true;

  lastRemoteMessages = remote.messages || [];
  if (receive(lastRemoteMessages) > 0) visible = true;

  if (applyRemoteDecision(remote.sentinel)) visible = true;

  return visible;
}

function byWhen(a, b){ return (a.when || 0) - (b.when || 0); }

// Fonde una lista di voci con identificativo. Una cancellazione mai vista
// viene conservata in silenzio, perche non cambia niente a schermo ma
// impedisce che la voce ricompaia. Restituisce vero solo per le modifiche
// che si vedono.
export function mergeList(key, remote, sortFn){
  if (!remote || !remote.length) return false;
  var local = readList(key);
  var byId = {};
  var order = [];
  var i;

  for (i = 0; i < local.length; i++) {
    if (!local[i] || !local[i].id) continue;
    byId[local[i].id] = local[i];
    order.push(local[i].id);
  }

  var dirty = false;
  var visible = false;
  for (i = 0; i < remote.length; i++) {
    var r = remote[i];
    if (!r || !r.id) continue;
    var cur = byId[r.id];
    if (!cur) {
      byId[r.id] = r;
      order.push(r.id);
      dirty = true;
      if (!r.deleted) visible = true;
    } else if ((r.editedAt || 0) > (cur.editedAt || 0)) {
      byId[r.id] = r;
      dirty = true;
      visible = true;
    }
  }

  if (!dirty) return false;

  var cutoff = Date.now() - MONTH;
  var out = [];
  for (i = 0; i < order.length; i++) {
    var v = byId[order[i]];
    if (v.deleted && (v.editedAt || 0) < cutoff) continue;
    out.push(v);
  }
  if (sortFn) out.sort(sortFn);
  try { localStorage.setItem(key, JSON.stringify(out)); } catch (e) {}
  return visible;
}
