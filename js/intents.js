// Interpretazione dei comandi vocali in italiano.
//
// Funziona per parole chiave, senza servizi esterni: riconosce cosa fare
// e in quale stanza, e restituisce la frase di risposta da pronunciare.
// Quando Google Home e collegato, le frasi che il pannello non conosce
// vengono girate a Google Assistant cosi come sono state dette.

import { devices, speakers, rooms, roomName, setDevice, toggle, runScene, scenes, isLive } from './devices.js';
import { spotifyReady, spotifyState, matchDevice, findPlaylist } from './spotify.js';
import { tvDevice, APPS, googleTv } from './tv.js';

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
  // "annulla il timer della TV" riguarda lo spegnimento della TV, non la cucina.
  var timerTv = TV_WORDS.test(text);
  if (has(text, ['timer', 'conta alla rovescia', 'cronometro']) && !timerTv) {
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

  // Il televisore va riconosciuto prima della musica: "metti in pausa la
  // TV" non riguarda Spotify.
  if (TV_WORDS.test(text)) {
    var tv = tvCommand(text, raw, wantsOn, wantsOff);
    if (tv) return tv;
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
  // A voce si risponde corto: mentre il tablet parla il microfono e chiuso,
  // e una risposta lunga faceva perdere il comando successivo. L elenco
  // completo si legge sullo schermo.
  function spesa(reply, corta){ return { reply: reply, speak: corta || reply, screen: 'control', tab: 'spesa', refresh: true }; }
  function quante(n, una, tante){ return n === 1 ? una : n + ' ' + tante; }

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
    var cortaT = r.tolte.length > 2 ? 'Fatto, ' + r.tolte.length + ' cose tolte.' + (r.mancanti.length ? ' ' + parti[1] : '') : '';
    return spesa(parti.join(' ') || 'Cosa devo togliere dalla lista?', cortaT);
  }

  var a = addFromVoice(raw);
  var detto = [];
  if (a.aggiunte.length) detto.push((a.aggiunte.length === 1 ? 'Aggiunto ' : 'Aggiunti ') + spokenList(a.aggiunte) + '.');
  if (a.gia.length) detto.push(spokenList(a.gia) + (a.gia.length === 1 ? ' c’era già.' : ' c’erano già.'));
  var corta = a.aggiunte.length > 2 ? 'Fatto, ' + quante(a.aggiunte.length, 'una cosa', 'cose') + ' aggiunte.' : '';
  return spesa(detto.join(' ') || 'Cosa devo aggiungere alla spesa?', corta);
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

// ---------- televisore ----------
//
// Tutto passa dal Chromecast attraverso Google: il pannello non parla mai
// con la TV. Accendi e spegni senza orario restano al ramo generale, che
// li tratta come per ogni altro dispositivo.

var TV_WORDS = /(^|[^a-z])(tv|tivu|tivvu|televisione|televisore|tele|chromecast)([^a-z]|$)/;

function tvCommand(text, raw, wantsOn, wantsOff){
  function tv(reply, azione, extra){
    return { reply: reply, screen: 'control', tab: 'tv', tv: azione ? { azione: azione, extra: extra || null } : null };
  }

  // Lo schermo di casa sulla TV parte solo con un tocco: Chrome non apre
  // l elenco dei Chromecast se la richiesta non viene da una persona.
  if (has(text, ['foto', 'cornice', 'schermo di casa', 'pannello'])) {
    return tv('Per portare le foto sulla TV tocca Porta sulla TV, qui nella scheda: Chrome lo apre solo con un tocco.');
  }

  if (!tvDevice()) {
    if (wantsOn || wantsOff) return null;
    return { reply: 'Non ho il televisore fra i dispositivi.', screen: 'control', tab: 'tv' };
  }

  // Spotify sulla TV passa da Spotify, non da Google.
  if (has(text, ['spotify', 'musica']) && !has(text, ['pausa', 'ferma', 'stop', 'spegn', 'volume'])) {
    return tv('Metto Spotify sulla TV.', 'spotify');
  }

  if (!isLive()) return notYet('tv', 'tv');

  if (has(text, ['annulla', 'cancella']) && has(text, ['spegn', 'timer'])) {
    return tv('Spegnimento della TV annullato.', 'annulla-spegnimento');
  }
  if (wantsOff && has(text, [' tra ', ' fra ', ' dopo ', 'timer', 'mezz'])) {
    // Le parole della TV vanno tolte: "televisore" finisce in "ore" e
    // verrebbe scambiato per una durata.
    var pulito = text.replace(TV_WORDS, ' ').replace(/’/g, "'").replace(/\bun' ?ora\b/, '1 ora');
    var t = parseTimer(pulito);
    if (!t) return tv('Fra quanto tempo devo spegnere la TV?');
    return tv('Spengo la TV fra ' + spokenDuration(t.seconds) + '.', 'spegni-fra',
              { minuti: Math.max(1, Math.round(t.seconds / 60)) });
  }

  // "disattiva l audio" contiene sia attiva sia disattiva: l audio va
  // guardato prima di accendere e spegnere.
  if (has(text, ['togli il muto', 'riattiva', 'rimetti l'])) return tv('Riattivo l’audio della TV.', 'audio');
  if (has(text, ['muto', 'silenzia', 'disattiva l', 'togli l'])) return tv('Tolgo l’audio alla TV.', 'muto');

  // Accendi e spegni senza orario: li fa il ramo generale.
  if (wantsOn || wantsOff) return null;

  if (has(text, ['volume', 'piu forte', 'piu piano', 'alza', 'abbassa'])) {
    var n = text.match(/(?:volume|al|a)\s+(\d{1,3})\b/);
    if (n) {
      var v = Math.max(0, Math.min(100, parseInt(n[1], 10)));
      return tv('Volume della TV al ' + v + ' per cento.', 'volume', { volume: v });
    }
    if (has(text, ['abbassa', 'piu piano', 'diminuisci'])) return tv('Abbasso il volume della TV.', 'volGiu');
    return tv('Alzo il volume della TV.', 'volSu');
  }

  if (has(text, ['riprendi', 'continua', 'fai ripartire', 'play'])) return tv('Riprendo sulla TV.', 'riprendi');
  if (has(text, ['pausa', 'ferma'])) return tv('Metto in pausa la TV.', 'pausa');
  if (has(text, ['stop', 'interrompi'])) return tv('Interrompo sulla TV.', 'stop');
  if (has(text, ['indietro'])) return tv('Torno indietro di trenta secondi.', 'indietro');
  if (has(text, ['avanti', 'salta'])) return tv('Vado avanti di trenta secondi.', 'avanti');

  // Cosa resta della frase togliendo i verbi, la TV e il nome dell app.
  var app = appIn(text);
  var cosa = senzaApp(text.replace(TV_WORDS, ' ').replace(/\b(su|da|con) youtube\b/g, ' '))
    .replace(/^\s*(apri|avvia|metti|guarda|riproduci|fammi vedere|cerca|trasmetti)\b/, ' ')
    .replace(/\b(su|sulla|sul|alla|in|nella|della|la|il|lo|l)\s*$/, ' ')
    .replace(/\s+/g, ' ').trim()
    .replace(/\s+(su|sulla|sul|alla|in|nella|della|la|il|lo|l)$/, '')
    .replace(/^(su|sulla|sul|alla|in|nella|della|la|il|lo|l)$/, '');

  var suYoutube = /\b(su|da|con) youtube\b/.test(text);
  if (app && !cosa) {
    if (googleTv()) return tv('Apro ' + app.nome + ' sulla TV.', 'app', { app: app.nome });
    return tv('Il Chromecast rotondo non ha app da aprire: dimmi cosa guardare, per esempio ' +
              'guarda i cartoni su YouTube sulla TV. ' + app.nome + ' si manda anche dal telefono, con il tasto Trasmetti.');
  }
  // "guarda Stranger Things su Netflix sulla TV": lo chiede a Google con il
  // nome giusto del Chromecast.
  if (app && cosa && app.nome !== 'YouTube') {
    return tv('Chiedo a Google ' + cosa + ' su ' + app.nome + ' per la TV.', 'guardaSu', { cosa: cosa, app: app.nome });
  }
  if (cosa && (suYoutube || !app) && has(text, ['metti', 'guarda', 'riproduci', 'fammi vedere', 'cerca', 'trasmetti'])) {
    return tv('Cerco ' + cosa + ' su YouTube per la TV.', 'guarda', { cosa: cosa });
  }

  // Tutto il resto, per esempio un film su Netflix, lo si chiede a Google
  // con le parole dette.
  return askGoogle(raw);
}

// I nomi delle app come si dicono a voce.
var APP_VOCE = [
  ['prime video', 'Prime Video'], ['amazon', 'Prime Video'], ['prime', 'Prime Video'],
  ['mediaset', 'Mediaset Infinity'], ['infinity', 'Mediaset Infinity'],
  ['disney', 'Disney+'], ['rai play', 'RaiPlay'], ['raiplay', 'RaiPlay']
];

function senzaApp(text){
  for (var i = 0; i < APPS.length; i++) text = text.split(fold(APPS[i]).replace('+', '').trim()).join(' ');
  for (var k = 0; k < APP_VOCE.length; k++) text = text.split(APP_VOCE[k][0]).join(' ');
  return text;
}

function appIn(text){
  for (var i = 0; i < APPS.length; i++) {
    var p = fold(APPS[i]).replace('+', '').trim();
    if (text.indexOf(p) !== -1) return { nome: APPS[i] };
  }
  for (var k = 0; k < APP_VOCE.length; k++) {
    if (text.indexOf(APP_VOCE[k][0]) !== -1) return { nome: APP_VOCE[k][1] };
  }
  return null;
}

function askGoogle(frase){
  return { reply: null, screen: 'control', google: frase };
}
