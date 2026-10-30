// Scheda TV: telecomando, app, schermo di casa e spegnimento programmato.
//
// Niente qui parla con il televisore: i comandi vanno al Chromecast,
// attraverso Google o attraverso la rete di casa. Le impostazioni della TV
// restano quelle di oggi.

import {
  tvList, tvDevice, chooseTv, tvName, tvCommand, APPS,
  sleepAt, setSleep, clearSleep, onSleepChange,
  castAppId, screenInfo, startScreen, stopScreen, onScreenChange, prepareCast,
  attachPreview, detachPreview
} from './tv.js';
import { isLive, lastCommand } from './devices.js';

var corpo = null;
var avviso = null;
var registrato = false;

function repaint(){
  var b = document.getElementById('control-body');
  if (corpo && corpo === b && b.isConnected && b.getAttribute('data-scheda') === 'tv') renderTv(b);
}

export function renderTv(body){
  corpo = body;
  body.innerHTML = '';
  detachPreview();
  if (!registrato) {
    registrato = true;
    onScreenChange(repaint);
    onSleepChange(repaint);
  }

  var wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:14px;';

  var dev = tvDevice();
  if (!dev) {
    wrap.appendChild(nota('Nessun televisore fra i dispositivi. Aggiungilo dalla scheda Casa con il tasto ' +
      'Modifica, tipo Televisore, scrivendo come nome in Google Home quello del Chromecast.', 18));
    wrap.appendChild(schermoDiCasa());
    body.appendChild(wrap);
    return;
  }

  wrap.appendChild(intestazione(dev));

  avviso = document.createElement('div');
  avviso.className = 'set-hint tv-avviso';
  wrap.appendChild(avviso);

  wrap.appendChild(titolo('Telecomando'));
  if (!isLive()) {
    wrap.appendChild(nota('Da collegare a Google Home: finché non è collegato i tasti non comandano niente. ' +
      'Lo schermo di casa qui sotto invece non ne ha bisogno.'));
  }
  wrap.appendChild(telecomando());

  wrap.appendChild(titolo('App'));
  wrap.appendChild(nota('Funzionano con il Chromecast con Google TV, quello con il telecomando. ' +
    'Il Chromecast senza telecomando non ha app sue: Google lo dirà.'));
  wrap.appendChild(app());
  wrap.appendChild(cerca());

  wrap.appendChild(titolo('Schermo di casa sulla TV'));
  wrap.appendChild(schermoDiCasa());

  wrap.appendChild(titolo('Spegnimento programmato'));
  wrap.appendChild(spegnimento());

  wrap.appendChild(nota('Il pannello non cambia nessuna impostazione del televisore: parla solo con il ' +
    'Chromecast. Accendere e spegnere la TV dal Chromecast funziona se nel menu della TV è attivo ' +
    'SimpLink; se non lo è, quei due tasti non hanno effetto e tutto il resto funziona lo stesso.'));

  body.appendChild(wrap);
}

function titolo(t){
  var h = document.createElement('div');
  h.className = 'room-title';
  h.style.marginTop = '6px';
  h.textContent = t;
  return h;
}

function nota(t, grande){
  var n = document.createElement('div');
  n.className = 'set-hint';
  n.style.cssText = 'font-size:' + (grande || 15) + 'px;line-height:1.45;';
  n.textContent = t;
  return n;
}

function pulsante(testo, fn, cls){
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn tv-btn' + (cls ? ' ' + cls : '');
  b.textContent = testo;
  b.addEventListener('click', fn);
  return b;
}

function riga(){
  var r = document.createElement('div');
  r.className = 'tv-row';
  for (var i = 0; i < arguments.length; i++) r.appendChild(arguments[i]);
  return r;
}

function dici(testo, male){
  if (!avviso || !avviso.isConnected) return;
  avviso.textContent = testo;
  avviso.style.color = male ? '#f0b429' : '';
}

// Manda il comando e scrive cosa ha risposto Google, giusto o sbagliato.
function invia(azione, extra){
  dici('Invio...');
  tvCommand(azione, extra).then(function(r){
    if (!r.ok) { dici('Non riuscito: ' + r.errore, true); return; }
    dici(r.risposta ? 'Google: ' + r.risposta : 'Inviato: ' + r.frase + '.');
  });
}

