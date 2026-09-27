// Radio via internet.
//
// Le stazioni arrivano da Radio Browser, un archivio aperto mantenuto dalla
// comunita: nessuna registrazione, nessuna chiave, nessun costo. Contiene
// decine di migliaia di stazioni di tutto il mondo.
//
// La riproduzione avviene sul tablet. Con Chrome su Android si puo anche
// trasmettere a un Nest, come fa YouTube: Chrome mostra l elenco degli
// altoparlanti Google di casa e la radio passa li.

var BASES = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info'
];

var FAV_KEY = 'domapp.radio.fav.v1';
var LAST_KEY = 'domapp.radio.last.v1';

var audio = null;
var current = null;
var onState = null;

// Se un archivio non risponde si passa al successivo, invece di arrendersi.
function tryBases(path, index){
  var i = index || 0;
  if (i >= BASES.length) return Promise.reject(new Error('archivio non raggiungibile'));

  return fetch(BASES[i] + path, { cache: 'no-store' })
    .then(function(r){
      if (!r.ok) throw new Error('stato ' + r.status);
      return r.json();
    })
    .catch(function(){ return tryBases(path, i + 1); });
}

export function searchStations(query, limit){
  var n = limit || 30;
  var path = '/json/stations/search?limit=' + n +
             '&hidebroken=true&order=clickcount&reverse=true' +
             '&name=' + encodeURIComponent(query || '');
  return tryBases(path).then(clean);
}

// Le piu ascoltate di un paese, per chi non sa cosa cercare.
export function topStations(countryCode, limit){
  var path = '/json/stations/search?limit=' + (limit || 30) +
             '&hidebroken=true&order=clickcount&reverse=true' +
             '&countrycode=' + encodeURIComponent(countryCode || 'IT');
  return tryBases(path).then(clean);
}

function clean(list){
  var out = [];
  for (var i = 0; i < (list || []).length; i++) {
    var s = list[i];
    var url = s.url_resolved || s.url;
    if (!url) continue;
    // Uno stream in chiaro non parte da una pagina protetta: va scartato
    // subito invece di far sembrare rotta la stazione.
    if (url.indexOf('https://') !== 0) continue;

    out.push({
      id: s.stationuuid,
      name: s.name ? s.name.trim() : 'senza nome',
      url: url,
      country: s.country || '',
      tags: (s.tags || '').split(',').slice(0, 3).join(', '),
      bitrate: s.bitrate || 0,
      icon: s.favicon && s.favicon.indexOf('https://') === 0 ? s.favicon : ''
    });
  }
  return out;
}

// ---------- riproduzione ----------

// L elemento audio sta nella pagina: Chrome trasmette ai Nest solo
// quello che fa parte della pagina.
function ensureAudio(){
  if (audio) return audio;
  audio = document.createElement('audio');
  audio.preload = 'none';
  audio.style.display = 'none';
  document.body.appendChild(audio);
  audio.addEventListener('playing', function(){ report(castState === 'connected' ? 'in onda sul Nest' : 'in onda'); });
  audio.addEventListener('waiting', function(){ report('carico...'); });
  audio.addEventListener('error', function(){ report('stazione non raggiungibile'); });
  watchCast();
  return audio;
}

export function play(station){
  ensureAudio();

  current = station;
  try { localStorage.setItem(LAST_KEY, JSON.stringify(station)); } catch (e) {}

  audio.src = station.url;
  report('carico...');
  var p = audio.play();
  if (p && p.catch) {
    p.catch(function(){ report('tocca di nuovo per avviare'); });
  }
}

export function stop(){
  if (audio) { audio.pause(); audio.src = ''; }
  current = null;
  report('ferma');
}

export function playing(){ return current; }

export function setVolume(v){
  if (audio) audio.volume = Math.max(0, Math.min(1, v));
}

export function onRadioState(fn){ onState = fn; }

// ---------- trasmissione a un Nest ----------

var castState = 'disconnected';     // disconnected, connecting, connected
var castAvailable = null;           // null = non si sa, true, false
var castWatchers = [];

function castSupported(){
  return !!(audio && audio.remote && typeof audio.remote.prompt === 'function');
}

function notifyCast(){
  for (var i = 0; i < castWatchers.length; i++) {
    try { castWatchers[i](castInfo()); } catch (e) {}
  }
}

function watchCast(){
  if (!castSupported()) return;
  var r = audio.remote;
  castState = r.state || 'disconnected';
  ['connecting', 'connect', 'disconnect'].forEach(function(ev){
    r.addEventListener(ev, function(){
      castState = r.state;
      if (castState === 'connected' && current) report('in onda sul Nest');
      if (castState === 'disconnected' && current) report('in onda sul tablet');
      notifyCast();
    });
  });
  // Alcuni tablet non sanno tenere d occhio gli altoparlanti: allora il
  // pulsante resta e si prova quando lo tocchi.
  try {
    r.watchAvailability(function(ok){ castAvailable = ok; notifyCast(); })
      .catch(function(){ castAvailable = null; notifyCast(); });
  } catch (e) { castAvailable = null; }
}

// Cosa sa il pannello della trasmissione, per disegnare il pulsante.
export function castInfo(){
  ensureAudio();
  return { supported: castSupported(), available: castAvailable, state: castState };
}

export function onCastChange(fn){ castWatchers.push(fn); }

// Apre l elenco dei Nest di Chrome. Va chiamata dentro un tocco.
export function castToNest(){
  ensureAudio();
  if (!castSupported()) return Promise.resolve('Questo browser non sa trasmettere ai Nest.');
  if (!current) return Promise.resolve('Prima scegli una stazione.');
  return audio.remote.prompt().then(function(){ return ''; }, function(e){
    var n = e && e.name;
    if (n === 'NotFoundError') return 'Chrome non trova Nest sulla rete: controlla che il tablet sia sul Wi-Fi di casa.';
    if (n === 'NotAllowedError' || n === 'AbortError') return '';
    if (n === 'NotSupportedError') return 'Questo tablet non permette di trasmettere questa stazione.';
    return 'Non riesco a trasmettere: ' + (e && e.message ? e.message : 'errore sconosciuto') + '.';
  });
}

function report(state){
  if (onState) onState(state, current);
}

export function lastStation(){
  try { return JSON.parse(localStorage.getItem(LAST_KEY) || 'null'); } catch (e) { return null; }
}

// ---------- preferite ----------

export function favourites(){
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch (e) { return []; }
}

export function isFavourite(id){
  return favourites().some(function(f){ return f.id === id; });
}

export function toggleFavourite(station){
  var list = favourites();
  var at = -1;
  for (var i = 0; i < list.length; i++) if (list[i].id === station.id) at = i;

  if (at === -1) list.push(station);
  else list.splice(at, 1);

  try { localStorage.setItem(FAV_KEY, JSON.stringify(list)); } catch (e) {}
  return at === -1;
}
