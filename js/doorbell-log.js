// Chi ha suonato.
//
// Ogni squillo del citofono lascia l orario e, quando la fotocamera e
// disponibile, uno scatto. Al rientro vedi chi e passato mentre non c eri.
//
// Gli scatti stanno nello stesso deposito della sentinella, dentro il
// tablet, e seguono la stessa cancellazione automatica.

import { saveShot, listShots } from './sentinel.js';

var KEY = 'domapp.doorbell.v1';

export function loadRings(){
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
}

function persist(list){
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
}

// Registra uno squillo. Lo scatto e facoltativo: se la fotocamera e spenta
// o la casa e vuota, resta comunque traccia dell orario.
export function noteRing(blob, answered){
  var id = 'rg' + Date.now();
  var list = loadRings();

  list.unshift({
    id: id,
    at: Date.now(),
    answered: !!answered,
    hasShot: !!blob
  });
  if (list.length > 60) list = list.slice(0, 60);
  persist(list);

  if (blob) saveShot(blob, id, 0).catch(function(){});
  return id;
}

// Segna che qualcuno ha risposto, anche a distanza di poco.
export function markAnswered(id){
  var list = loadRings();
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) list[i].answered = true;
  }
  persist(list);
}

export function unansweredSince(ms){
  var since = Date.now() - (ms || 12 * 3600000);
  return loadRings().filter(function(r){ return !r.answered && r.at > since; });
}

// Ricollega a ogni squillo il suo scatto, quando c'e.
export function ringsWithShots(){
  var rings = loadRings();
  return listShots(400).then(function(shots){
    var byEvent = {};
    for (var i = 0; i < shots.length; i++) {
      var s = shots[i];
      if (!byEvent[s.event]) byEvent[s.event] = s;
    }
    for (var k = 0; k < rings.length; k++) {
      rings[k].shot = byEvent[rings[k].id] || null;
    }
    return rings;
  }).catch(function(){ return rings; });
}

export function describeRing(r){
  var d = new Date(r.at);
  var now = new Date();
  var hm = (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' +
           (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  if (d.toDateString() === now.toDateString()) return 'oggi alle ' + hm;
  var yesterday = new Date(now.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return 'ieri alle ' + hm;
  return d.toLocaleDateString('it-IT') + ' alle ' + hm;
}
