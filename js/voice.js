// Ascolto continuo con parola di richiamo.
//
// Chrome su Android chiude il microfono dopo pochi secondi di silenzio.
// Il rimedio e riavviare il riconoscimento ogni volta che si chiude, con
// una piccola pausa per non entrare in un ciclo stretto. Il microfono
// viene sospeso mentre il tablet parla, cosi non si sente da solo.
//
// Il riconoscimento di Chrome 95 passa dai server di Google: serve rete.
// Il testo non viene mai salvato sul tablet ne inviato altrove.

import { settings } from './config.js';
import { micOn } from './privacy.js';

var rec = null;
var wanted = false;
var speaking = false;
var restartTimer = null;
var onCommand = null;
var onStateChange = null;
var status = 'non avviato';
var captureOnce = false;
var lastHeard = '';

function Recognizer(){
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function voiceAvailable(){ return !!Recognizer(); }

export function startVoice(handlers){
  onCommand = handlers.onCommand;
  onStateChange = handlers.onStateChange;

  if (!micOn()) { status = 'microfono spento dall interruttore'; return false; }

  var R = Recognizer();
  if (!R) { status = 'riconoscimento vocale non disponibile in questo browser'; return false; }
  if (!window.isSecureContext) { status = 'serve HTTPS per il microfono'; return false; }

  wanted = true;
  build(R);
  spin();
  return true;
}

export function stopVoice(){
  wanted = false;
  if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
  if (rec) { try { rec.abort(); } catch (e) {} }
  status = 'fermo';
}

function build(R){
  rec = new R();
  rec.lang = 'it-IT';
  rec.continuous = true;
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  rec.onstart = function(){ status = 'in ascolto'; notify('listening'); };

  rec.onresult = function(ev){
    for (var i = ev.resultIndex; i < ev.results.length; i++) {
      if (!ev.results[i].isFinal) continue;
      handle(String(ev.results[i][0].transcript || '').toLowerCase().trim());
    }
  };

  rec.onerror = function(ev){
    var e = ev && ev.error ? ev.error : 'sconosciuto';
    if (e === 'not-allowed' || e === 'service-not-allowed') {
      wanted = false;
      status = 'permesso microfono negato';
      notify('denied');
      return;
    }
    status = e === 'network' ? 'rete assente, riprovo' : 'errore ' + e;
  };

  rec.onend = function(){
    if (!wanted) { status = 'fermo'; notify('idle'); return; }
    spin();
  };
}

function spin(){
  if (!wanted || speaking) return;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(function(){
    if (!wanted || speaking) return;
    try { rec.start(); }
    catch (e) { /* gia avviato: il prossimo onend rimettera in moto */ }
  }, 350);
}

// La prossima frase viene presa cosi com'e, senza bisogno del nome.
export function captureNext(){ captureOnce = true; notify('capturing'); }
export function cancelCapture(){ captureOnce = false; notify('listening'); }

function handle(text){
  if (!text) return;
  lastHeard = text;

  if (captureOnce) {
    captureOnce = false;
    notify('captured', text);
    if (onCommand) onCommand(text, text, true);
    return;
  }

  var name = String(settings.wakeWord || 'ambrogio').toLowerCase().trim();
  var at = text.indexOf(name);
  if (at === -1) return;

  var rest = text.slice(at + name.length).replace(/^[\s,.:;!?]+/, '').trim();
  notify('heard', rest || name);
  if (onCommand) onCommand(rest, text);
}

function notify(state, payload){
  if (onStateChange) onStateChange(state, payload);
}

// Parla e tiene il microfono chiuso finche non ha finito.
export function say(phrase){
  if (!window.speechSynthesis) return;
  speaking = true;
  try { if (rec) rec.abort(); } catch (e) {}

  var u = new SpeechSynthesisUtterance(phrase);
  u.lang = 'it-IT';
  u.rate = 1.02;
  u.onend = u.onerror = function(){
    speaking = false;
    spin();
  };
  window.speechSynthesis.speak(u);
}

export function voiceDiagnostics(){
  return 'Voce: ' + status + (lastHeard ? ', ultima frase "' + lastHeard + '"' : '');
}
