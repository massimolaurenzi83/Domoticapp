// Fotocamera frontale: presenza di tutti i giorni e sentinella.
//
// Un unico flusso video serve due scopi. Nell uso quotidiano riconosce che
// qualcuno si avvicina e sveglia la plancia. Quando la sentinella e armata
// lo stesso movimento fa partire una raffica di scatti conservati dentro il
// tablet e una notifica verso il telefono.
//
// Le immagini non escono mai dal tablet, tranne una miniatura allegata
// alla notifica di allarme.

import { settings } from './config.js';
import { camOn } from './privacy.js';
import { toGrey, compare, Streak, W, H } from './motion.js';
import { saveShot, pruneOld, pruneForSpace, keepStorage } from './sentinel.js';

var PERIOD = 1500;
var SHOT_W = 480, SHOT_H = 360;

var video = null, small = null, sctx = null, shot = null, shctx = null;
var previous = null, stream = null, timer = null;
var streak = null;
var onMotion = null, onAlarm = null;

// Lo stato armato sta su disco, non solo in memoria: un riavvio del
// tablet mentre sei in viaggio non deve spegnere la sorveglianza in
// silenzio.
var ARMED_KEY = 'domapp.sentinel.armed.v1';

function readArmed(){
  try { return JSON.parse(localStorage.getItem(ARMED_KEY) || 'null'); } catch (e) { return null; }
}

function writeArmed(value){
  try {
    if (value) localStorage.setItem(ARMED_KEY, JSON.stringify(value));
    else localStorage.removeItem(ARMED_KEY);
  } catch (e) {}
}

var armed = !!readArmed();
var burstUntil = 0;
var currentEvent = null;
var lastReading = null;
var status = 'non avviato';

export function startPresence(callbacks){
  var cb = callbacks || {};
  onMotion = cb.onMotion;
  onAlarm = cb.onAlarm;

  if (!camOn()) { status = 'fotocamera spenta dall interruttore'; return Promise.resolve(false); }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    status = 'fotocamera non disponibile in questo browser';
    return Promise.resolve(false);
  }
  if (!window.isSecureContext) { status = 'serve HTTPS per la fotocamera'; return Promise.resolve(false); }
  if (stream) return Promise.resolve(true);

  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false
  }).then(function(s){
    stream = s;
    video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.muted = true;
    video.srcObject = s;
    return video.play();
  }).then(function(){
    small = document.createElement('canvas');
    small.width = W; small.height = H;
    sctx = small.getContext('2d');

    shot = document.createElement('canvas');
    shot.width = SHOT_W; shot.height = SHOT_H;
    shctx = shot.getContext('2d');

    previous = null;
    streak = new Streak(2);
    timer = setInterval(sample, PERIOD);
    status = armed ? 'sentinella armata' : 'attiva';
    return true;
  }).catch(function(err){
    status = 'permesso negato o fotocamera occupata: ' + (err && err.name ? err.name : 'errore');
    return false;
  });
}

export function stopPresence(){
  if (timer) { clearInterval(timer); timer = null; }
  if (stream) {
    var t = stream.getTracks();
    for (var i = 0; i < t.length; i++) t[i].stop();
    stream = null;
  }
  previous = null;
  armed = false;
  status = 'ferma';
}

// ---------- sentinella ----------

// origine dice chi ha deciso: 'locale' se qualcuno ha toccato questo
// pannello, 'remoto' se la decisione arriva dall altro dispositivo.
export function armSentinel(origine){
  armed = true;
  writeArmed({ at: Date.now(), from: origine || 'locale' });
  writeDecision(true, origine || 'locale');
  keepStorage();
  pruneOld();
  status = 'sentinella armata';
}

// Vero quando la sentinella era armata prima di un riavvio. Serve a dirlo
// a chi guarda lo schermo, invece di lasciarlo credere che sia tutto come
// l ha lasciato.
// L ultima decisione presa, con il suo momento. Serve al confronto con
// quella che arriva dall altro dispositivo.
var DECISION_KEY = 'domapp.sentinel.decision.v1';

function writeDecision(value, from, serverAt){
  try {
    localStorage.setItem(DECISION_KEY, JSON.stringify({
      armed: !!value,
      at: Date.now(),
      from: from || 'locale',
      serverAt: serverAt || null
    }));
  } catch (e) {}
}

