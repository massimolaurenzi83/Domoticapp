// Sentinella: sorveglianza mentre sei via.
//
// Gli scatti restano dentro il tablet, non su un servizio esterno. Quando
// scatta un allarme viene spedita fuori solo una miniatura insieme alla
// notifica, cosi se il tablet sparisce resta almeno l immagine del momento.
//
// I file vecchi vengono cancellati da soli, dopo i giorni che decidi tu e
// comunque quando lo spazio concesso al browser si avvicina al limite.

import { settings } from './config.js';

var DB = 'domapp-sentinel';
var STORE = 'shots';
var db = null;

function open(){
  if (db) return Promise.resolve(db);
  return new Promise(function(resolve, reject){
    var req = indexedDB.open(DB, 1);
    req.onupgradeneeded = function(){
      var d = req.result;
      if (!d.objectStoreNames.contains(STORE)) {
        var st = d.createObjectStore(STORE, { keyPath: 'id' });
        st.createIndex('at', 'at');
        st.createIndex('event', 'event');
      }
    };
    req.onsuccess = function(){ db = req.result; resolve(db); };
    req.onerror = function(){ reject(req.error); };
  });
}

function tx(mode){
  return open().then(function(d){
    return d.transaction(STORE, mode).objectStore(STORE);
  });
}

// ---------- scrittura ----------

export function saveShot(blob, eventId, strength){
  return tx('readwrite').then(function(store){
    return new Promise(function(resolve, reject){
      var rec = {
        id: 'sh' + Date.now() + '-' + Math.floor(Math.random() * 10000),
        at: Date.now(),
        event: eventId,
        strength: strength || 0,
        size: blob.size,
        blob: blob
      };
      var r = store.add(rec);
      r.onsuccess = function(){ resolve(rec.id); };
      r.onerror = function(){ reject(r.error); };
    });
  });
}

// ---------- lettura ----------

export function listShots(limit){
  return tx('readonly').then(function(store){
    return new Promise(function(resolve){
      var out = [];
      var idx = store.index('at');
      var req = idx.openCursor(null, 'prev');
      req.onsuccess = function(){
        var c = req.result;
        if (!c || out.length >= (limit || 200)) { resolve(out); return; }
        out.push(c.value);
        c.continue();
      };
      req.onerror = function(){ resolve(out); };
    });
  });
}

// Raggruppa gli scatti per episodio, cosi l elenco mostra gli allarmi e
// non le centinaia di immagini che li compongono.
export function listEvents(){
  return listShots(600).then(function(shots){
    var groups = {};
    for (var i = 0; i < shots.length; i++) {
      var s = shots[i];
      if (!groups[s.event]) {
        groups[s.event] = { id: s.event, at: s.at, count: 0, peak: 0, cover: s };
      }
      var g = groups[s.event];
      g.count++;
      if (s.at > g.at) { g.at = s.at; }
      if (s.strength > g.peak) { g.peak = s.strength; g.cover = s; }
    }
    var out = [];
    for (var k in groups) out.push(groups[k]);
    out.sort(function(a, b){ return b.at - a.at; });
    return out;
  });
}

// ---------- pulizia ----------

export function pruneOld(){
  var days = parseInt(settings.sentinelKeepDays, 10);
  if (isNaN(days) || days <= 0) return Promise.resolve(0);
  var cutoff = Date.now() - days * 86400000;

  return tx('readwrite').then(function(store){
    return new Promise(function(resolve){
      var removed = 0;
      var req = store.index('at').openCursor(IDBKeyRange.upperBound(cutoff));
      req.onsuccess = function(){
        var c = req.result;
        if (!c) { resolve(removed); return; }
        c.delete(); removed++;
        c.continue();
      };
      req.onerror = function(){ resolve(removed); };
    });
  });
}

// Se lo spazio concesso si sta esaurendo, butta i piu vecchi finche non
// si torna sotto la soglia. Meglio perdere il passato che smettere di
// registrare il presente.
export function pruneForSpace(){
  if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(0);
  return navigator.storage.estimate().then(function(est){
    var quota = est.quota || 0;
    var used = est.usage || 0;
    if (!quota || used / quota < 0.8) return 0;

    return listShots(2000).then(function(shots){
      var toDrop = shots.slice(Math.floor(shots.length / 2));
      return tx('readwrite').then(function(store){
        for (var i = 0; i < toDrop.length; i++) store.delete(toDrop[i].id);
        return toDrop.length;
      });
    });
  }).catch(function(){ return 0; });
}

export function clearAll(){
  return tx('readwrite').then(function(store){
    store.clear();
    return true;
  });
}

export function storageInfo(){
  if (!navigator.storage || !navigator.storage.estimate) {
    return Promise.resolve('spazio non misurabile su questo browser');
  }
  return navigator.storage.estimate().then(function(est){
    var mbUsed = Math.round((est.usage || 0) / 1048576);
    var mbQuota = Math.round((est.quota || 0) / 1048576);
    return mbUsed + ' MB usati su ' + mbQuota + ' concessi';
  });
}

// Chiede al browser di non buttare l archivio quando lo spazio scarseggia.
export function keepStorage(){
  if (navigator.storage && navigator.storage.persist) {
    return navigator.storage.persist().catch(function(){ return false; });
  }
  return Promise.resolve(false);
}
