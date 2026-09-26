// Copia di sicurezza e ripristino.
//
// Tre reti di protezione, una dentro l altra.
//
// 1. Una copia dentro il tablet, in IndexedDB, rifatta ogni giorno.
//    Serve quando Android ripulisce la memoria leggera del browser per
//    fare spazio: e la cosa che succede piu spesso e senza preavviso.
// 2. Una copia sul servizio, se configurato. Serve quando il tablet si
//    rompe o si perde, ed e l unica che sopravvive al dispositivo.
// 3. Un file che scarichi e tieni dove vuoi. Serve quando vuoi tornare
//    indietro a una configurazione che funzionava.
//
// Al riavvio, se le impostazioni risultano sparite ma una copia esiste,
// il ripristino avviene da solo senza chiedere niente.

import { settings, effectiveRole } from './config.js';

var DB = 'domapp-backup';
var STORE = 'copies';
var LAST_KEY = 'domapp.backup.last.v1';
var DEVICE_KEY = 'domapp.device.id';

// Identita di questo dispositivo, creata una volta e poi conservata.
export function deviceId(){
  var id = null;
  try { id = localStorage.getItem(DEVICE_KEY); } catch (e) {}
  if (!id) {
    id = 'dev' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    try { localStorage.setItem(DEVICE_KEY, id); } catch (e) {}
  }
  return id;
}

function deviceLabel(){
  var ua = navigator.userAgent;
  if (/SM-P6/.test(ua)) return 'Galaxy Note 10.1';
  if (/Xiaomi|MIUI|M2105K81AC|21051182/.test(ua)) return 'Xiaomi Pad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  return 'Dispositivo';
}

export function deviceInfo(){
  return { id: deviceId(), label: deviceLabel(), role: effectiveRole() };
}

// Tutto cio che va salvato. Le chiavi del collegamento restano fuori:
// sono proprie di ogni tablet e non vanno copiate sull altro.
var KEYS = [
  'domapp.settings.v1',
  'domapp.reminders.v1',
  'domapp.shopping.v1',
  'domapp.alarms.v1',
  'domapp.cameras.v1',
  'domapp.doorbell.v1',
  'domapp.habits.v1',
  'domapp.radio.fav.v1',
  'domapp.intercom.seen.v1',
  'domapp.stamps.v1',
  'domapp.setup.done.v1'
];

var LOCAL_ONLY_SETTINGS = ['syncUrl', 'syncToken', 'bridgeUrl', 'uiScale', 'wallpaper', 'deviceRole'];

// ---------- deposito ----------

var db = null;

