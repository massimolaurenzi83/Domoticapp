import { settings } from './config.js';
import { roomName } from './devices.js';

// Spotify, attraverso il servizio di casa.
//
// Il pannello non parla mai direttamente con Spotify: chiede al servizio,
// che ha il permesso. Cosi funziona uguale dal tablet e dal telefono fuori
// casa, e il permesso non passa dai dispositivi.

var stato = null;          // ultimo stato letto: cosa suona, dove, altoparlanti
var elenco = null;         // playlist dell utente
var collegato = false;
var ultimoErrore = '';

function base(){ return String(settings.syncUrl || '').replace(/\/+$/, ''); }
function intestazioni(json){
  var h = { 'X-Casa-Token': settings.syncToken };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

export function spotifyReady(){ return collegato; }
export function spotifyState(){ return stato; }
export function spotifyPlaylists(){ return elenco || []; }

export function spotifyStatus(){
  if (!settings.syncUrl || !settings.syncToken) return 'servizio di collegamento non configurato';
  if (!collegato) return 'non ancora collegato' + (ultimoErrore ? ', ' + ultimoErrore : '');
  return 'collegato' + (ultimoErrore ? ', ultimo comando: ' + ultimoErrore : '');
}

// Legge dal servizio cosa suona e quali altoparlanti vede Spotify.
export function checkSpotify(){
  if (!settings.syncUrl || !settings.syncToken) { collegato = false; return Promise.resolve(null); }
  return fetch(base() + '/spotify/stato', { headers: intestazioni(false), cache: 'no-store' })
    .then(function(r){
      return r.json().catch(function(){ return null; }).then(function(j){
        if (r.status === 401 || r.status === 429) return stato;
        if (!j) return stato;
        if (j.collegato === false) { collegato = false; stato = null; return null; }
        if (r.ok) { collegato = true; stato = j; ultimoErrore = ''; return j; }
        // Collegato, ma Spotify ha dato un errore: lo si tiene per dirlo.
        collegato = r.status !== 503;
        ultimoErrore = j.auth ? 'permesso Spotify da rinnovare dal computer' : (j.error || 'errore ' + r.status);
        return stato;
      });
    })
    .catch(function(){ return stato; });
}

export function loadPlaylists(){
  if (!collegato) return Promise.resolve([]);
  return fetch(base() + '/spotify/playlist', { headers: intestazioni(false) })
    .then(function(r){ return r.json(); })
    .then(function(j){ if (j && j.ok) elenco = j.playlist || []; return spotifyPlaylists(); })
    .catch(function(){ return spotifyPlaylists(); });
}

// Manda un comando. Risolve sempre con { ok, errore }.
export function spotifyCommand(c){
  if (!collegato) return Promise.resolve({ ok: false, errore: 'Spotify non è ancora collegato' });
  return fetch(base() + '/spotify/comando', {
    method: 'POST', headers: intestazioni(true), body: JSON.stringify(c)
  }).then(function(r){
    return r.json().catch(function(){ return {}; }).then(function(j){
      if (r.ok && j.ok) { ultimoErrore = ''; return { ok: true }; }
      ultimoErrore = j.auth ? 'permesso Spotify da rinnovare dal computer' : (j.error || 'errore ' + r.status);
      return { ok: false, errore: ultimoErrore };
    });
  }).catch(function(){
    ultimoErrore = 'servizio non raggiungibile';
    return { ok: false, errore: ultimoErrore };
  });
}

// ---------- corrispondenza fra altoparlanti del pannello e di Spotify ----------

function fold(t){
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

// Trova l altoparlante Spotify che corrisponde a un altoparlante del
// pannello: prima per il nome in Google Home, poi per la stanza. Spotify
// chiama i Nest con il nome che hanno in Google Home.
export function matchDevice(dev){
  var lista = stato && stato.dispositivi ? stato.dispositivi : [];
  if (!dev || !lista.length) return null;
  var nomi = [dev.google, roomName(dev.room), dev.name].map(fold).filter(Boolean);
  for (var n = 0; n < nomi.length; n++) {
    for (var i = 0; i < lista.length; i++) {
      var s = fold(lista[i].nome);
      if (s === nomi[n]) return lista[i];
    }
  }
  // Il confronto per somiglianza usa solo nome in Google Home e stanza: il
  // nome breve, come "Nest", e uguale per tutti e sceglierebbe a caso.
  var precisi = [dev.google, roomName(dev.room)].map(fold).filter(Boolean);
  for (var m = 0; m < precisi.length; m++) {
    for (var k = 0; k < lista.length; k++) {
      var t = fold(lista[k].nome);
      if (precisi[m].length > 2 && (t.indexOf(precisi[m]) !== -1 || precisi[m].indexOf(t) !== -1)) return lista[k];
    }
  }
  return null;
}

// Una playlist per nome, anche detta a voce in modo approssimato.
export function findPlaylist(testo){
  var t = fold(testo);
  var lista = spotifyPlaylists().slice().sort(function(a, b){ return b.nome.length - a.nome.length; });
  for (var i = 0; i < lista.length; i++) {
    var n = fold(lista[i].nome);
    if (n && t.indexOf(n) !== -1) return lista[i];
  }
  return null;
}
