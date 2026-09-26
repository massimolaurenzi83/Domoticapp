import { sendViaBridge, bridgeConfigured } from './bridge.js';
import { settings, save } from './config.js';
import { sendToGoogle } from './google.js';

// Stanze, dispositivi e scene di casa.
//
// Sono tutti modificabili dal pannello, nella scheda Casa con il tasto
// Modifica. La disposizione viaggia dentro le impostazioni, quindi arriva
// da sola anche sull altro tablet e finisce nelle copie di sicurezza.
//
// Ogni dispositivo ha anche il nome con cui compare in Google Home: e
// quello che servira per comandarlo davvero, attraverso Google.

// ---------- tipi ----------

export var TYPES = {
  luce:         { label: 'Luce',           kind: 'light',    glyph: '●' },
  presa:        { label: 'Presa',          kind: 'switch',   glyph: '◉' },
  tv:           { label: 'Televisore',     kind: 'ir',       glyph: '▣' },
  clima:        { label: 'Climatizzatore', kind: 'ir',       glyph: '❄' },
  citofono:     { label: 'Citofono',       kind: 'intercom', glyph: '⌂' },
  altoparlante: { label: 'Altoparlante',   kind: 'speaker',  glyph: '♪' },
  altro:        { label: 'Altro',          kind: 'switch',   glyph: '◇' }
};

export var VIAS = {
  google:    'Google Home',
  broadlink: 'Broadlink diretto, serve il ponte',
  dlink:     'Presa D-Link diretta, serve il ponte'
};

// ---------- disposizione di esempio ----------
//
// Serve solo al primo avvio. Il pannello la segnala come esempio finche
// non la modifichi.

function exampleLayout(){
  return {
    example: true,
    rooms: [
      { id: 'soggiorno', name: 'Soggiorno' },
      { id: 'cucina',    name: 'Cucina' },
      { id: 'camera',    name: 'Camera' },
      { id: 'corridoio', name: 'Corridoio' },
      { id: 'bagno',     name: 'Bagno' }
    ],
    devices: [
      { id: 'luce-soggiorno', name: 'Luce',     room: 'soggiorno', type: 'luce',         google: 'luce soggiorno', via: 'google' },
      { id: 'tv',             name: 'TV',       room: 'soggiorno', type: 'tv',           google: 'televisore',     via: 'google' },
      { id: 'clima-salotto',  name: 'Clima',    room: 'soggiorno', type: 'clima',        google: 'clima soggiorno',via: 'google' },
      { id: 'presa',          name: 'Presa',    room: 'soggiorno', type: 'presa',        google: 'presa',          via: 'google' },
      { id: 'nest-soggiorno', name: 'Nest',     room: 'soggiorno', type: 'altoparlante', google: 'soggiorno',      via: 'google' },
      { id: 'luce-cucina',    name: 'Luce',     room: 'cucina',    type: 'luce',         google: 'luce cucina',    via: 'google' },
      { id: 'nest-cucina',    name: 'Nest',     room: 'cucina',    type: 'altoparlante', google: 'cucina',         via: 'google' },
      { id: 'luce-camera',    name: 'Luce',     room: 'camera',    type: 'luce',         google: 'luce camera',    via: 'google' },
      { id: 'clima-camera',   name: 'Clima',    room: 'camera',    type: 'clima',        google: 'clima camera',   via: 'google' },
      { id: 'nest-camera',    name: 'Nest',     room: 'camera',    type: 'altoparlante', google: 'camera',         via: 'google' },
      { id: 'luce-corridoio', name: 'Luce',     room: 'corridoio', type: 'luce',         google: 'luce corridoio', via: 'google' },
      { id: 'citofono',       name: 'Citofono', room: 'corridoio', type: 'citofono',     google: 'citofono',       via: 'google' },
      { id: 'nest-bagno',     name: 'Nest',     room: 'bagno',     type: 'altoparlante', google: 'bagno',          via: 'google' }
    ],
    scenes: [
      { id: 'buonanotte', name: 'Buonanotte', actions: [] , allLights: 'off' },
      { id: 'cena',       name: 'Cena',       actions: [
          { device: 'luce-cucina', on: true }, { device: 'luce-soggiorno', on: true } ] },
      { id: 'silenzio',   name: 'Silenzio',   actions: [], allSpeakers: 'off' }
    ]
  };
}

