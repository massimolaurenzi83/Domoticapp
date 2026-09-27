// Scheda Musica: Spotify sui Nest di casa.

import {
  spotifyReady, spotifyState, spotifyPlaylists, checkSpotify, loadPlaylists, spotifyCommand
} from './spotify.js';

var scelto = '';        // altoparlante scelto a mano per le playlist
var corpo = null;
var avviso = null;

export function renderMusic(body){
  corpo = body;
  body.innerHTML = '';

  if (!spotifyReady()) {
    var v = document.createElement('div');
    v.className = 'set-hint';
    v.style.cssText = 'padding:24px 4px;font-size:18px;line-height:1.5;';
    v.textContent = 'Spotify non è ancora collegato. Si collega dal computer con lo script ' +
      'spotify/autorizza.mjs. Nel frattempo la musica si chiede direttamente ai Nest.';
    body.appendChild(v);
    checkSpotify().then(function(){ if (spotifyReady() && corpo === body) renderMusic(body); });
    return;
  }

  var wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:14px;';
  wrap.appendChild(barra());

  avviso = document.createElement('div');
  avviso.className = 'set-hint';
  avviso.style.cssText = 'font-size:16px;min-height:1em;';
  wrap.appendChild(avviso);

  wrap.appendChild(titolo('Altoparlanti'));
  // Spotify fa vedere ai programmi come questo solo il Nest che sta
  // suonando: gli altri li trova solo l app sul telefono, in casa.
  var nota = document.createElement('div');
  nota.className = 'set-hint';
  nota.style.cssText = 'font-size:15px;line-height:1.45;margin-top:-4px;';
  nota.textContent = 'Qui compare solo il Nest che sta suonando. Per cambiare Nest usa l’app Spotify ' +
    'sul telefono, icona degli altoparlanti.';
  wrap.appendChild(nota);
  wrap.appendChild(altoparlanti());
  wrap.appendChild(titolo('Le tue playlist'));
  var pl = document.createElement('div');
  pl.className = 'music-grid';
  wrap.appendChild(pl);
  body.appendChild(wrap);

  riempiPlaylist(pl);
  if (!spotifyPlaylists().length) loadPlaylists().then(function(){ riempiPlaylist(pl); });
}

function titolo(t){
  var h = document.createElement('div');
  h.className = 'room-title';
  h.textContent = t;
  return h;
}

function pulsante(testo, fn, grande){
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn music-btn' + (grande ? ' music-btn-big' : '');
  b.textContent = testo;
  b.addEventListener('click', fn);
  return b;
}

// Cosa suona adesso, con i comandi principali.
function barra(){
  var st = spotifyState() || {};
  var bar = document.createElement('div');
  bar.className = 'music-now';

  var info = document.createElement('div');
  info.style.cssText = 'flex:1;min-width:0;';
  var t = document.createElement('div');
  t.className = 'music-title';
  t.textContent = st.titolo || (st.suona ? 'In riproduzione' : 'Niente in riproduzione');
  var a = document.createElement('div');
  a.className = 'set-hint';
  a.style.fontSize = '16px';
  a.textContent = [st.artista, st.dispositivo ? 'su ' + st.dispositivo : '',
    st.volume != null ? 'volume ' + st.volume : ''].filter(Boolean).join('  ·  ');
  info.appendChild(t);
  info.appendChild(a);
  bar.appendChild(info);

  var comandi = document.createElement('div');
  comandi.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
  // Parole invece dei simboli: il tablet vecchio mostra i simboli ⏮ ⏸ ⏭
  // come quadratini vuoti.
  comandi.appendChild(pulsante('« Prec.', function(){ invia({ azione: 'precedente' }); }));
  comandi.appendChild(pulsante(st.suona ? 'Pausa' : 'Play', function(){ invia({ azione: st.suona ? 'pausa' : 'play' }); }, true));
  comandi.appendChild(pulsante('Succ. »', function(){ invia({ azione: 'successivo' }); }));
  comandi.appendChild(pulsante('Vol −', function(){ volume(-10); }));
  comandi.appendChild(pulsante('Vol +', function(){ volume(10); }));
  bar.appendChild(comandi);
  return bar;
}

function volume(passo){
  var st = spotifyState() || {};
  var v = st.volume == null ? 50 : st.volume;
  invia({ azione: 'volume', volume: Math.max(0, Math.min(100, v + passo)) });
}

// Gli altoparlanti come li vede Spotify. Toccarne uno ci sposta la musica.
function altoparlanti(){
  var st = spotifyState() || {};
  var lista = st.dispositivi || [];
  var grid = document.createElement('div');
  grid.className = 'music-grid';
  if (!lista.length) {
    var v = document.createElement('div');
    v.className = 'set-hint';
    v.style.cssText = 'grid-column:1 / -1;font-size:16px;line-height:1.5;';
    v.textContent = 'Non suona niente. Per scegliere il Nest apri l’app Spotify sul telefono, ' +
      'tocca l’icona degli altoparlanti e scegli dove suonare: da qui poi la comandi.';
    grid.appendChild(v);
    return grid;
  }
  lista.forEach(function(d){
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'tile' + (d.attivo ? ' is-on' : '') + (scelto === d.id ? ' music-chosen' : '');
    b.innerHTML = '<span class="tile-glyph">♪</span>';
    var w = document.createElement('div');
    var n = document.createElement('div');
    n.className = 'tile-name';
    n.textContent = d.nome;
    var s = document.createElement('div');
    s.className = 'tile-state';
    s.textContent = d.attivo ? (st.suona ? 'sta suonando' : 'in pausa') : 'tocca per suonare qui';
    w.appendChild(n);
    w.appendChild(s);
    b.appendChild(w);
    b.addEventListener('click', function(){
      scelto = d.id;
      invia({ azione: 'play', dispositivo: d.id }, 'Sposto la musica su ' + d.nome + '...');
    });
    grid.appendChild(b);
  });
  return grid;
}

function riempiPlaylist(grid){
  grid.innerHTML = '';
  var lista = spotifyPlaylists();
  if (!lista.length) {
    var v = document.createElement('div');
    v.className = 'set-hint';
    v.style.cssText = 'grid-column:1 / -1;font-size:16px;';
    v.textContent = 'Carico le playlist...';
    grid.appendChild(v);
    return;
  }
  lista.forEach(function(p){
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'tile tile-scene';
    b.innerHTML = '<span class="tile-glyph">♫</span>';
    var n = document.createElement('div');
    n.className = 'tile-name';
    n.textContent = p.nome;
    b.appendChild(n);
    b.addEventListener('click', function(){
      var st = spotifyState() || {};
      var dove = scelto || st.dispositivoId || '';
      if (!dove && !(st.dispositivi || []).length) {
        mostra('Prima scegli un altoparlante qui sopra.');
        return;
      }
      invia({ azione: 'play', uri: p.uri, dispositivo: dove || (st.dispositivi[0] && st.dispositivi[0].id) }, 'Faccio partire ' + p.nome + '...');
    });
    grid.appendChild(b);
  });
}

function mostra(t){ if (avviso) avviso.textContent = t; }

// Manda il comando, poi rilegge lo stato e ridisegna la scheda.
function invia(c, messaggio){
  mostra(messaggio || 'Un attimo...');
  var body = corpo;
  spotifyCommand(c).then(function(r){
    if (!r.ok) { mostra('Non riuscito: ' + r.errore + '.'); return; }
    setTimeout(function(){
      checkSpotify().then(function(){ if (corpo === body && body.isConnected) renderMusic(body); });
    }, 900);
  });
}
