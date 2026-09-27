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
var lastErrorAt = 0;
var lastErrorKind = '';
var listeningNow = false;
var waitingTouch = false;
var triedAfterTouch = false;

// Al primo tocco sullo schermo riaccende l ascolto, dentro il gesto
// stesso: e l unico momento in cui Chrome su Android lo concede.
function armTouchRetry(){
  function onTouch(){
    document.removeEventListener('touchstart', onTouch, true);
    document.removeEventListener('click', onTouch, true);
    if (!waitingTouch || !wanted) return;
    waitingTouch = false;
    triedAfterTouch = true;
    try { rec.start(); } catch (e) {}
  }
  document.addEventListener('touchstart', onTouch, true);
  document.addEventListener('click', onTouch, true);
}
var lastHeard = '';

function Recognizer(){
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function voiceAvailable(){ return !!Recognizer(); }

export function startVoice(handlers){
  onCommand = handlers.onCommand;
  onStateChange = handlers.onStateChange;

  if (!micOn()) { status = 'microfono spento dall’interruttore'; return false; }

  var R = Recognizer();
  if (!R) { status = 'riconoscimento vocale non disponibile in questo browser'; return false; }
  if (!window.isSecureContext) { status = 'serve HTTPS per il microfono'; return false; }

  // Se sta gia ascoltando basta aggiornare chi riceve i comandi: creare un
  // secondo riconoscitore ne lasciava due in funzione insieme.
  if (wanted && rec) return true;

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
  // I risultati parziali servono a mostrare subito cosa si sta sentendo:
  // prima lo schermo restava muto finche non si finiva di parlare.
  rec.interimResults = true;
  rec.maxAlternatives = 1;

  rec.onstart = function(){ status = 'in ascolto'; listeningNow = true; triedAfterTouch = false; lastErrorKind = ''; notify('listening'); };

  rec.onresult = function(ev){
    for (var i = ev.resultIndex; i < ev.results.length; i++) {
      var detto = String(ev.results[i][0].transcript || '').toLowerCase().trim();
      if (!ev.results[i].isFinal) { partial(detto); continue; }
      handle(detto);
    }
  };

  rec.onerror = function(ev){
    var e = ev && ev.error ? ev.error : 'sconosciuto';
    if (e === 'not-allowed' || e === 'service-not-allowed') {
      // Chrome su Android rifiuta il microfono se la pagina si apre da sola,
      // senza che nessuno abbia ancora toccato lo schermo. Non e un permesso
      // negato: basta aspettare il primo tocco e riprovare. Solo se il
      // rifiuto arriva anche dopo un tocco, il permesso e negato davvero.
      if (!triedAfterTouch) {
        waitingTouch = true;
        status = 'in attesa di un tocco sullo schermo';
        notify('needs-touch');
        armTouchRetry();
        return;
      }
      wanted = false;
      waitingTouch = false;
      status = 'permesso microfono negato';
      notify('denied');
      return;
    }
    status = e === 'network' ? 'rete assente, riprovo' : 'errore ' + e;
    lastErrorAt = Date.now();
    lastErrorKind = e;
  };

  rec.onend = function(){
    listeningNow = false;
    if (!wanted) { status = 'fermo'; notify('idle'); return; }
    if (waitingTouch) return;
    spin();
  };
}

function spin(){
  if (!wanted || speaking) return;
  if (restartTimer) clearTimeout(restartTimer);
  // Dopo un errore di rete si aspetta di piu: il riconoscimento passa dai
  // server di Google, e riprovare ogni terzo di secondo senza rete scalda
  // il tablet per niente.
  var attesa = (lastErrorKind === 'network' && Date.now() - lastErrorAt < 30000) ? 5000 : 350;
  restartTimer = setTimeout(function(){
    if (!wanted || speaking) return;
    try { rec.start(); }
    catch (e) { /* gia avviato: il prossimo onend rimettera in moto */ }
  }, attesa);
}

// La prossima frase viene presa cosi com'e, senza bisogno del nome.
export function captureNext(){
  if (!wanted || waitingTouch) return false;
  captureOnce = true;
  notify('capturing');
  // Se entro venti secondi non arriva nessuna frase, la dettatura si
  // annulla: altrimenti la prima frase sentita piu tardi diventerebbe un
  // promemoria per sbaglio.
  setTimeout(function(){ if (captureOnce) { captureOnce = false; notify('listening'); } }, 20000);
  return true;
}

export function voiceListening(){ return !!(wanted && !waitingTouch); }
export function cancelCapture(){ captureOnce = false; notify('listening'); }

// Mostra quello che si sta sentendo, solo se e rivolto al pannello.
var lastPartialAt = 0;
function partial(text){
  if (!text || Date.now() - lastPartialAt < 250) return;
  var name = String(settings.wakeWord || 'ambrogio').toLowerCase().trim();
  var at = text.indexOf(name);
  if (at === -1 && Date.now() > followUntil && !captureOnce) return;
  lastPartialAt = Date.now();
  notify('partial', at === -1 ? text : text.slice(at + name.length).replace(/^[\s,.:;!?]+/, ''));
}

// Dopo il solo nome, la frase successiva vale come comando anche senza
// ripeterlo: chi dice "Ambrogio", si ferma e poi parla, prima veniva
// ignorato.
var followUntil = 0;

function handle(text){
  if (!text) return;
  lastHeard = text;

  if (!captureOnce && Date.now() < followUntil) {
    followUntil = 0;
    var nomeDetto = String(settings.wakeWord || 'ambrogio').toLowerCase().trim();
    var dopo = text.indexOf(nomeDetto) === -1 ? text
      : text.slice(text.indexOf(nomeDetto) + nomeDetto.length).replace(/^[\s,.:;!?]+/, '').trim();
    if (dopo) {
      notify('heard', dopo);
      if (onCommand) onCommand(dopo, text);
      return;
    }
  }

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
  if (!rest) {
    // Solo il nome: si resta in ascolto per otto secondi.
    followUntil = Date.now() + 8000;
    notify('awaiting');
    return;
  }
  notify('heard', rest);
  if (onCommand) onCommand(rest, text);
}

function notify(state, payload){
  if (onStateChange) onStateChange(state, payload);
}

// Parla e tiene il microfono chiuso finche non ha finito.
// Sceglie esplicitamente una voce italiana. Senza, su alcuni tablet la
// sintesi legge l italiano con la voce inglese, e diventa incomprensibile.
function italianVoice(){
  try {
    var voci = window.speechSynthesis.getVoices() || [];
    for (var i = 0; i < voci.length; i++) {
      if (/^it([-_]|$)/i.test(voci[i].lang)) return voci[i];
    }
  } catch (e) {}
  return null;
}

// L elenco delle voci arriva in ritardo: chiederlo subito lo fa caricare.
if (window.speechSynthesis) {
  try { window.speechSynthesis.getVoices(); } catch (e) {}
}

// Chrome su Android fa parlare la pagina solo dopo che qualcuno l ha
// toccata. Questa frase muta, detta durante il primo tocco, sblocca la
// voce per tutto il resto della giornata: risposte, interfono, timer.
export function primeSpeech(){
  if (!window.speechSynthesis) return;
  try {
    var u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    window.speechSynthesis.speak(u);
    speechUnlocked = true;
  } catch (e) {}
}

var speechUnlocked = false;

export function speechStatus(){
  if (!window.speechSynthesis) return 'Risposta parlata: non disponibile in questo browser';
  var voce = italianVoice();
  var parte = voce ? 'voce italiana presente' :
    'nessuna voce italiana. Installala da Impostazioni, Lingua e immissione, Sintesi vocale';
  return 'Risposta parlata: ' + parte + (speechUnlocked ? '' : ', si attiva al primo tocco dello schermo');
}

export function say(phrase){
  if (!window.speechSynthesis) return;
  speaking = true;
  try { if (rec) rec.abort(); } catch (e) {}

  var u = new SpeechSynthesisUtterance(phrase);
  u.lang = 'it-IT';
  var voce = italianVoice();
  if (voce) u.voice = voce;
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