// ---------- stato ----------

// Gli elenchi vengono svuotati e riempiti sul posto, mai sostituiti: gli
// altri moduli li importano e devono sempre vedere quelli aggiornati.
export var rooms = [];
export var devices = [];
export var speakers = [];
export var scenes = [];

var layout = null;

export function currentLayout(){
  return JSON.parse(JSON.stringify(layout));
}

export function isExampleLayout(){
  return !!(layout && layout.example);
}

function readLayout(){
  try {
    var saved = settings.homeLayout ? JSON.parse(settings.homeLayout) : null;
    if (saved && saved.rooms && saved.devices) return saved;
  } catch (e) {}
  return exampleLayout();
}

// Rimette in memoria la disposizione, conservando acceso o spento dei
// dispositivi che esistevano gia.
export function applyLayout(next){
  var prima = {};
  var tutti = devices.concat(speakers);
  for (var i = 0; i < tutti.length; i++) prima[tutti[i].id] = tutti[i].on;

  layout = next;

  rooms.length = 0;
  for (var r = 0; r < layout.rooms.length; r++) rooms.push(layout.rooms[r]);

  devices.length = 0;
  speakers.length = 0;
  for (var d = 0; d < layout.devices.length; d++) {
    var src = layout.devices[d];
    var tipo = TYPES[src.type] || TYPES.altro;
    var dev = {
      id: src.id,
      name: src.name,
      room: src.room,
      type: src.type,
      kind: tipo.kind,
      glyph: tipo.glyph,
      via: src.via || 'google',
      google: src.google || '',
      on: !!prima[src.id]
    };
    if (tipo.kind === 'speaker') speakers.push(dev);
    else devices.push(dev);
  }

  scenes.length = 0;
  for (var s = 0; s < (layout.scenes || []).length; s++) {
    var sc = layout.scenes[s];
    scenes.push({ id: sc.id, name: sc.name, glyph: '◐', actions: sc.actions || [],
                  allLights: sc.allLights || null, allSpeakers: sc.allSpeakers || null });
  }
}

export function reloadLayout(){
  applyLayout(readLayout());
}

// Salva una disposizione modificata dal pannello. Chi chiama deve poi
// avvisare l allineamento, che vive in un altro modulo.
export function saveLayout(next){
  var pulita = JSON.parse(JSON.stringify(next));
  delete pulita.example;
  settings.homeLayout = JSON.stringify(pulita);
  save();
  applyLayout(pulita);
}

export function resetToExample(){
  settings.homeLayout = '';
  save();
  applyLayout(exampleLayout());
}

export function roomName(id){
  for (var i = 0; i < rooms.length; i++) if (rooms[i].id === id) return rooms[i].name;
  return '';
}

export function newId(prefix){
  return (prefix || 'x') + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
}

reloadLayout();

// ---------- comandi ----------

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
  send(d, d.on ? 'accendi' : 'spegni');
  return d;
}

export function setDevice(id, on, byPerson){
  var d = findDevice(id);
  if (!d || d.on === !!on) return d;
  return toggle(id, byPerson);
}

export function runScene(id){
  var sc = null;
  for (var i = 0; i < scenes.length; i++) if (scenes[i].id === id) sc = scenes[i];
  if (!sc) return;

  if (sc.allLights) {
    for (var l = 0; l < devices.length; l++) {
      if (devices[l].kind === 'light') setDevice(devices[l].id, sc.allLights === 'on', false);
    }
  }
  if (sc.allSpeakers) {
    for (var p = 0; p < speakers.length; p++) setDevice(speakers[p].id, sc.allSpeakers === 'on', false);
  }
  for (var a = 0; a < sc.actions.length; a++) {
    setDevice(sc.actions[a].device, sc.actions[a].on, false);
  }
}

