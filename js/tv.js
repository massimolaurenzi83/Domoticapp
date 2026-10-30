// Televisore: un LG del 2011 con un Chromecast collegato all HDMI.
//
// Regola di partenza: il televisore non si tocca. Il pannello non parla mai
// con la TV direttamente e non cambia nessuna delle sue impostazioni. Tutto
// passa dal Chromecast, che sta nella presa HDMI e si stacca quando vuoi:
// staccato quello, la TV e esattamente com era.
//
// Due strade, indipendenti fra loro:
//
//   - telecomando: frasi a Google Assistant, le stesse che diresti a un
//     Nest ("metti in pausa su TV soggiorno"), attraverso il collegamento
//     con Google Home che il pannello usa gia per le luci;
//
//   - schermo di casa: una pagina del pannello, nella cartella tv/, che
//     gira sul Chromecast e mostra ora, meteo, foto e avvisi. Il tablet le
//     manda tutto attraverso la rete di casa. Serve il numero di
//     applicazione Cast, che si ottiene una volta sola (tv/GUIDA.md).

import { settings, save, toMinutes, effectiveRole } from './config.js';
import { devices, setDevice, googlePhrase, sembraRifiuto, isLive } from './devices.js';
import { sendToGoogle } from './google.js';
import { photoList } from './photos.js';
import { loadReminders } from './reminders.js';
import { activeTimers } from './timers.js';
import { spotifyReady, spotifyState, spotifyCommand, checkSpotify } from './spotify.js';

var NS = 'urn:x-cast:casa.tv';
var SDK = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
var CHOICE_KEY = 'domapp.tv.scelta.v1';
var AUTO_OFF_KEY = 'domapp.tv.autospento.v1';

// ---------- quale televisore ----------

export function tvList(){
  return devices.filter(function(d){ return d.type === 'tv'; });
}

export function tvDevice(){
  var lista = tvList();
  if (!lista.length) return null;
  var scelto = '';
  try { scelto = localStorage.getItem(CHOICE_KEY) || ''; } catch (e) {}
  for (var i = 0; i < lista.length; i++) if (lista[i].id === scelto) return lista[i];
  return lista[0];
}

export function chooseTv(id){
  try { localStorage.setItem(CHOICE_KEY, id); } catch (e) {}
}

// Il nome del Chromecast in Google Home, come lo si direbbe a voce.
export function tvName(dev){
  var d = dev || tvDevice();
  if (!d) return 'televisore';
  // googlePhrase compone il nome anche quando il campo e vuoto.
  return googlePhrase(d, '').trim();
}

// ---------- telecomando, attraverso Google ----------
//
// Le frasi sono raccolte qui, tutte insieme, perche sono quelle da
// ritoccare se Google ne capisce meglio un altra: si prova a voce su un
// Nest, e quella che funziona si scrive qui.

var FRASI = {
  pausa:     function(n){ return 'metti in pausa su ' + n; },
  riprendi:  function(n){ return 'riprendi su ' + n; },
  stop:      function(n){ return 'interrompi su ' + n; },
  avanti:    function(n){ return 'vai avanti di 30 secondi su ' + n; },
  indietro:  function(n){ return 'torna indietro di 30 secondi su ' + n; },
  volSu:     function(n){ return 'alza il volume su ' + n; },
  volGiu:    function(n){ return 'abbassa il volume su ' + n; },
  volume:    function(n, x){ return 'imposta il volume al ' + x.volume + ' per cento su ' + n; },
  muto:      function(n){ return "disattiva l'audio su " + n; },
  audio:     function(n){ return "riattiva l'audio su " + n; },
  app:       function(n, x){ return 'apri ' + x.app + ' su ' + n; },
  guarda:    function(n, x){ return 'riproduci ' + x.cosa + ' da YouTube su ' + n; },
  guardaSu:  function(n, x){ return 'guarda ' + x.cosa + ' su ' + x.app + ' su ' + n; }
};

