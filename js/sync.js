// Allineamento fra i due pannelli.
//
// Ogni tablet tiene la sua copia locale e continua a funzionare anche
// senza rete. Quando la rete c'e, la copia viene confrontata con quella
// condivisa e vince la versione piu recente, campo per campo. Lo Xiaomi
// puo quindi sparire per giorni e riallinearsi da solo al rientro.
//
// Lo stato delle luci e della musica non passa di qui: entrambi i pannelli
// lo leggono dalla stessa fonte, quindi sono gia coerenti.

import { settings, save as saveLocal } from './config.js';
import { receive, mergeForSync, pruneQueue } from './intercom.js';

var CONF_KEY = 'domapp.sync.v1';
var STAMP_KEY = 'domapp.stamps.v1';

var conf = loadConf();
var timer = null;
var status = 'non configurato';
var onRemoteChange = null;

function loadConf(){
  try { return JSON.parse(localStorage.getItem(CONF_KEY) || '{}'); } catch (e) { return {}; }
}

export function syncConfigured(){ return !!(conf.url && conf.token); }

export function setSyncConfig(url, token){
  conf = { url: String(url || '').replace(/\/+$/, ''), token: String(token || '') };
  try { localStorage.setItem(CONF_KEY, JSON.stringify(conf)); } catch (e) {}
  if (syncConfigured()) startSync(onRemoteChange);
}

export function syncStatus(){ return status; }

// ---------- marcature temporali per campo ----------

function stamps(){
  try { return JSON.parse(localStorage.getItem(STAMP_KEY) || '{}'); } catch (e) { return {}; }
}

function writeStamps(s){
  try { localStorage.setItem(STAMP_KEY, JSON.stringify(s)); } catch (e) {}
}

// Da chiamare quando l utente cambia un impostazione su questo tablet.
export function touch(field){
  var s = stamps();
  s[field] = Date.now();
  writeStamps(s);
  push();
}

// ---------- ciclo ----------

export function startSync(callback){
  onRemoteChange = callback;
  if (!syncConfigured()) { status = 'non configurato'; return; }
  if (timer) clearInterval(timer);
  pull();
  timer = setInterval(pull, 30000);
}

export function stopSync(){
  if (timer) { clearInterval(timer); timer = null; }
}

function headers(){
  return { 'Content-Type': 'application/json', 'X-Casa-Token': conf.token };
}

function pull(){
  if (!syncConfigured()) return Promise.resolve();
  return fetch(conf.url + '/state', { headers: headers(), cache: 'no-store' })
    .then(function(r){
      if (r.status === 401) throw new Error('token rifiutato');
      if (!r.ok) throw new Error('stato ' + r.status);
      return r.json();
    })
    .then(function(remote){
      var changed = merge(remote);
      status = 'allineato';
      if (changed && onRemoteChange) onRemoteChange();
      if (changed) push();
    })
    .catch(function(e){ status = 'non raggiungibile: ' + e.message; });
}

function push(){
  if (!syncConfigured()) return Promise.resolve();
  var shared = {};
  for (var k in settings) if (!LOCAL_ONLY[k]) shared[k] = settings[k];
  pruneQueue();
  var body = { settings: shared, stamps: stamps(), reminders: readReminders(), messages: mergeForSync(lastRemoteMessages) };
  return fetch(conf.url + '/state', {
    method: 'PUT', headers: headers(), body: JSON.stringify(body)
  }).then(function(r){
    status = r.ok ? 'allineato' : 'invio rifiutato';
  }).catch(function(){ status = 'invio non riuscito'; });
}

// ---------- fusione ----------

var LOCAL_ONLY = { syncUrl:1, syncToken:1, bridgeUrl:1 };
var lastRemoteMessages = [];

function merge(remote){
  if (!remote || typeof remote !== 'object') return false;
  var mine = stamps();
  var theirs = remote.stamps || {};
  var changed = false;

  for (var k in (remote.settings || {})) {
    if (LOCAL_ONLY[k]) continue;
    var t = theirs[k] || 0;
    var m = mine[k] || 0;
    if (t > m && settings[k] !== remote.settings[k]) {
      settings[k] = remote.settings[k];
      mine[k] = t;
      changed = true;
    }
  }
  if (changed) { saveLocal(); writeStamps(mine); }

  if (mergeReminders(remote.reminders)) changed = true;

  lastRemoteMessages = remote.messages || [];
  if (receive(lastRemoteMessages) > 0) changed = true;

  return changed;
}

var REM_KEY = 'domapp.reminders.v1';

function readReminders(){
  try { return JSON.parse(localStorage.getItem(REM_KEY) || '[]'); } catch (e) { return []; }
}

// I promemoria si fondono per identificativo. Una cancellazione viaggia
// come voce marcata, cosi non riappare al giro successivo.
function mergeReminders(remote){
  if (!remote || !remote.length) return false;
  var local = readReminders();
  var byId = {};
  var i;

  for (i = 0; i < local.length; i++) byId[local[i].id] = local[i];

  var changed = false;
  for (i = 0; i < remote.length; i++) {
    var r = remote[i];
    if (!r || !r.id) continue;
    if (!byId[r.id]) { byId[r.id] = r; changed = true; }
    else if ((r.editedAt || 0) > (byId[r.id].editedAt || 0)) { byId[r.id] = r; changed = true; }
  }

  if (!changed) return false;

  var out = [];
  for (var id in byId) if (!byId[id].deleted) out.push(byId[id]);
  out.sort(function(a, b){ return (a.when || 0) - (b.when || 0); });
  try { localStorage.setItem(REM_KEY, JSON.stringify(out)); } catch (e) {}
  return true;
}
