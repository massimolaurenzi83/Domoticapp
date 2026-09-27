// Scheda Radio.

import {
  searchStations, topStations, play, stop, playing,
  favourites, isFavourite, toggleFavourite, onRadioState, lastStation,
  castInfo, onCastChange, castToNest
} from './radio.js';

var castBtn = null;
var castRegistered = false;

var statusLine = null;

export function renderRadio(body){
  body.innerHTML = '';

  var wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;height:100%;gap:12px;';

  wrap.appendChild(searchBar(body));
  wrap.appendChild(nowBar());

  var grid = document.createElement('div');
  grid.className = 'radio-grid';
  grid.style.cssText = 'flex:1;overflow-y:auto;display:grid;' +
    'grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;align-content:start;';
  wrap.appendChild(grid);

  body.appendChild(wrap);

  var favs = favourites();
  if (favs.length) fill(grid, favs, body, 'Le tue preferite');
  else {
    loading(grid, 'Cerco le stazioni più ascoltate in Italia...');
    topStations('IT', 30)
      .then(function(list){ fill(grid, list, body); })
      .catch(function(){ loading(grid, 'Archivio non raggiungibile. Controlla la rete e riprova.'); });
  }

  onRadioState(function(state){
    if (statusLine) statusLine.textContent = state;
  });
}

function searchBar(body){
  var row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:10px;';

  var field = document.createElement('input');
  field.type = 'text';
  field.placeholder = 'Cerca una stazione, per esempio Radio Deejay oppure jazz';
  field.style.cssText = 'flex:1;background:#1e2228;border:1px solid #272c33;color:#f2f3f5;' +
    'font-family:inherit;font-size:17px;padding:15px;border-radius:10px;';

  function go(){
    var grid = body.querySelector('.radio-grid');
    if (!field.value.trim()) return;
    loading(grid, 'Cerco...');
    searchStations(field.value.trim(), 40)
      .then(function(list){
        if (!list.length) loading(grid, 'Nessuna stazione trovata con questo nome.');
        else fill(grid, list, body);
      })
      .catch(function(){ loading(grid, 'Archivio non raggiungibile.'); });
  }
  field.addEventListener('keydown', function(ev){ if (ev.key === 'Enter') go(); });

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn';
  btn.textContent = 'Cerca';
  btn.addEventListener('click', go);

  var favBtn = document.createElement('button');
  favBtn.type = 'button';
  favBtn.className = 'btn';
  favBtn.textContent = 'Preferite';
  favBtn.addEventListener('click', function(){
    var grid = body.querySelector('.radio-grid');
    var favs = favourites();
    if (!favs.length) loading(grid, 'Nessuna preferita. Tieni premuto su una stazione per aggiungerla.');
    else fill(grid, favs, body);
  });

  row.appendChild(field);
  row.appendChild(btn);
  row.appendChild(favBtn);
  return row;
}

function nowBar(){
  var bar = document.createElement('div');
  bar.style.cssText = 'background:#14171b;border-radius:12px;padding:14px 16px;display:flex;align-items:center;gap:14px;';

  var name = document.createElement('div');
  name.className = 'radio-now';
  name.style.cssText = 'flex:1;font-size:17px;';
  var cur = playing() || lastStation();
  name.textContent = cur ? cur.name : 'Nessuna stazione in onda';

  statusLine = document.createElement('div');
  statusLine.className = 'set-hint';
  statusLine.textContent = playing() ? 'in onda' : '';

  var stopBtn = document.createElement('button');
  stopBtn.type = 'button';
  stopBtn.className = 'btn';
  stopBtn.textContent = 'Ferma';
  stopBtn.addEventListener('click', function(){
    stop();
    name.textContent = 'Nessuna stazione in onda';
  });

  bar.appendChild(name);
  bar.appendChild(statusLine);

  // Trasmissione a un Nest: il pulsante c e solo dove Chrome lo permette.
  var info = castInfo();
  if (info.supported && info.available !== false) {
    castBtn = document.createElement('button');
    castBtn.type = 'button';
    castBtn.className = 'btn';
    castBtn.textContent = info.state === 'connected' ? 'Torna sul tablet' : 'Ascolta su un Nest';
    castBtn.addEventListener('click', function(){
      castToNest().then(function(msg){ if (msg) statusLine.textContent = msg; });
    });
    bar.appendChild(castBtn);
  } else {
    castBtn = null;
  }
  if (!castRegistered) {
    castRegistered = true;
    onCastChange(function(i){
      if (!castBtn || !castBtn.isConnected) return;
      castBtn.textContent = i.state === 'connected' ? 'Torna sul tablet'
        : (i.state === 'connecting' ? 'Collego il Nest...' : 'Ascolta su un Nest');
      castBtn.hidden = i.available === false;
    });
  }

  bar.appendChild(stopBtn);
  return bar;
}

function loading(grid, text){
  grid.innerHTML = '';
  var d = document.createElement('div');
  d.className = 'set-hint';
  d.style.cssText = 'padding:20px 4px;grid-column:1 / -1;';
  d.textContent = text;
  grid.appendChild(d);
}

function fill(grid, list, body, title){
  grid.innerHTML = '';

  if (title) {
    var h = document.createElement('div');
    h.className = 'set-hint';
    h.style.cssText = 'grid-column:1 / -1;font-size:12px;letter-spacing:1px;text-transform:uppercase;';
    h.textContent = title;
    grid.appendChild(h);
  }

  for (var i = 0; i < list.length; i++) {
    (function(st){
      var card = document.createElement('button');
      card.type = 'button';
      card.style.cssText = 'background:#1b1f25;border:0;border-radius:12px;padding:14px;' +
        'color:#f2f3f5;font-family:inherit;text-align:left;display:flex;' +
        'flex-direction:column;gap:6px;min-height:86px;';

      var name = document.createElement('div');
      name.style.cssText = 'font-size:16px;line-height:1.25;';
      name.textContent = st.name;

      var meta = document.createElement('div');
      meta.className = 'set-hint';
      meta.textContent = [st.country, st.tags].filter(Boolean).join('  ·  ');

      card.appendChild(name);
      card.appendChild(meta);

      if (isFavourite(st.id)) {
        var star = document.createElement('div');
        star.textContent = '★';
        star.style.cssText = 'color:#f0b429;font-size:13px;';
        card.appendChild(star);
      }

      card.addEventListener('click', function(){
        play(st);
        var bar = body.querySelector('.radio-now');
        if (bar) bar.textContent = st.name;
      });

      // Tenere premuto aggiunge o toglie dalle preferite.
      var held = null;
      card.addEventListener('touchstart', function(){
        held = setTimeout(function(){ flip(st, card); }, 650);
      });
      card.addEventListener('touchend', function(){ if (held) clearTimeout(held); });
      card.addEventListener('contextmenu', function(ev){
        ev.preventDefault();
        flip(st, card);
      });

      grid.appendChild(card);
    })(list[i]);
  }
}

function flip(station, card){
  var added = toggleFavourite(station);
  card.style.outline = added ? '2px solid #f0b429' : 'none';
}
