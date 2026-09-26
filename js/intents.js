// Interpretazione dei comandi vocali in italiano.
//
// Funziona per parole chiave, senza servizi esterni: riconosce cosa fare
// e in quale stanza, e restituisce la frase di risposta da pronunciare.

import { devices, speakers, rooms, roomName, findDevice, setDevice, runScene, scenes, isLive } from './devices.js';

// Risposta onesta quando il comando riguarda qualcosa che il pannello non
// comanda ancora davvero. Meglio dirlo che fingere di averlo fatto.
var NOT_YET = {
  luci:     'Le luci non sono ancora collegate al pannello.',
  tv:       'Il televisore non e ancora collegato al pannello.',
  musica:   'La musica sui Nest non e ancora collegata al pannello.',
  citofono: 'Il citofono non e ancora collegato al pannello.'
};

function notYet(cosa, tab){
  return { reply: NOT_YET[cosa], screen: 'control', tab: tab || null, offline: true };
}

import { addItem, pendingCount } from './shopping.js';
import { parseTimer, addTimer, spokenDuration } from './timers.js';

// Modi comuni di chiamare una stanza con un altro nome. Valgono solo se in
// casa esiste davvero una stanza con quel nome.
var SINONIMI = {
  'salotto': 'soggiorno', 'sala': 'soggiorno', 'living': 'soggiorno',
  'camera da letto': 'camera', 'letto': 'camera', 'matrimoniale': 'camera',
  'ingresso': 'corridoio', 'entrata': 'corridoio'
};

// Riconosce la stanza nominata nella frase, fra quelle che hai messo tu.
// Si provano prima i nomi piu lunghi, cosi "camera dei bambini" non viene
// scambiata per "camera".
function roomIn(text){
  var ordinate = rooms.slice().sort(function(a, b){ return b.name.length - a.name.length; });
  for (var i = 0; i < ordinate.length; i++) {
    var nome = String(ordinate[i].name || '').toLowerCase().trim();
    if (nome && text.indexOf(nome) !== -1) return ordinate[i].id;
  }
  for (var parola in SINONIMI) {
    if (text.indexOf(parola) === -1) continue;
    for (var k = 0; k < rooms.length; k++) {
      if (String(rooms[k].name).toLowerCase().trim() === SINONIMI[parola]) return rooms[k].id;
    }
  }
  return null;
}

function has(text, words){
  for (var i = 0; i < words.length; i++) if (text.indexOf(words[i]) !== -1) return true;
  return false;
}

function firstOf(list, test){
  for (var i = 0; i < list.length; i++) if (test(list[i])) return list[i];
  return null;
}

function where(roomId){
  var n = roomName(roomId);
  return n ? ' in ' + n.toLowerCase() : '';
}