function intestazione(dev){
  var box = document.createElement('div');
  box.className = 'music-now';

  var info = document.createElement('div');
  info.style.cssText = 'flex:1;min-width:0;';
  var t = document.createElement('div');
  t.className = 'music-title';
  t.textContent = dev.name || 'TV';
  var s = document.createElement('div');
  s.className = 'set-hint';
  s.style.fontSize = '15px';
  var ultimo = lastCommand(dev.id);
  s.textContent = 'In Google Home: ' + tvName(dev) +
    (ultimo ? '  ·  ultimo comando: ' + (ultimo.on ? 'accesa' : 'spenta') + ' alle ' +
      new Date(ultimo.at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '');
  info.appendChild(t);
  info.appendChild(s);
  box.appendChild(info);

  // Piu televisori: si sceglie quale comandare da questo tablet.
  var lista = tvList();
  if (lista.length > 1) {
    var sel = document.createElement('div');
    sel.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
    lista.forEach(function(d){
      var b = pulsante(d.name, function(){ chooseTv(d.id); repaint(); }, d.id === dev.id ? 'tv-chosen' : '');
      sel.appendChild(b);
    });
    box.appendChild(sel);
  }
  return box;
}

function telecomando(){
  var box = document.createElement('div');
  box.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
  // Parole invece dei simboli: il tablet vecchio mostra molti simboli come
  // quadratini vuoti.
  box.appendChild(riga(
    pulsante('Accendi', function(){ invia('accendi'); }, 'btn-on'),
    pulsante('Spegni', function(){ invia('spegni'); })
  ));
  box.appendChild(riga(
    pulsante('« 30 s', function(){ invia('indietro'); }),
    pulsante('Pausa', function(){ invia('pausa'); }),
    pulsante('Riprendi', function(){ invia('riprendi'); }, 'btn-on'),
    pulsante('Stop', function(){ invia('stop'); }),
    pulsante('30 s »', function(){ invia('avanti'); })
  ));
  box.appendChild(riga(
    pulsante('Vol −', function(){ invia('volGiu'); }),
    pulsante('Vol +', function(){ invia('volSu'); }),
    pulsante('Muto', function(){ invia('muto'); }),
    pulsante('Audio', function(){ invia('audio'); })
  ));
  return box;
}

function app(){
  var grid = document.createElement('div');
  grid.className = 'tv-apps';
  APPS.forEach(function(nome){
    grid.appendChild(pulsante(nome, function(){ invia('app', { app: nome }); }));
  });
  return grid;
}

function cerca(){
  var row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:10px;';
  var field = document.createElement('input');
  field.type = 'text';
  field.placeholder = 'Cosa vuoi guardare su YouTube, per esempio ricetta della carbonara';
  field.className = 'tv-field';
  function vai(){
    var q = field.value.trim();
    if (!q) return;
    invia('guarda', { cosa: q.slice(0, 120) });
  }
  field.addEventListener('keydown', function(ev){ if (ev.key === 'Enter') vai(); });
  row.appendChild(field);
  row.appendChild(pulsante('Guarda sulla TV', vai));
  return row;
}

function schermoDiCasa(){
  var box = document.createElement('div');
  box.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
  box.appendChild(nota('Sulla TV compaiono le foto della cornice, l’ora, il meteo, i promemoria, i timer ' +
    'e i messaggi dell’interfono, come sui pannelli. Dalla scheda Radio la musica può suonare dalla TV. ' +
    'Si chiude da solo dopo le ore scelte nelle impostazioni e all’inizio delle ore di riposo.'));

  var info = screenInfo();
  var stato = document.createElement('div');
  stato.className = 'set-hint tv-avviso';

  var azioni = document.createElement('div');
  azioni.className = 'tv-row';

  if (!castAppId()) {
    stato.textContent = 'Da attivare: serve il numero di applicazione Cast, che si ottiene una volta sola ' +
      'seguendo tv/GUIDA.md e si scrive nelle impostazioni, gruppo Televisore.';
  } else if (info.daRicaricare) {
    stato.textContent = 'Il numero di applicazione è cambiato: ricarica la pagina per usarlo.';
  } else if (info.stato === 'acceso') {
    stato.textContent = 'Acceso sulla TV.';
    azioni.appendChild(pulsante('Chiudi sulla TV', function(){ stopScreen(); repaint(); }));
  } else {
    stato.textContent = info.stato === 'collegamento' ? 'Collego il Chromecast...' :
      (info.errore ? 'Non disponibile: ' + info.errore + '.' : '');
    var porta = pulsante('Porta sulla TV', function(){
      stato.textContent = 'Scegli il Chromecast nell’elenco di Chrome...';
      startScreen().then(function(msg){ if (msg) stato.textContent = msg; });
    }, 'btn-on');
    azioni.appendChild(porta);
    // Il programma di Google si carica in anticipo, cosi al tocco l elenco
    // dei Chromecast si apre subito: Chrome lo apre solo dentro un tocco.
    prepareCast().then(function(ok){ if (!ok && screenInfo().errore) stato.textContent = 'Non disponibile: ' + screenInfo().errore + '.'; });
  }

  azioni.appendChild(pulsante('Anteprima', function(){ anteprima(box); }));
  box.appendChild(azioni);
  box.appendChild(stato);
  return box;
}

// Mostra qui sul tablet, in piccolo, come apparira lo schermo sulla TV,
// con le foto e i dati veri del pannello.
function anteprima(box){
  var vecchia = box.querySelector('.tv-preview');
  if (vecchia) { vecchia.parentNode.removeChild(vecchia); detachPreview(); return; }
  var cornice = document.createElement('div');
  cornice.className = 'tv-preview';
  var f = document.createElement('iframe');
  f.src = 'tv/?prova=1';
  f.setAttribute('scrolling', 'no');
  f.setAttribute('title', 'Anteprima dello schermo sulla TV');
  // Appena caricata riceve gli stessi dati che riceverebbe la TV.
  f.addEventListener('load', function(){ attachPreview(f); });
  cornice.appendChild(f);
  box.appendChild(cornice);
}

function spegnimento(){
  var box = document.createElement('div');
  box.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

  var at = sleepAt();
  var stato = document.createElement('div');
  stato.className = 'set-hint tv-avviso';
  stato.textContent = at
    ? 'La TV si spegne alle ' + new Date(at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) +
      '. Lo esegue il pannello di casa, che deve restare acceso.'
    : 'Nessuno spegnimento programmato.';

  var r = riga();
  [[15, '15 min'], [30, '30 min'], [60, '1 ora'], [90, '1 ora e mezza'], [120, '2 ore']].forEach(function(x){
    r.appendChild(pulsante(x[1], function(){
      setSleep(x[0]);
      repaint();
    }));
  });
  if (at) r.appendChild(pulsante('Annulla', function(){ clearSleep(); repaint(); }));

  box.appendChild(r);
  box.appendChild(stato);
  return box;
}
