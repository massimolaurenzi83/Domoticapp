import { settings } from './config.js';

// Collegamento con Google Home, attraverso il servizio di casa.
//
// Il pannello manda al servizio una frase in italiano, come la si direbbe a
// un Nest, e il servizio la gira a Google Assistant a nome tuo. Cosi si
// comanda tutto quello che c e in Google Home, senza toccarne la
// configurazione: i Nest e l app Google Home continuano a funzionare come
// prima.

var collegato = false;
var ultimoErrore = '';
var ultimoControllo = 0;

function base(){ return String(settings.syncUrl || '').replace(/\/+$/, ''); }

export function googleReady(){ return collegato; }

export function googleStatus(){
  if (!settings.syncUrl || !settings.syncToken) return 'servizio di collegamento non configurato';
  if (!ultimoControllo) return 'in verifica';
  if (!collegato) return 'non ancora collegato' + (ultimoErrore ? ', ' + ultimoErrore : '');
  return 'collegato' + (ultimoErrore ? ', ultimo comando: ' + ultimoErrore : '');
}

// Chiede al servizio se il collegamento con Google e stato installato.
// Restituisce una promessa con vero o falso; in caso di rete assente tiene
// l ultimo stato conosciuto, per non spegnere le caselle a ogni singhiozzo.
export function checkGoogle(){
  if (!settings.syncUrl || !settings.syncToken) {
    collegato = false;
    ultimoControllo = Date.now();
    return Promise.resolve(false);
  }
  return fetch(base() + '/google/stato', { headers: { 'X-Casa-Token': settings.syncToken }, cache: 'no-store' })
    .then(function(r){ return r.ok ? r.json() : null; })
    .then(function(j){
      ultimoControllo = Date.now();
      if (j) collegato = !!j.collegato;
      return collegato;
    })
    .catch(function(){ ultimoControllo = Date.now(); return collegato; });
}

// Manda una frase a Google. Risolve sempre con { ok, risposta, errore }.
export function sendToGoogle(testo){
  if (!collegato) return Promise.resolve({ ok: false, errore: 'Google Home non è ancora collegato' });
  var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  var t = ctrl ? setTimeout(function(){ ctrl.abort(); }, 25000) : 0;
  return fetch(base() + '/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Casa-Token': settings.syncToken },
    // La posizione di casa serve a Google per le risposte legate al posto.
    body: JSON.stringify({ testo: String(testo).slice(0, 200), lat: parseFloat(settings.lat), lon: parseFloat(settings.lon) }),
    signal: ctrl ? ctrl.signal : undefined
  }).then(function(r){
    return r.json().catch(function(){ return {}; }).then(function(j){
      clearTimeout(t);
      if (r.ok && j.ok) { ultimoErrore = ''; return { ok: true, risposta: j.risposta || '' }; }
      if (r.status === 503) collegato = false;
      ultimoErrore = j.auth ? 'permesso Google da rinnovare dal computer' : (j.error || 'errore ' + r.status);
      return { ok: false, errore: ultimoErrore };
    });
  }).catch(function(){
    clearTimeout(t);
    ultimoErrore = 'servizio non raggiungibile';
    return { ok: false, errore: ultimoErrore };
  });
}