// Restituisce { reply, screen } oppure null se non ha capito.
export function runCommand(text){
  if (!text) return { reply: 'Dimmi pure.', screen: 'control' };

  var room = roomIn(text);
  var wantsOn = has(text, ['accendi', 'accendere', 'attiva', 'apri la luce']);
  var wantsOff = has(text, ['spegni', 'spegnere', 'disattiva']);

  // Il timer va cercato prima della spesa: "aggiungi un timer" non e spesa.
  if (has(text, ['timer', 'conta alla rovescia', 'cronometro'])) {
    var t = parseTimer(text);
    if (!t) return { reply: 'Per quanto tempo?', screen: 'ambient' };
    addTimer(t.seconds, t.name);
    return { reply: 'Timer di ' + spokenDuration(t.seconds) + ' avviato.', screen: 'ambient' };
  }

  if (has(text, ['lista della spesa', 'alla spesa', 'nella lista', 'sulla lista', 'da comprare'])) {
    if (has(text, ['cosa', 'leggimi', 'quanti', 'mostrami', 'fammi vedere'])) {
      var n = pendingCount();
      return {
        reply: n ? 'Sulla lista ci sono ' + n + (n === 1 ? ' cosa.' : ' cose.') : 'La lista e vuota.',
        screen: 'control', tab: 'spesa'
      };
    }
    var prima = pendingCount();
    addItem(text);
    // Se dalla frase non si ricava niente da comprare, lo si dice.
    if (pendingCount() === prima) return { reply: 'Cosa devo aggiungere alla spesa?', screen: 'control', tab: 'spesa' };
    return { reply: 'Aggiunto alla spesa.', screen: 'control', tab: 'spesa', refresh: true };
  }

  if (has(text, ['ricordami', 'promemoria', 'segna', 'annota', 'appunta', 'metti in agenda'])) {
    return { reply: null, screen: 'control', tab: 'agenda', reminder: text };
  }

  if (has(text, ['agenda', 'impegni', 'che cosa ho', 'cosa ho oggi', 'appuntamenti'])) {
    return { reply: 'Ecco l agenda.', screen: 'control', tab: 'agenda' };
  }

  if (has(text, ['meteo', 'che tempo', 'tempo fa', 'temperatura', 'previsioni'])) {
    return { reply: 'Ecco il meteo.', screen: 'ambient', weather: true };
  }

  if (has(text, ['citofono', 'portone', 'apri il cancello', 'apri giu'])) {
    if (!isLive()) return notYet('citofono');
    return { reply: 'Apro il portone.', screen: 'control', device: 'citofono' };
  }

  // Una scena si chiama per nome, per esempio "cena" o "buonanotte".
  var scena = firstOf(scenes, function(sc){
    var nome = String(sc.name || '').toLowerCase().trim();
    return nome && text.indexOf(nome) !== -1;
  });
  if (!scena && has(text, ['buona notte'])) scena = firstOf(scenes, function(sc){ return sc.id === 'buonanotte'; });
  if (scena) {
    if (!isLive()) return notYet('luci');
    runScene(scena.id);
    return { reply: 'Fatto: ' + scena.name.toLowerCase() + '.', screen: 'control' };
  }

  if (has(text, ['musica', 'spotify', 'canzone', 'suona', 'metti su'])) {
    if (!isLive()) return notYet('musica', 'musica');
    if (has(text, ['ferma', 'basta', 'stop', 'silenzio', 'spegni'])) {
      for (var p = 0; p < speakers.length; p++) setDevice(speakers[p].id, false, false);
      return { reply: 'Fermo la musica.', screen: 'control', tab: 'musica' };
    }
    var sp = room ? firstOf(speakers, function(x){ return x.room === room; }) : null;
    if (sp) {
      setDevice(sp.id, true);
      return { reply: 'Metto la musica' + where(room) + '.', screen: 'control', tab: 'musica' };
    }
    return { reply: 'In quale stanza?', screen: 'control', tab: 'musica' };
  }

  if (wantsOn || wantsOff) {
    var vuoleTv = has(text, ['tele', 'televisione', 'tv']);
    var vuoleClima = has(text, ['clima', 'condizionatore', 'aria condizionata']);

    if (!isLive()) return vuoleTv ? notYet('tv') : notYet('luci');

    if (has(text, ['tutto', 'tutte le luci'])) {
      for (var i = 0; i < devices.length; i++) {
        if (devices[i].kind === 'light') setDevice(devices[i].id, !!wantsOn);
      }
      return { reply: wantsOn ? 'Accendo tutte le luci.' : 'Spengo tutte le luci.', screen: 'control' };
    }

    var tipo = vuoleTv ? 'tv' : (vuoleClima ? 'clima' : 'luce');
    var nomeTipo = { tv: 'il televisore', clima: 'il clima', luce: 'la luce' }[tipo];

    var candidati = devices.filter(function(d){ return d.type === tipo; });
    var scelto = room ? firstOf(candidati, function(d){ return d.room === room; })
                      : (candidati.length === 1 ? candidati[0] : null);

    if (scelto) {
      setDevice(scelto.id, !!wantsOn);
      return { reply: (wantsOn ? 'Accendo ' : 'Spengo ') + nomeTipo + where(scelto.room) + '.', screen: 'control' };
    }
    if (!candidati.length) return { reply: 'Non ho ' + nomeTipo.replace(/^(il|la) /, '') + ' fra i dispositivi.', screen: 'control' };
    return { reply: 'In quale stanza?', screen: 'control' };
  }

  return null;
}
