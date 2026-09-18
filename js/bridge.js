// Ponte di casa, predisposto ma non obbligatorio.
//
// Alcuni dispositivi parlano soltanto dentro la rete di casa e nessuna
// pagina web puo raggiungerli: il Broadlink RM4C mini, la presa D-Link e
// le telecamere. Servono a loro un piccolo computer sempre acceso, per
// esempio un Raspberry Pi, che faccia da tramite.
//
// Finche il ponte non esiste, tutto il resto funziona lo stesso e i
// comandi diretti a quei dispositivi restano simulati. Quando arrivera,
// bastera scrivere il suo indirizzo nelle impostazioni.
//
// Il ponte non viene chiamato direttamente dal browser: e lui ad aprire
// una connessione verso il servizio. Cosi non serve aprire porte sul
// router e non ci sono problemi di connessione protetta.

import { settings } from './config.js';

var reachable = null;
var lastCheck = 0;
var lastError = '';

export function bridgeConfigured(){
  return !!String(settings.bridgeUrl || '').trim();
}

function base(){
  return String(settings.bridgeUrl || '').replace(/\/+$/, '');
}

function headers(){
  return {
    'Content-Type': 'application/json',
    'X-Casa-Token': settings.syncToken || ''
  };
}

// Verifica se il ponte risponde, non piu di una volta al minuto.
export function checkBridge(){
  if (!bridgeConfigured()) {
    reachable = false;
    lastError = 'nessun indirizzo impostato';
    return Promise.resolve(false);
  }
  if (Date.now() - lastCheck < 60000 && reachable !== null) {
    return Promise.resolve(reachable);
  }
  lastCheck = Date.now();

  return fetch(base() + '/health', { headers: headers(), cache: 'no-store' })
    .then(function(r){
      reachable = r.ok;
      lastError = r.ok ? '' : 'risposta ' + r.status;
      return reachable;
    })
    .catch(function(e){
      reachable = false;
      lastError = e.message;
      return false;
    });
}

// Invia un comando a un dispositivo che vive solo in rete locale.
// Restituisce true se il ponte lo ha preso in carico.
export function sendViaBridge(kind, id, action, extra){
  if (!bridgeConfigured()) return Promise.resolve(false);

  return fetch(base() + '/command', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      kind: kind,
      device: id,
      action: action,
      extra: extra || null
    })
  }).then(function(r){ return r.ok; })
    .catch(function(){ return false; });
}

// Indirizzo da cui il browser puo guardare una telecamera, una volta che
// il ponte l ha tradotta in un formato mostrabile.
export function cameraStreamUrl(streamKey){
  if (!bridgeConfigured()) return null;
  return base() + '/stream/' + encodeURIComponent(streamKey);
}

export function bridgeDiagnostics(){
  if (!bridgeConfigured()) {
    return 'Ponte: non previsto. Broadlink, presa D-Link e telecamere fisse restano fuori.';
  }
  if (reachable === null) return 'Ponte: non ancora verificato.';
  return 'Ponte: ' + (reachable ? 'raggiungibile' : 'non risponde, ' + lastError);
}
