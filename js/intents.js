// Interpretazione dei comandi vocali in italiano.
//
// Funziona per parole chiave, senza servizi esterni: riconosce cosa fare
// e in quale stanza, e restituisce la frase di risposta da pronunciare.

import { devices, speakers, findDevice, toggle, runScene } from './devices.js';
import { addItem, pendingCount } from './shopping.js';
import { parseTimer, addTimer, spokenDuration } from './timers.js';

var STANZE = {
  'soggiorno':'soggiorno', 'salotto':'soggiorno', 'sala':'soggiorno',
  'cucina':'cucina',
  'camera':'camera', 'stanza':'camera', 'letto':'camera',
  'corridoio':'corridoio', 'ingresso':'corridoio',
  'bagno':'bagno'
};

function roomIn(text){
  for (var word in STANZE) if (text.indexOf(word) !== -1) return STANZE[word];
  return null;
}

function has(text, words){
  for (var i = 0; i < words.length; i++) if (text.indexOf(words[i]) !== -1) return true;
  return false;
}

function lightFor(room){
  for (var i = 0; i < devices.length; i++) {
    if (devices[i].kind === 'light' && devices[i].name.toLowerCase() === room) return devices[i];
  }
  return null;
}

function speakerFor(room){
  for (var i = 0; i < speakers.length; i++) {
    if (speakers[i].name.toLowerCase() === room) return speakers[i];
  }
  return null;
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
    var added = addItem(text);
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
    return { reply: 'Apro il portone.', screen: 'control', device: 'citofono' };
  }

  if (has(text, ['buonanotte', 'buona notte'])) {
    runScene('buonanotte');
    return { reply: 'Buonanotte. Spengo tutto.', screen: 'ambient' };
  }

  if (has(text, ['musica', 'spotify', 'canzone', 'suona', 'metti su'])) {
    if (has(text, ['ferma', 'basta', 'stop', 'silenzio', 'spegni'])) {
      runScene('silenzio');
      return { reply: 'Fermo la musica.', screen: 'control', tab: 'musica' };
    }
    var sp = room ? speakerFor(room) : null;
    if (sp) {
      if (!sp.on) toggle(sp.id);
      return { reply: 'Metto la musica in ' + sp.name.toLowerCase() + '.', screen: 'control', tab: 'musica' };
    }
    return { reply: 'In quale stanza?', screen: 'control', tab: 'musica' };
  }

  if (wantsOn || wantsOff) {
    if (has(text, ['tutto', 'tutte le luci'])) {
      for (var i = 0; i < devices.length; i++) {
        if (devices[i].kind === 'light' && devices[i].on === !!wantsOff) toggle(devices[i].id);
      }
      return { reply: wantsOn ? 'Accendo tutte le luci.' : 'Spengo tutte le luci.', screen: 'control' };
    }

    if (has(text, ['tele', 'televisione', 'tv'])) {
      var tv = findDevice('tv');
      if (tv && tv.on !== !!wantsOn) toggle('tv');
      return { reply: wantsOn ? 'Accendo la TV.' : 'Spengo la TV.', screen: 'control' };
    }

    if (room) {
      var l = lightFor(room);
      if (l) {
        if (l.on !== !!wantsOn) toggle(l.id);
        return { reply: (wantsOn ? 'Accendo ' : 'Spengo ') + l.name.toLowerCase() + '.', screen: 'control' };
      }
    }
    return { reply: 'Quale stanza?', screen: 'control' };
  }

  return null;
}
