import { sendViaBridge, bridgeConfigured } from './bridge.js';

// Modello dei dispositivi di casa.
//
// Per ora ogni comando finisce in un driver finto che cambia solo lo stato
// locale, cosi l interfaccia e provabile subito sul tablet. In fase due
// sostituiremo il driver con le chiamate vere: Tuya per luci e citofono,
// Spotify per i Nest, e un piccolo ponte in rete locale per il Broadlink
// RM4C mini e per la presa D-Link, che parlano solo dentro casa.

export var devices = [
  { id:'luce-soggiorno', name:'Soggiorno', room:'casa', kind:'light',  via:'tuya',     glyph:'\u25CF', on:false },
  { id:'luce-cucina',    name:'Cucina',    room:'casa', kind:'light',  via:'tuya',     glyph:'\u25CF', on:false },
  { id:'luce-camera',    name:'Camera',    room:'casa', kind:'light',  via:'tuya',     glyph:'\u25CF', on:false },
  { id:'luce-corridoio', name:'Corridoio', room:'casa', kind:'light',  via:'tuya',     glyph:'\u25CF', on:false },
  { id:'tv',             name:'TV',        room:'casa', kind:'ir',     via:'broadlink',glyph:'\u25A3', on:false },
  { id:'presa',          name:'Presa',     room:'casa', kind:'switch', via:'dlink',    glyph:'\u25C9', on:false },
  { id:'citofono',       name:'Citofono',  room:'casa', kind:'intercom',via:'tuya',    glyph:'\u2302', on:false },

  { id:'clima-salotto',  name:'Salotto',   room:'clima',kind:'ir',     via:'broadlink',glyph:'\u2744', on:false },
  { id:'clima-camera',   name:'Camera',    room:'clima',kind:'ir',     via:'broadlink',glyph:'\u2744', on:false }
];

export var scenes = [
  { id:'buonanotte', name:'Buonanotte', room:'casa',   glyph:'\u25D0' },
  { id:'cena',       name:'Cena',       room:'casa',   glyph:'\u25D1' },
  { id:'relax',      name:'Relax',      room:'musica', glyph:'\u266B' },
  { id:'silenzio',   name:'Silenzio',   room:'musica', glyph:'\u25A0' }
];

export var speakers = [
  { id:'nest-cucina',   name:'Cucina',   room:'musica', glyph:'\u266A', on:false },
  { id:'nest-soggiorno',name:'Soggiorno',room:'musica', glyph:'\u266A', on:false },
  { id:'nest-camera',   name:'Camera',   room:'musica', glyph:'\u266A', on:false },
  { id:'nest-bagno',    name:'Bagno',    room:'musica', glyph:'\u266A', on:false }
];

// Chi vuole sapere delle accensioni fatte da una persona si aggancia qui.
// Serve a tenere devices.js indipendente dal resto.
var toggleWatchers = [];

export function onToggle(fn){ toggleWatchers.push(fn); }

var log = [];

export function findDevice(id){
  var all = devices.concat(speakers);
  for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
  return null;
}

export function toggle(id, byPerson){
  var d = findDevice(id);
  if (!d) return null;
  d.on = !d.on;
  if (byPerson !== false) {
    for (var w = 0; w < toggleWatchers.length; w++) toggleWatchers[w](id, d.on);
  }
  send(d.via, d.id, d.on ? 'accendi' : 'spegni');
  return d;
}

export function runScene(id){
  send('scena', id, 'esegui');
}

// Broadlink e presa D-Link vivono solo in rete locale: se il ponte non
// c'e, il comando non puo partire e va detto, non fatto finta.
var LOCAL_ONLY_VIA = { broadlink:1, dlink:1 };

function send(via, id, action){
  var stamp = new Date().toLocaleTimeString('it-IT');
  var viaBridge = !!LOCAL_ONLY_VIA[via];

  if (viaBridge && !bridgeConfigured()) {
    log.push(stamp + '  ' + via + '  ' + id + '  ' + action + '  non inviato, manca il ponte');
    if (log.length > 40) log.shift();
    return;
  }

  if (viaBridge) {
    sendViaBridge(via, id, action).then(function(ok){
      log.push(stamp + '  ' + via + '  ' + id + '  ' + action + (ok ? '  inviato' : '  ponte non raggiungibile'));
      if (log.length > 40) log.shift();
    });
    return;
  }

  log.push(stamp + '  ' + via + '  ' + id + '  ' + action);
  if (log.length > 40) log.shift();
}

// Vero quando il dispositivo non e raggiungibile senza ponte.
export function needsBridge(device){
  return !!(device && LOCAL_ONLY_VIA[device.via] && !bridgeConfigured());
}

export function commandLog(){ return log.slice(-6).reverse().join('\n'); }
