// Interpretazione dei comandi vocali in italiano.
//
// Funziona per parole chiave, senza servizi esterni: riconosce cosa fare
// e in quale stanza, e restituisce la frase di risposta da pronunciare.
// Quando Google Home e collegato, le frasi che il pannello non conosce
// vengono girate a Google Assistant cosi come sono state dette.

import { devices, speakers, rooms, roomName, setDevice, toggle, runScene, scenes, isLive } from './devices.js';
import { spotifyReady, spotifyState, matchDevice, findPlaylist } from './spotify.js';

// Risposta onesta quando il comando riguarda qualcosa che il pannello non
// comanda ancora davvero. Meglio dirlo che fingere di averlo fatto.
var NOT_YET = {
  luci:     'Le luci non sono ancora collegate al pannello.',
  tv:       'Il televisore non è ancora collegato al pannello.',
  musica:   'La musica sui Nest non è ancora collegata al pannello: per ora chiedila direttamente al Nest.',
  citofono: 'Il citofono non è ancora collegato al pannello.'
};

function notYet(cosa, tab){
  return { reply: NOT_YET[cosa], screen: 'control', tab: tab || null, offline: true };
}

import { loadItems, addFromVoice, removeFromVoice, clearAll, spokenList } from './shopping.js';
import { parseTimer, addTimer, spokenDuration, clearAllTimers, activeTimers } from './timers.js';

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
    var nome = fold(ordinate[i].name).trim();
    if (nome && text.indexOf(nome) !== -1) return ordinate[i].id;
  }
  for (var parola in SINONIMI) {
    if (text.indexOf(parola) === -1) continue;
    for (var k = 0; k < rooms.length; k++) {
      if (fold(rooms[k].name).trim() === SINONIMI[parola]) return rooms[k].id;
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
// Toglie gli accenti per confrontare: il riconoscimento vocale scrive
// "giù" e "lunedì", mentre le parole chiave sono scritte senza.
function fold(t){
  return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function runCommand(text){
  if (!text) return { reply: 'Dimmi pure.', screen: 'control' };
  // Il testo originale serve per salvare la spesa con gli accenti giusti.
  var raw = text;
  text = fold(text);

  var room = roomIn(text);
  var wantsOn = has(text, ['accendi', 'accendere', 'attiva', 'apri la luce']);
  var wantsOff = has(text, ['spegni', 'spegnere', 'disattiva']);

  // Il timer va cercato prima della spesa: "aggiungi un timer" non e spesa.
  if (has(text, ['timer', 'conta alla rovescia', 'cronometro'])) {
    if (has(text, ['annulla', 'cancella', 'ferma', 'togli', 'basta', 'stop'])) {
      var quanti = activeTimers().length;
      clearAllTimers();
      return { reply: quanti ? 'Timer annullato.' : 'Non ci sono timer in corso.', screen: 'ambient' };
    }
    var t = parseTimer(text);
    if (!t) return { reply: 'Per quanto tempo?', screen: 'ambient' };
    addTimer(t.seconds, t.name);
    return { reply: 'Timer di ' + spokenDuration(t.seconds) + ' avviato.', screen: 'ambient' };
  }

  if (has(text, ['lista della spesa', 'alla spesa', 'nella spesa', 'dalla spesa', 'della spesa',
                  'nella lista', 'sulla lista', 'alla lista', 'dalla lista', 'da comprare',
                  'ho comprato', 'abbiamo comprato'])) {
    return shoppingCommand(text, raw);
  }

  if (has(text, ['ricordami', 'promemoria', 'segna', 'annota', 'appunta', 'metti in agenda'])) {
    return { reply: null, screen: 'control', tab: 'agenda', reminder: raw };
  }

  if (has(text, ['agenda', 'impegni', 'che cosa ho', 'cosa ho oggi', 'appuntamenti'])) {
    return { reply: 'Ecco l’agenda.', screen: 'control', tab: 'agenda' };
  }

  if (has(text, ['meteo', 'che tempo', 'tempo fa', 'temperatura', 'previsioni'])) {
    return { reply: 'Ecco il meteo.', screen: 'ambient', weather: true };
  }

  if (has(text, ['citofono', 'portone', 'apri il cancello', 'apri giu'])) {
    if (!isLive()) return notYet('citofono');
    var cit = firstOf(devices, function(d){ return d.kind === 'intercom'; });
    if (!cit) return { reply: 'Non ho il citofono fra i dispositivi.', screen: 'control' };
    toggle(cit.id);
    return { reply: 'Chiedo a Google di aprire il portone.', screen: 'control', device: 'citofono' };
  }

  // Una scena si chiama per nome, per esempio "cena" o "buonanotte".
  // "metti la playlist cena" e musica, non la scena Cena.
  var perMusica = has(text, ['playlist', 'spotify']);
  var scena = perMusica ? null : firstOf(scenes, function(sc){
    var nome = fold(sc.name).trim();
    return nome && text.indexOf(nome) !== -1;
  });
  if (!scena && !perMusica && has(text, ['buona notte'])) scena = firstOf(scenes, function(sc){ return sc.id === 'buonanotte'; });
  if (scena) {
    if (!isLive()) return notYet('luci');
    runScene(scena.id);
    return { reply: 'Fatto: ' + scena.name.toLowerCase() + '.', screen: 'control' };
  }

  if (has(text, ['musica', 'spotify', 'canzone', 'suona', 'metti su', 'playlist', 'volume', 'brano', 'pausa'])) {
    // La musica passa da Spotify: Google non accetta comandi di musica da
    // questa strada.
    if (!spotifyReady()) return notYet('musica', 'musica');
    return musicCommand(text, room);
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
    // Un dispositivo che il pannello non ha, Google Home magari si: si
    // chiede a lui con la frase originale.
    if (isLive() && (!candidati.length || !room && has(text, ['della', 'dello', 'del ', 'nella', 'nel ']))) return askGoogle(raw);
    if (!candidati.length) return { reply: 'Non ho ' + nomeTipo.replace(/^(il|la) /, '') + ' fra i dispositivi.', screen: 'control' };
    return { reply: 'In quale stanza?', screen: 'control' };
  }

  if (isLive()) return askGoogle(raw);
  return null;
}

// Lista della spesa a voce: piu cose in una frase, anche senza virgole;
// togliere, leggere, svuotare.
function shoppingCommand(text, raw){
  function spesa(reply){ return { reply: reply, screen: 'control', tab: 'spesa', refresh: true }; }

  if (has(text, ['svuota', 'svuotare', 'cancella tutto', 'cancella tutta', 'togli tutto', 'elimina tutto',
                 'cancella la lista', 'azzera'])) {
    return spesa(clearAll() ? 'Lista della spesa svuotata.' : 'La lista era già vuota.');
  }

  if (has(text, ['cosa', 'leggimi', 'leggi', 'quanti', 'quante', 'mostrami', 'fammi vedere', 'che c'])) {
    var nomi = loadItems().filter(function(i){ return !i.done; }).map(function(i){ return i.text; });
    if (!nomi.length) return spesa('La lista è vuota.');
    var altre = nomi.length > 12 ? ' e altre ' + (nomi.length - 12) + ' cose' : '';
    return spesa('Sulla lista: ' + spokenList(nomi.slice(0, 12)) + altre + '.');
  }

  if (has(text, ['rimuovi', 'togli', 'cancella', 'elimina', 'leva', 'depenna', 'ho comprato',
                 'abbiamo comprato', 'ho preso', 'abbiamo preso'])) {
    var r = removeFromVoice(raw);
    var parti = [];
    if (r.tolte.length) parti.push((r.tolte.length === 1 ? 'Tolto ' : 'Tolti ') + spokenList(r.tolte) + '.');
    if (r.mancanti.length) parti.push('Non trovo ' + spokenList(r.mancanti) + ' nella lista.');
    return spesa(parti.join(' ') || 'Cosa devo togliere dalla lista?');
  }

  var a = addFromVoice(raw);
  var detto = [];
  if (a.aggiunte.length) detto.push((a.aggiunte.length === 1 ? 'Aggiunto ' : 'Aggiunti ') + spokenList(a.aggiunte) + '.');
  if (a.gia.length) detto.push(spokenList(a.gia) + (a.gia.length === 1 ? ' c’era già.' : ' c’erano già.'));
  return spesa(detto.join(' ') || 'Cosa devo aggiungere alla spesa?');
}

// Comandi per Spotify. La risposta si dice subito; il comando lo manda il
// pannello, che poi riferisce se non e andato.
function musicCommand(text, room){
  var st = spotifyState() || {};
  function musica(reply, cmd){ return { reply: reply, screen: 'control', tab: 'musica', spotify: cmd }; }

  if (has(text, ['ferma', 'basta', 'stop', 'silenzio', 'spegni', 'pausa'])) return musica('Fermo la musica.', { azione: 'pausa' });
  if (has(text, ['prossim', 'successiv', 'salta', 'avanti'])) return musica('Passo al brano successivo.', { azione: 'successivo' });
  if (has(text, ['precedente', 'torna indietro'])) return musica('Torno al brano precedente.', { azione: 'precedente' });
  if (has(text, ['volume', 'piu forte', 'piu piano'])) {
    var su = has(text, ['alza', 'aumenta', 'piu forte']);
    var giu = has(text, ['abbassa', 'diminuisci', 'piu piano']);
    if (su || giu) {
      var v = (st.volume == null ? 50 : st.volume) + (su ? 15 : -15);
      return musica(su ? 'Alzo il volume.' : 'Abbasso il volume.', { azione: 'volume', volume: Math.max(0, Math.min(100, v)) });
    }
  }

  var dove = null;
  if (room) {
    var sp = firstOf(speakers, function(x){ return x.room === room; });
    dove = (sp && matchDevice(sp)) || matchDevice({ google: '', room: room, name: '' });
    if (!dove) {
      return { reply: 'Il Nest' + where(room) + ' si sceglie dall’app Spotify sul telefono: da qui comando solo quello che sta già suonando.',
               screen: 'control', tab: 'musica' };
    }
  }

  var pl = findPlaylist(text);
  if (pl) return musica('Metto ' + pl.nome + (dove ? where(room) : '') + '.',
    { azione: 'play', uri: pl.uri, dispositivo: dove ? dove.id : (st.dispositivoId || '') });
  if (dove) return musica('Metto la musica' + where(room) + '.', { azione: 'play', dispositivo: dove.id });
  return musica('Faccio ripartire la musica.', { azione: 'play' });
}

function askGoogle(frase){
  return { reply: null, screen: 'control', google: frase };
}