// Broadlink e presa D-Link collegati direttamente vivono solo in rete
// locale: senza il ponte il comando non puo partire, e va detto.
var LOCAL_ONLY_VIA = { broadlink: 1, dlink: 1 };

function send(dev, action){
  var stamp = new Date().toLocaleTimeString('it-IT');
  var via = dev.via;
  var viaBridge = !!LOCAL_ONLY_VIA[via];

  function note(extra){
    log.push(stamp + '  ' + via + '  ' + dev.id + '  ' + action + (extra ? '  ' + extra : ''));
    if (log.length > 40) log.shift();
  }

  if (viaBridge && !bridgeConfigured()) { note('non inviato, manca il ponte'); return; }
  if (viaBridge) {
    sendViaBridge(via, dev.id, action).then(function(ok){ note(ok ? 'inviato' : 'ponte non raggiungibile'); });
    return;
  }
  if (!LIVE || !viaGoogle(dev)) { note('non inviato, Google Home non ancora collegato'); return; }

  var frase = googlePhrase(dev, action);
  var prima = !dev.on;
  sendToGoogle(frase).then(function(r){
    var male = r.ok && sembraRifiuto(r.risposta);
    if (r.ok && !male) { note('inviato: ' + frase); report(dev, true, r.risposta); return; }
    // Il comando non e andato: la casella torna com era, e si dice perche.
    dev.on = prima;
    var perche = male ? 'Google ha risposto: ' + r.risposta : r.errore;
    note('non riuscito: ' + perche);
    report(dev, false, perche);
  });
}

// La frase per Google usa il nome del dispositivo in Google Home. Senza
// nome, si compone con tipo e stanza, come la si direbbe a voce.
export function googlePhrase(dev, action){
  var nome = String(dev.google || '').trim();
  if (!nome) {
    var t = TYPES[dev.type] ? TYPES[dev.type].label.toLowerCase() : 'dispositivo';
    nome = t + (dev.room ? ' ' + roomName(dev.room).toLowerCase() : '');
  }
  if (dev.kind === 'intercom') return 'apri ' + nome;
  return action + ' ' + nome;
}

// Google a volte risponde bene al collegamento ma dice di non aver fatto
// niente: si riconoscono le risposte tipiche per non fingere un successo.
export function sembraRifiuto(testo){
  var t = String(testo || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return /non (ho trovato|trovo|riesco|sono riuscit|posso|e possibile|e disponibile|e raggiungibile|risponde)|mi dispiace|purtroppo|scusa|non so (come|quale)|quale (dispositivo|luce)|dispositivo non/.test(t);
}

// Gli altoparlanti non si comandano da qui: la musica sui Nest passa da
// Spotify, che e un collegamento a parte.
function viaGoogle(dev){ return dev.via === 'google' && dev.kind !== 'speaker'; }

var resultWatchers = [];
export function onSendResult(fn){ resultWatchers.push(fn); }
function report(dev, ok, testo){
  for (var i = 0; i < resultWatchers.length; i++) {
    try { resultWatchers[i](dev, ok, testo); } catch (e) {}
  }
}

// Finche il servizio non conferma il collegamento con Google Home, i
// comandi non escono dal pannello. Il pannello lo deve dire invece di
// mostrare caselle che si accendono solo sullo schermo.
var LIVE = false;

export function setLive(value){ LIVE = !!value; }
export function isLive(){ return LIVE; }

export function notConnected(device){
  if (!device) return true;
  if (needsBridge(device)) return true;
  if (LOCAL_ONLY_VIA[device.via]) return false;
  if (device.kind === 'speaker') return true;
  return !LIVE;
}

export function needsBridge(device){
  return !!(device && LOCAL_ONLY_VIA[device.via] && !bridgeConfigured());
}

export function commandLog(){ return log.slice(-6).reverse().join('\n'); }
