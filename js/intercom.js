// Interfono di casa.
//
// Scrivi un messaggio dal telefono mentre sei fuori e il pannello lo
// annuncia ad alta voce a chi e in casa, mostrandolo anche a schermo.
//
// Non serve registrare la voce: il tablet legge il testo con la sintesi
// vocale che gia usa per rispondere ai comandi. Un messaggio scritto
// viaggia con pochi byte, arriva sempre, e si puo leggere anche se la
// stanza e rumorosa o se qualcuno dorme.

import { settings } from './config.js';
import { say } from './voice.js';

var SEEN_KEY = 'domapp.intercom.seen.v1';
var QUEUE_KEY = 'domapp.intercom.queue.v1';

var onArrive = null;

export function setIntercomHandler(fn){ onArrive = fn; }

function seen(){
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch (e) { return []; }
}

function markSeen(ids){
  var list = seen().concat(ids);
  // Teniamo solo gli ultimi, il resto non serve piu a nessuno.
  if (list.length > 120) list = list.slice(list.length - 120);
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(list)); } catch (e) {}
}

// ---------- invio ----------

// Mette il messaggio in coda. Verra spedito al prossimo allineamento,
// cosi funziona anche se in quel momento la rete non c e.
export function sendMessage(text, fromName){
  var queue = readQueue();
  queue.push({
    id: 'ms' + Date.now() + '-' + Math.floor(Math.random() * 10000),
    text: String(text || '').trim(),
    from: fromName || settings.profile1Name || 'Casa',
    at: Date.now()
  });
  writeQueue(queue);
  return queue;
}

export function readQueue(){
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (e) { return []; }
}

function writeQueue(q){
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (e) {}
}

// I messaggi piu vecchi di mezza giornata non vanno piu annunciati:
// sentirsi dire "torno alle otto" il mattino dopo non serve a nessuno.
export function pruneQueue(){
  var cutoff = Date.now() - 12 * 3600000;
  writeQueue(readQueue().filter(function(m){ return m.at > cutoff; }));
}

// ---------- ricezione ----------

// Chiamata a ogni allineamento con l elenco dei messaggi condivisi.
// Annuncia solo quelli non ancora sentiti da questo pannello.
export function receive(messages){
  if (!messages || !messages.length) return 0;

  var already = seen();
  var fresh = [];
  var cutoff = Date.now() - 12 * 3600000;

  for (var i = 0; i < messages.length; i++) {
    var m = messages[i];
    if (!m || !m.id || !m.text) continue;
    if (already.indexOf(m.id) !== -1) continue;
    if (m.at < cutoff) { already.push(m.id); continue; }
    fresh.push(m);
  }

  if (!fresh.length) { markSeen([]); return 0; }

  fresh.sort(function(a, b){ return a.at - b.at; });

  var ids = [];
  for (var k = 0; k < fresh.length; k++) ids.push(fresh[k].id);
  markSeen(ids);

  announce(fresh);
  return fresh.length;
}

var INBOX_KEY = 'domapp.intercom.inbox.v1';

// Gli ultimi messaggi ricevuti, dal piu recente. Servono al riquadro della
// schermata principale, cosi chi passa dopo li legge ancora.
export function inbox(){
  try { return JSON.parse(localStorage.getItem(INBOX_KEY) || '[]'); } catch (e) { return []; }
}

function keepInInbox(list){
  var box = list.slice().reverse().concat(inbox());
  if (box.length > 10) box = box.slice(0, 10);
  try { localStorage.setItem(INBOX_KEY, JSON.stringify(box)); } catch (e) {}
}

function announce(list){
  keepInInbox(list);
  if (onArrive) onArrive(list);

  if (!settings.intercomSpeak) return;
  if (isQuietHours()) return;

  for (var i = 0; i < list.length; i++) {
    var m = list[i];
    say('Messaggio da ' + m.from + '. ' + m.text);
  }
}

// Di notte il messaggio compare a schermo ma non viene letto ad alta voce.
function isQuietHours(){
  var d = new Date();
  var mins = d.getHours() * 60 + d.getMinutes();
  var a = toMinutes(settings.intercomQuietStart);
  var b = toMinutes(settings.intercomQuietEnd);
  if (a === b) return false;
  if (a < b) return mins >= a && mins < b;
  return mins >= a || mins < b;
}

function toMinutes(hhmm){
  var p = String(hhmm || '00:00').split(':');
  return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
}

// Unisce i messaggi propri con quelli arrivati, per rimandarli su.
export function mergeForSync(remote){
  var mine = readQueue();
  var byId = {};
  var i;

  for (i = 0; i < (remote || []).length; i++) {
    if (remote[i] && remote[i].id) byId[remote[i].id] = remote[i];
  }
  for (i = 0; i < mine.length; i++) byId[mine[i].id] = mine[i];

  var out = [];
  var cutoff = Date.now() - 24 * 3600000;
  for (var id in byId) if (byId[id].at > cutoff) out.push(byId[id]);
  out.sort(function(a, b){ return a.at - b.at; });
  return out;
}