// Le app che il Chromecast con Google TV sa aprire.
export var APPS = ['YouTube', 'Netflix', 'Prime Video', 'RaiPlay', 'Disney+',
                   'Mediaset Infinity', 'DAZN', 'Spotify'];

// Il Chromecast rotondo non ha app sue: riceve solo quello che gli manda
// qualcun altro. Google gli sa mandare YouTube e Netflix, se Netflix e
// collegato all app Google Home; tutto il resto arriva dal telefono, con il
// tasto Trasmetti delle app.
export var GUARDA_APPS = ['YouTube', 'Netflix'];

export function googleTv(){ return settings.tvModel === 'googletv'; }

export function tvPhrase(azione, extra, dev){
  var f = FRASI[azione];
  return f ? f(tvName(dev), extra || {}) : '';
}

// Manda un comando alla TV. Risolve sempre con { ok, frase, risposta, errore }.
// Accendere e spegnere passano dalla casella del televisore, cosi la
// scheda Casa e il registro restano allineati con la scheda TV.
export function tvCommand(azione, extra){
  var dev = tvDevice();
  if (!dev) return Promise.resolve({ ok: false, errore: 'nessun televisore fra i dispositivi' });
  if (azione === 'spotify') return tvSpotify();
  if (!isLive()) return Promise.resolve({ ok: false, errore: 'Google Home non è ancora collegato' });

  if (azione === 'accendi' || azione === 'spegni') {
    setDevice(dev.id, azione === 'accendi');
    return Promise.resolve({ ok: true, frase: googlePhrase(dev, azione), risposta: '' });
  }

  var frase = tvPhrase(azione, extra, dev);
  if (!frase) return Promise.resolve({ ok: false, errore: 'comando sconosciuto' });
  return sendToGoogle(frase).then(function(r){
    if (r.ok && sembraRifiuto(r.risposta)) return { ok: false, frase: frase, errore: 'Google ha risposto: ' + r.risposta };
    return { ok: r.ok, frase: frase, risposta: r.risposta || '', errore: r.errore || '' };
  });
}

// ---------- Spotify sulla TV ----------
//
// Il Chromecast e anche un altoparlante per Spotify: la musica suona dalle
// casse della TV. Spotify pero lo fa vedere solo se e stato usato di
// recente dall app, come i Nest.

