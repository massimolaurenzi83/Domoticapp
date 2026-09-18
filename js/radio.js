// Radio via internet.
//
// Le stazioni arrivano da Radio Browser, un archivio aperto mantenuto dalla
// comunita: nessuna registrazione, nessuna chiave, nessun costo. Contiene
// decine di migliaia di stazioni di tutto il mondo.
//
// La riproduzione avviene sul tablet stesso, non sui Nest: per mandare
// l audio sugli altoparlanti di casa servirebbe Spotify, che ha una sua
// scheda. La radio e pensata per il pannello in cucina.

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

export function play(station){
  if (!audio) {
    audio = new Audio();
    audio.preload = 'none';
    audio.addEventListener('playing', function(){ report('in onda'); });
    audio.addEventListener('waiting', function(){ report('carico...'); });
    audio.addEventListener('error', function(){ report('stazione non raggiungibile'); });
  }

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
