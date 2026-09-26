// Gestione dello schermo: luminosita simulata, ore di riposo, blocco di spegnimento.
//
// Nota importante sui limiti del browser:
// una pagina web non puo regolare la retroilluminazione ne riaccendere
// uno schermo spento. Quindi la luminosita si ottiene con un velo nero
// sovrapposto, e il riposo notturno porta lo schermo a nero profondo
// lasciandolo pero reattivo al tocco e alla fotocamera.

import { settings, isDaytime, isSleepHours } from './config.js';

var veil = null;
var lock = null;
var lockWanted = true;
var current = -1;

export function initScreen(){
  veil = document.createElement('div');
  veil.id = 'veil';
  veil.style.cssText =
    'position:absolute;top:0;left:0;right:0;bottom:0;background:#000;' +
    'opacity:0;pointer-events:none;z-index:15;transition:opacity 1.2s ease;';
  document.body.appendChild(veil);

  requestLock();
  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState === 'visible' && lockWanted) requestLock();
  });
}

// livello: percentuale di luce voluta, da 3 a 100
export function setBrightness(level){
  var pct = Math.max(3, Math.min(100, Math.round(level)));
  if (pct === current) return;
  current = pct;
  if (veil) veil.style.opacity = String((100 - pct) / 100);
}

// Calcola la luminosita giusta per l ora corrente e lo stato di veglia.
// awake e true quando qualcuno ha toccato o e stato rilevato un passaggio.
// inUse e true quando qualcuno sta usando il pannello: plancia aperta,
// impostazioni o un tocco recente. Allora si vede come di giorno, anche di
// notte e nelle ore di riposo: prima il velo restava e non si leggeva
// niente.
export function applyScheduledBrightness(awake, inUse){
  if (inUse) {
    wantLock(true);
    setBrightness(Math.max(settings.dayBrightness, 60));
    return 'in uso';
  }

  var sleeping = isSleepHours() && !awake;

  if (sleeping) {
    setBrightness(3);
    wantLock(!settings.releaseWakeLock);
    return 'riposo';
  }

  wantLock(true);
  var day = isDaytime();
  var target = day ? settings.dayBrightness : settings.nightBrightness;
  if (awake && !day) target = Math.max(target, 55);
  setBrightness(target);
  return day ? 'giorno' : 'notte';
}

function wantLock(want){
  lockWanted = want;
  if (want) requestLock();
  else releaseLock();
}

function requestLock(){
  if (lock || !navigator.wakeLock || !lockWanted) return;
  navigator.wakeLock.request('screen').then(function(l){
    lock = l;
    l.addEventListener('release', function(){ lock = null; });
  }, function(){ lock = null; });
}

function releaseLock(){
  if (!lock) return;
  try { lock.release(); } catch (e) {}
  lock = null;
}

export function screenDiagnostics(){
  return 'Blocco schermo: ' + (navigator.wakeLock ? (lock ? 'attivo' : 'disponibile, non attivo') : 'non supportato');
}