export function lastDecision(){
  try { return JSON.parse(localStorage.getItem(DECISION_KEY) || 'null'); } catch (e) { return null; }
}

// Applica una decisione arrivata dall altro dispositivo, ma solo se e piu
// recente della nostra. Restituisce true se qualcosa e cambiato.
export function applyRemoteDecision(remote){
  if (!remote || typeof remote.armed !== 'boolean') return false;

  var mine = lastDecision();

  // Se la decisione che arriva e la nostra stessa, tornata indietro dal
  // servizio, non c e niente da fare.
  if (mine && mine.at === remote.at && mine.armed === remote.armed) return false;

  // Quando il servizio ha timbrato entrambe, il confronto usa il suo
  // orologio. Altrimenti ripiega su quello dei dispositivi.
  if (mine && mine.serverAt && remote.serverAt) {
    if (mine.serverAt >= remote.serverAt) return false;
  } else if (mine && (mine.at || 0) > (remote.at || 0)) {
    return false;
  }
  if (!!remote.armed === armed) {
    // Stessa posizione, ma la marcatura del servizio va conservata.
    writeDecision(remote.armed, remote.from || 'remoto', remote.serverAt);
    return false;
  }

  if (remote.armed) armSentinel('remoto');
  else disarmSentinel('remoto');
  writeDecision(remote.armed, remote.from || 'remoto', remote.serverAt);
  return true;
}

export function armedSince(){
  var saved = readArmed();
  return saved ? saved.at : null;
}

export function disarmSentinel(origine){
  armed = false;
  writeArmed(null);
  writeDecision(false, origine || 'locale');
  burstUntil = 0;
  currentEvent = null;
  status = stream ? 'attiva' : 'ferma';
}

export function isArmed(){ return armed; }

// ---------- ciclo ----------

function sample(){
  if (!camOn() || !video || video.readyState < 2) return;

  sctx.drawImage(video, 0, 0, W, H);
  var current = toGrey(sctx.getImageData(0, 0, W, H).data);

  if (previous) {
    var r = compare(current, previous, sensitivityToThreshold());
    lastReading = r;

    // Un cambiamento diffuso ovunque e luce, non una persona.
    var real = !r.global && r.cells >= minCells();
    var confirmed = streak.feed(real);

    if (confirmed) {
      if (onMotion) onMotion(r.strength);
      if (armed) fireAlarm(r);
    }
  }

  previous = current;

  if (armed && Date.now() < burstUntil) captureShot();
}

// La sensibilita dell utente va da 2 a 60. Un valore basso deve rendere
// piu sensibile il rilevamento, quindi abbassa la soglia per pixel.
function sensitivityToThreshold(){
  var s = parseInt(settings.presenceSensitivity, 10);
  if (isNaN(s)) s = 14;
  return Math.max(8, Math.min(60, Math.round(s * 1.6)));
}

function minCells(){
  var s = parseInt(settings.presenceSensitivity, 10);
  if (isNaN(s)) s = 14;
  return s < 10 ? 1 : (s < 25 ? 2 : 3);
}

function fireAlarm(reading){
  var now = Date.now();
  var isNew = !currentEvent || now > burstUntil + 15000;

  if (isNew) {
    currentEvent = 'ev' + now;
    pruneOld();
    pruneForSpace();
    captureShot(true, reading.strength);
  }

  burstUntil = now + Math.max(5, parseInt(settings.sentinelBurstSeconds, 10) || 20) * 1000;
}

function captureShot(notify, strength){
  if (!shctx || !video) return;
  shctx.drawImage(video, 0, 0, SHOT_W, SHOT_H);
  var ev = currentEvent;
  var force = strength || (lastReading ? lastReading.strength : 0);

  if (!shot.toBlob) return;
  shot.toBlob(function(blob){
    if (!blob) return;
    saveShot(blob, ev, force);
    if (notify && onAlarm) onAlarm({ event: ev, at: Date.now(), strength: force, blob: blob });
  }, 'image/jpeg', 0.72);
}

export function presenceDiagnostics(){
  var line = 'Fotocamera: ' + status;
  if (lastReading) {
    line += ', celle mosse ' + lastReading.cells +
            (lastReading.global ? ', variazione diffusa quindi ignorata' : '');
  }
  return line;
}