function fold(t){
  return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export function tvSpotifyDevice(){
  var dev = tvDevice();
  var lista = (spotifyState() || {}).dispositivi || [];
  if (!dev || !lista.length) return null;
  var nomi = [tvName(dev), dev.name].map(fold).filter(Boolean);
  for (var n = 0; n < nomi.length; n++) {
    for (var i = 0; i < lista.length; i++) if (fold(lista[i].nome) === nomi[n]) return lista[i];
  }
  // Per somiglianza solo con nomi lunghi: "tv" da solo si trova ovunque.
  for (var m = 0; m < nomi.length; m++) {
    if (nomi[m].length < 5) continue;
    for (var k = 0; k < lista.length; k++) {
      var s = fold(lista[k].nome);
      if (s.indexOf(nomi[m]) !== -1 || nomi[m].indexOf(s) !== -1) return lista[k];
    }
  }
  return null;
}

export function tvSpotify(){
  if (!spotifyReady()) return Promise.resolve({ ok: false, errore: 'Spotify non è ancora collegato' });
  return checkSpotify().then(function(){
    var d = tvSpotifyDevice();
    if (!d) {
      return { ok: false, errore: 'Spotify non vede il Chromecast. Basta una volta: apri Spotify sul telefono, ' +
        'tocca l’icona degli altoparlanti e scegli la TV' };
    }
    return spotifyCommand({ azione: 'play', dispositivo: d.id }).then(function(r){
      return r.ok ? { ok: true, frase: 'Spotify su ' + d.nome, risposta: '' } : { ok: false, errore: r.errore };
    });
  });
}

// ---------- spegnimento programmato ----------
//
// L orario sta nelle impostazioni, cosi si puo dare anche dal telefono e
// lo esegue il pannello di casa. E un orario assoluto: sopravvive al
// riavvio della pagina.

export function sleepAt(){ return parseInt(settings.tvSleepAt, 10) || 0; }

export function setSleep(minuti){
  settings.tvSleepAt = minuti > 0 ? Date.now() + minuti * 60000 : 0;
  save();
  try { window.dispatchEvent(new CustomEvent('casa-tocca', { detail: ['tvSleepAt'] })); } catch (e) {}
  return settings.tvSleepAt;
}

export function clearSleep(){ setSleep(0); }

var sleepWatchers = [];
export function onSleepChange(fn){ sleepWatchers.push(fn); }

function checkSleep(){
  var at = sleepAt();
  if (!at || Date.now() < at) return;
  // Se il tablet era spento all ora giusta, spegnere adesso sarebbe uno
  // scherzo: la sera dopo qualcuno sta guardando un film.
  var inRitardo = Date.now() - at > 3 * 60000;
  clearSleep();
  if (!inRitardo) tvCommand('spegni');
  for (var i = 0; i < sleepWatchers.length; i++) { try { sleepWatchers[i](); } catch (e) {} }
}

// All inizio delle ore di riposo, una volta per notte, se lo hai chiesto.
function checkAutoOff(){
  if (!settings.tvOffAtSleep || effectiveRole() !== 'pannello') return;
  var d = new Date();
  var mins = d.getHours() * 60 + d.getMinutes();
  if (mins !== toMinutes(settings.sleepStart)) return;
  var oggi = d.toDateString();
  var fatto = '';
  try { fatto = localStorage.getItem(AUTO_OFF_KEY) || ''; } catch (e) {}
  if (fatto === oggi) return;
  try { localStorage.setItem(AUTO_OFF_KEY, oggi); } catch (e) {}
  tvCommand('spegni');
}

// Da chiamare quando si arma la sentinella: si esce di casa.
export function tvOffOnArm(){
  if (settings.tvOffOnArm && tvDevice() && isLive()) tvCommand('spegni');
}

// ---------- schermo di casa sul Chromecast ----------

var sdkPromise = null;
var castReady = false;
var castError = '';
var appInUse = '';
var session = null;
var screenState = 'spento';        // spento, collegamento, acceso
var screenWatchers = [];
var feedTimer = null;
var statusTimer = null;
var sending = false;
var tvOrder = [];
var tvCursor = 0;
var lastWeather = null;
var radioOnTv = null;
var radioWatchers = [];

export function castAppId(){
  var id = String(settings.tvCastAppId || '').trim().toUpperCase();
  return /^[0-9A-F]{8}$/.test(id) ? id : '';
}

function loadSdk(){
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise(function(resolve){
    var finito = false;
    function fine(ok, perche){
      if (finito) return;
      finito = true;
      castError = ok ? '' : perche;
      resolve(ok);
    }
    window.__onGCastApiAvailable = function(ok){
      fine(!!ok && !!(window.cast && window.cast.framework), 'questo browser non sa trasmettere al Chromecast');
    };
    var s = document.createElement('script');
    s.src = SDK;
    s.onerror = function(){ fine(false, 'non riesco a caricare il programma di Google per la trasmissione'); };
    document.head.appendChild(s);
    // Su iPhone e su alcuni browser la risposta non arriva mai.
    setTimeout(function(){ fine(false, 'questo browser non sa trasmettere al Chromecast'); }, 15000);
  });
  return sdkPromise;
}

function setScreenState(s){
  screenState = s;
  for (var i = 0; i < screenWatchers.length; i++) { try { screenWatchers[i](s); } catch (e) {} }
}

export function onScreenChange(fn){ screenWatchers.push(fn); }

export function screenInfo(){
  return { stato: screenState, pronto: castReady, errore: castError, appId: castAppId(),
           daRicaricare: !!(appInUse && appInUse !== castAppId()) };
}

// Prepara la trasmissione. Non mostra niente: serve solo a riprendere lo
// schermo di casa se il pannello si e ricaricato mentre era acceso.
export function prepareCast(){
  var id = castAppId();
  if (!id) return Promise.resolve(false);
  if (castReady) return Promise.resolve(true);
  return loadSdk().then(function(ok){
    if (!ok || castReady) return castReady;
    try {
      var ctx = cast.framework.CastContext.getInstance();
      ctx.setOptions({
        receiverApplicationId: id,
        autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
      });
      appInUse = id;
      ctx.addEventListener(cast.framework.CastContextEventType.SESSION_STATE_CHANGED, onSession);
      castReady = true;
      // Una sessione ripresa dopo il ricaricamento della pagina.
      var s = ctx.getCurrentSession();
      if (s) attach(s);
    } catch (e) {
      castError = 'trasmissione non disponibile: ' + (e && e.message ? e.message : 'errore sconosciuto');
    }
    return castReady;
  });
}

function onSession(ev){
  var S = cast.framework.SessionState;
  if (ev.sessionState === S.SESSION_STARTED || ev.sessionState === S.SESSION_RESUMED) attach(ev.session);
  if (ev.sessionState === S.SESSION_STARTING) setScreenState('collegamento');
  if (ev.sessionState === S.SESSION_ENDED || ev.sessionState === S.SESSION_START_FAILED) detach();
}

function attach(s){
  session = s;
  try {
    s.addMessageListener(NS, function(ns, testo){
      var m = null;
      try { m = JSON.parse(testo); } catch (e) { return; }
      if (m && m.tipo === 'radio-stato') {
        for (var i = 0; i < radioWatchers.length; i++) { try { radioWatchers[i](m.stato, radioOnTv); } catch (e) {} }
      }
    });
  } catch (e) {}
  setScreenState('acceso');
  startFeeding();
}

function detach(){
  session = null;
  radioOnTv = null;
  if (!previewOn()) stopFeeding();
  setScreenState('spento');
}

function startFeeding(){
  sendConfig();
  sendStatus();
  tvOrder = [];
  stopFeeding();
  feedPhoto();
  feedTimer = setInterval(feedPhoto, photoSeconds() * 1000);
  statusTimer = setInterval(sendStatus, 30000);
}

function stopFeeding(){
  if (feedTimer) { clearInterval(feedTimer); feedTimer = null; }
  if (statusTimer) { clearInterval(statusTimer); statusTimer = null; }
}

// ---------- anteprima sul tablet ----------
//
// La stessa pagina della TV, dentro la scheda, riceve gli stessi messaggi
// del Chromecast: foto vere, meteo vero, avvisi veri. Si vede il risultato
// anche prima di avere il numero di applicazione Cast.

var previewFrame = null;

function previewOn(){
  if (previewFrame && !previewFrame.isConnected) previewFrame = null;
  return !!previewFrame;
}

function live(){ return !!session || previewOn(); }

export function attachPreview(frame){
  previewFrame = frame;
  startFeeding();
}

export function detachPreview(){
  previewFrame = null;
  if (!session) stopFeeding();
}

// Va chiamata dentro un tocco: Chrome apre l elenco dei Chromecast solo
// se la richiesta parte da una persona.
export function startScreen(){
  if (!castAppId()) return Promise.resolve('Manca il numero di applicazione Cast: si ottiene una volta sola, vedi tv/GUIDA.md.');
  return prepareCast().then(function(ok){
    if (!ok) return 'Non posso trasmettere: ' + (castError || 'motivo sconosciuto') + '.';
    if (appInUse !== castAppId()) return 'Il numero di applicazione è cambiato: ricarica la pagina e riprova.';
    return cast.framework.CastContext.getInstance().requestSession().then(function(err){
      if (!err) return '';
      if (err === 'cancel') return '';
      if (err === 'receiver_unavailable') return 'Il Chromecast non risponde: controlla che il tablet sia sul Wi-Fi di casa.';
      return 'Il Chromecast non ha aperto lo schermo di casa: ' + err + '.';
    }, function(err){
      if (err === 'cancel') return '';
      return 'Il Chromecast non ha aperto lo schermo di casa: ' + err + '.';
    });
  });
}

// Chiude lo schermo di casa: il Chromecast torna alla sua schermata e la
// TV resta com era.
export function stopScreen(){
  if (!castReady) return;
  try { cast.framework.CastContext.getInstance().endCurrentSession(true); } catch (e) {}
  detach();
}

export function screenOn(){ return screenState === 'acceso' && !!session; }

function send(msg){
  var esiti = [];
  if (previewOn()) {
    try {
      previewFrame.contentWindow.postMessage({ casaTv: msg }, location.origin);
      esiti.push(Promise.resolve(true));
    } catch (e) {}
  }
  if (session) {
    try {
      esiti.push(Promise.resolve(session.sendMessage(NS, msg)).then(function(){ return true; }, function(){ return false; }));
    } catch (e) { esiti.push(Promise.resolve(false)); }
  }
  if (!esiti.length) return Promise.resolve(false);
  return Promise.all(esiti).then(function(r){ return r.indexOf(true) !== -1; });
}

function photoSeconds(){
  return Math.max(10, parseInt(settings.photoSeconds, 10) || 25);
}

function sendConfig(){
  return send({
    tipo: 'impostazioni',
    luogo: settings.placeName || '',
    fuso: new Date().getTimezoneOffset(),
    riposoDa: settings.sleepStart,
    riposoA: settings.sleepEnd,
    secondiFoto: photoSeconds(),
    oreMassime: Math.max(1, parseInt(settings.tvScreenHours, 10) || 4)
  });
}

// Le impostazioni cambiate dal pannello arrivano subito anche alla TV.
export function tvSettingsChanged(){
  if (!live()) return;
  sendConfig();
  if (feedTimer) { clearInterval(feedTimer); feedTimer = setInterval(feedPhoto, photoSeconds() * 1000); }
}

export function tvWeather(w){
  lastWeather = w ? { temp: w.temp, desc: w.desc, min: w.min, max: w.max } : null;
  if (live()) sendStatus();
}

function sendStatus(){
  var ora = Date.now();
  var fra24 = ora + 24 * 3600000;
  var prossimi = loadReminders()
    .filter(function(r){ return r.when && r.when > ora && r.when < fra24; })
    .sort(function(a, b){ return a.when - b.when; })
    .slice(0, 3)
    .map(function(r){ return { testo: r.text, quando: r.when }; });
  var timer = activeTimers().map(function(t){
    return { nome: t.name || 'timer', restano: Math.max(0, Math.round((t.endsAt - ora) / 1000)) };
  });
  return send({ tipo: 'stato', meteo: lastWeather, promemoria: prossimi, timer: timer, ora: ora });
}

// Un avviso a tutto schermo sulla TV: messaggi, timer, promemoria.
export function tvNotify(titolo, testo, secondi){
  if (!live()) return;
  send({ tipo: 'avviso', titolo: titolo || '', testo: testo || '', secondi: secondi || 20 });
  sendStatus();
}

// ---------- radio sulla TV ----------

export function tvPlayRadio(station){
  if (!screenOn() || !station) return Promise.resolve(false);
  radioOnTv = station;
  return send({ tipo: 'radio', url: station.url, nome: station.name });
}

export function tvStopRadio(){
  radioOnTv = null;
  return send({ tipo: 'radio-ferma' });
}

export function tvRadio(){ return radioOnTv; }

export function onTvRadio(fn){ radioWatchers.push(fn); }

// ---------- foto ----------
//
// Le foto stanno dentro il tablet e il Chromecast non puo andarle a
// prendere: il tablet le prepara alla misura della TV e gliele manda a
// pezzi, perche un singolo messaggio non puo superare i 64 kilobyte.

var CHUNK = 40000;

function nextTvPhoto(){
  var lista = photoList();
  if (!lista.length) return null;
  if (tvCursor >= tvOrder.length || tvOrder.length !== lista.length) {
    tvOrder = [];
    for (var i = 0; i < lista.length; i++) tvOrder.push(i);
    for (var j = tvOrder.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = tvOrder[j]; tvOrder[j] = tvOrder[k]; tvOrder[k] = t;
    }
    tvCursor = 0;
  }
  return lista[tvOrder[tvCursor++]];
}

// La foto intera al centro, e dietro la stessa foto ingrandita e sfocata
// al posto delle bande nere: le foto verticali non lasciano mezza TV vuota.
function forTv(src){
  return new Promise(function(resolve){
    var img = new Image();
    img.onload = function(){
      try {
        var W = 1280, H = 720;
        var c = document.createElement('canvas');
        c.width = W; c.height = H;
        var g = c.getContext('2d');
        g.fillStyle = '#000';
        g.fillRect(0, 0, W, H);
        var w = img.naturalWidth, h = img.naturalHeight;
        var copri = Math.max(W / w, H / h);
        var entra = Math.min(W / w, H / h);
        if (Math.abs(copri - entra) > 0.01 && 'filter' in g) {
          g.save();
          g.filter = 'blur(28px)';
          g.globalAlpha = 0.45;
          g.drawImage(img, (W - w * copri) / 2, (H - h * copri) / 2, w * copri, h * copri);
          g.restore();
        }
        g.drawImage(img, (W - w * entra) / 2, (H - h * entra) / 2, w * entra, h * entra);
        resolve(c.toDataURL('image/jpeg', 0.8));
      } catch (e) { resolve(null); }
    };
    img.onerror = function(){ resolve(null); };
    img.src = src;
  });
}

function feedPhoto(){
  if (!live()) { stopFeeding(); return; }
  if (sending) return;
  var p = nextTvPhoto();
  if (!p) return;
  sending = true;
  forTv(p.src).then(function(dati){
    if (!dati || !live()) return false;
    var id = 'f' + Date.now().toString(36);
    var parti = Math.ceil(dati.length / CHUNK);
    var i = 0;
    function prossima(){
      if (i >= parti) return true;
      var pezzo = dati.slice(i * CHUNK, (i + 1) * CHUNK);
      var msg = { tipo: 'foto', id: id, parte: i, parti: parti, dati: pezzo };
      if (i === parti - 1) msg.didascalia = p.caption || '';
      i++;
      return send(msg).then(function(ok){ return ok ? prossima() : false; });
    }
    return prossima();
  }).then(function(){ sending = false; }, function(){ sending = false; });
}

// ---------- avvio ----------

export function startTv(){
  setInterval(function(){ checkSleep(); checkAutoOff(); }, 20000);
  checkSleep();
  // Se lo schermo di casa era acceso prima di un ricaricamento, si riprende.
  if (castAppId()) prepareCast();
}

export function tvDiagnostics(){
  var dev = tvDevice();
  var parti = [];
  parti.push(dev ? 'comandata come "' + tvName(dev) + '" in Google Home' : 'nessun televisore fra i dispositivi');
  if (!castAppId()) parti.push('schermo di casa da attivare');
  else parti.push('schermo di casa ' + (screenOn() ? 'acceso' : (castReady ? 'pronto' : (castError || 'in preparazione'))));
  var at = sleepAt();
  if (at) parti.push('spegnimento alle ' + new Date(at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }));
  return 'Televisore: ' + parti.join(', ');
}