function open(){
  if (db) return Promise.resolve(db);
  return new Promise(function(resolve, reject){
    var req = indexedDB.open(DB, 1);
    req.onupgradeneeded = function(){
      var d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = function(){ db = req.result; resolve(db); };
    req.onerror = function(){ reject(req.error); };
  });
}

function store(mode){
  return open().then(function(d){ return d.transaction(STORE, mode).objectStore(STORE); });
}

// ---------- fotografia dello stato ----------

export function snapshot(){
  var data = {};
  for (var i = 0; i < KEYS.length; i++) {
    var v = null;
    try { v = localStorage.getItem(KEYS[i]); } catch (e) {}
    if (v !== null) data[KEYS[i]] = v;
  }
  return {
    version: 1,
    at: Date.now(),
    device: navigator.userAgent.indexOf('SM-P6') !== -1 ? 'samsung' : 'tablet',
    data: data
  };
}

// Rimette a posto lo stato. Le chiavi del collegamento di questo tablet
// non vengono toccate, altrimenti un ripristino dall altro tablet lo
// staccherebbe dal servizio.
export function restore(copy, options){
  if (!copy || !copy.data) return false;
  var keepLocal = !options || options.keepLocalKeys !== false;

  var mineUrl = settings.syncUrl;
  var mineToken = settings.syncToken;
  var mineBridge = settings.bridgeUrl;

  for (var k in copy.data) {
    if (KEYS.indexOf(k) === -1) continue;
    try { localStorage.setItem(k, copy.data[k]); } catch (e) {}
  }

  if (keepLocal) {
    try {
      var s = JSON.parse(localStorage.getItem('domapp.settings.v1') || '{}');
      s.syncUrl = mineUrl;
      s.syncToken = mineToken;
      s.bridgeUrl = mineBridge;
      localStorage.setItem('domapp.settings.v1', JSON.stringify(s));
    } catch (e) {}
  }
  return true;
}

// ---------- copia dentro il tablet ----------

export function saveLocalCopy(){
  // Una copia di un dispositivo appena svuotato sovrascriverebbe quella buona.
  if (looksWiped()) return Promise.resolve(null);
  var copy = snapshot();
  return store('readwrite').then(function(st){
    return new Promise(function(resolve){
      // Teniamo la copia di oggi e quella precedente: se una configurazione
      // sbagliata viene salvata, quella di ieri e ancora buona.
      var r = st.put({ id: 'ultima', copy: copy });
      r.onsuccess = function(){
        try { localStorage.setItem(LAST_KEY, String(copy.at)); } catch (e) {}
        resolve(copy.at);
      };
      r.onerror = function(){ resolve(null); };
    });
  }).then(function(at){
    return rotate().then(function(){ return at; });
  }).catch(function(){ return null; });
}

function rotate(){
  return store('readwrite').then(function(st){
    return new Promise(function(resolve){
      var get = st.get('ultima');
      get.onsuccess = function(){
        var last = get.result;
        if (!last) { resolve(); return; }
        var giorno = 86400000;
        st.get('precedente').onsuccess = function(){};
        // La copia di riserva si aggiorna solo se ha piu di un giorno.
        var back = st.get('precedente');
        back.onsuccess = function(){
          var prev = back.result;
          if (!prev || (last.copy.at - prev.copy.at) > giorno) {
            st.put({ id: 'precedente', copy: last.copy });
          }
          resolve();
        };
        back.onerror = function(){ resolve(); };
      };
      get.onerror = function(){ resolve(); };
    });
  }).catch(function(){});
}

export function readLocalCopy(which){
  return store('readonly').then(function(st){
    return new Promise(function(resolve){
      var r = st.get(which || 'ultima');
      r.onsuccess = function(){ resolve(r.result ? r.result.copy : null); };
      r.onerror = function(){ resolve(null); };
    });
  }).catch(function(){ return null; });
}

export function lastBackupAt(){
  try {
    var v = localStorage.getItem(LAST_KEY);
    return v ? parseInt(v, 10) : null;
  } catch (e) { return null; }
}

// ---------- ripristino automatico ----------

// Vero quando il tablet sembra appena svuotato: nessuna impostazione, ma
// una copia esiste. E il segno che Android ha ripulito la memoria leggera.
export function looksWiped(){
  var hasSettings = false;
  try { hasSettings = !!localStorage.getItem('domapp.settings.v1'); } catch (e) {}
  return !hasSettings;
}

export function autoRestoreIfNeeded(){
  if (!looksWiped()) return Promise.resolve(null);

  return readLocalCopy('ultima').then(function(copy){
    if (!copy) return readLocalCopy('precedente');
    return copy;
  }).then(function(copy){
    if (!copy) return null;
    restore(copy, { keepLocalKeys: false });
    return copy.at;
  }).catch(function(){ return null; });
}

// ---------- copia sul servizio ----------

export function pushToService(){
  if (!settings.syncUrl || !settings.syncToken) return Promise.resolve(false);
  // Un tablet appena svuotato non deve mandare la sua copia vuota.
  if (looksWiped()) return Promise.resolve(false);
  var copy = snapshot();
  copy.device = deviceInfo();

  // Le impostazioni proprie del dispositivo non devono viaggiare.
  try {
    var s = JSON.parse(copy.data['domapp.settings.v1'] || '{}');
    for (var i = 0; i < LOCAL_ONLY_SETTINGS.length; i++) delete s[LOCAL_ONLY_SETTINGS[i]];
    copy.data['domapp.settings.v1'] = JSON.stringify(s);
  } catch (e) {}

  return fetch(String(settings.syncUrl).replace(/\/+$/, '') + '/backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Casa-Token': settings.syncToken },
    body: JSON.stringify(copy)
  }).then(function(r){ return r.ok; }).catch(function(){ return false; });
}

// Cerca sul servizio la copia piu adatta: quella di questo dispositivo se
// c e, altrimenti la piu recente di un pannello di casa. Restituisce la
// copia con l indicazione di chi l ha fatta, oppure lancia un errore che
// spiega cosa non va.
export function pullFromService(){
  if (!settings.syncUrl || !settings.syncToken) {
    return Promise.reject(new Error('il servizio di collegamento non e configurato'));
  }
  var base = String(settings.syncUrl).replace(/\/+$/, '');
  var h = { 'X-Casa-Token': settings.syncToken };

  function leggi(r){
    if (r.status === 401) throw new Error('parola condivisa rifiutata dal servizio');
    if (!r.ok) throw new Error('il servizio ha risposto ' + r.status);
    return r.json();
  }

  return fetch(base + '/backup', { headers: h, cache: 'no-store' }).then(leggi).then(function(indice){
    if (!indice || !indice.length) throw new Error('sul servizio non c e ancora nessuna copia');
    var mio = deviceId();
    var scelta = indice.filter(function(x){ return x.id === mio; })[0];
    if (!scelta) {
      var pannelli = indice.filter(function(x){ return x.role === 'pannello'; });
      var elenco = pannelli.length ? pannelli : indice;
      scelta = elenco.slice().sort(function(a, b){ return b.at - a.at; })[0];
    }
    return fetch(base + '/backup?device=' + encodeURIComponent(scelta.id), { headers: h, cache: 'no-store' })
      .then(leggi).then(function(copy){ return { copy: copy, from: scelta }; });
  }, function(e){
    if (e instanceof TypeError) throw new Error('servizio non raggiungibile');
    throw e;
  });
}

// ---------- file ----------

export function downloadFile(){
  var copy = snapshot();
  var text = JSON.stringify(copy, null, 2);
  var blob = new Blob([text], { type: 'application/json' });
  var url = URL.createObjectURL(blob);

  var d = new Date(copy.at);
  var name = 'casa-' + d.getFullYear() + '-' +
             two(d.getMonth() + 1) + '-' + two(d.getDate()) + '.json';

  var a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
  return name;
}

function two(n){ return n < 10 ? '0' + n : String(n); }

export function readFile(file){
  return new Promise(function(resolve, reject){
    var reader = new FileReader();
    reader.onload = function(){
      try {
        var copy = JSON.parse(reader.result);
        if (!copy || !copy.data) throw new Error('file non riconosciuto');
        resolve(copy);
      } catch (e) { reject(e); }
    };
    reader.onerror = function(){ reject(new Error('non riesco a leggere il file')); };
    reader.readAsText(file);
  });
}

// ---------- avvio ----------

var timer = null;

// Il ripristino automatico avviene prima dell avvio del pannello, in
// app.js: qui si pianificano solo le copie.
export function startBackups(){
  var last = lastBackupAt();
  // La prima copia si fa subito se non ce n e mai stata una, altrimenti
  // si aspetta che ne passi una giornata.
  if (!last || Date.now() - last > 86400000) saveLocalCopy().then(pushToService);

  if (timer) clearInterval(timer);
  timer = setInterval(function(){
    var l = lastBackupAt();
    if (!l || Date.now() - l > 86400000) saveLocalCopy().then(pushToService);
  }, 3600000);
}

export function backupDiagnostics(){
  var at = lastBackupAt();
  if (!at) return 'Copia di sicurezza: nessuna ancora.';
  return 'Copia di sicurezza: ultima del ' + new Date(at).toLocaleString('it-IT') +
         (settings.syncUrl ? ', anche sul servizio.' : ', solo su questo tablet.');
}
