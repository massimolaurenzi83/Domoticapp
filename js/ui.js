// Disegno delle schermate e del pannello impostazioni.

import { SCHEMA, settings, save } from './config.js';
import { devices, scenes, speakers, toggle, runScene, needsBridge, notConnected, isLive } from './devices.js';
import { wallpaperList, setWallpaper, loadWallpapers } from './wallpaper.js';
import { widgetChooser } from './widgets.js';
import { pickAndAdd, list as galleryList, urlFor, remove as galleryRemove } from './gallery.js';
import { rooms, roomName, isExampleLayout } from './devices.js';
import { loadReminders, removeReminder, describeWhen } from './reminders.js';
import { renderSecurity } from './security-view.js';
import { sendMessage } from './intercom.js';
import { renderShopping, renderAlarms } from './extra-views.js';
import { renderRadio } from './radio-view.js';
import { profiles, profileName } from './profiles.js';

var GIORNI = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];
var MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio',
            'agosto','settembre','ottobre','novembre','dicembre'];

export function two(n){ return n < 10 ? '0' + n : String(n); }

export function timeString(d){ return two(d.getHours()) + ':' + two(d.getMinutes()); }

export function dateString(d){
  return GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()];
}

export var agendaHooks = { onDictate: null, onProfile: null };
export var currentProfile = 'casa';

export function setCurrentProfile(id){ currentProfile = id; }

export function renderTab(tab, onChange){
  var body = document.getElementById('control-body');
  if (tab === 'agenda') { renderAgenda(body, onChange); return; }
  if (tab === 'sicurezza') { renderSecurity(body); return; }
  if (tab === 'spesa') { renderShopping(body); return; }
  if (tab === 'sveglia') { renderAlarms(body); return; }
  if (tab === 'radio') { renderRadio(body); return; }
  if (tab === 'casa') { renderHome(body, onChange); return; }

  var elenco = tab === 'musica'
    ? speakers.slice()
    : devices.filter(function(d){ return d.type === 'clima'; });
  var vuoto = tab === 'musica'
    ? 'Nessun altoparlante. Aggiungili dalla scheda Casa, con il tasto Modifica.'
    : 'Nessun climatizzatore. Aggiungilo dalla scheda Casa, con il tasto Modifica.';

  body.innerHTML = '';
  if (!elenco.length) {
    var v = document.createElement('div');
    v.className = 'set-hint';
    v.style.cssText = 'padding:24px 4px;font-size:16px;';
    v.textContent = vuoto;
    body.appendChild(v);
    return;
  }
  var grid = document.createElement('div');
  grid.className = 'room-grid';
  for (var j = 0; j < elenco.length; j++) {
    var d = elenco[j];
    var etichetta = { kind: 'dev', d: d, room: roomName(d.room) };
    grid.appendChild(tile(etichetta, onChange));
  }
  body.appendChild(grid);
}

export var homeHooks = { onEdit: null };

// La scheda Casa: le scene in cima, poi una sezione per ogni stanza con i
// suoi dispositivi. Gli altoparlanti stanno nella scheda Musica.
function renderHome(body, onChange){
  body.innerHTML = '';

  var top = document.createElement('div');
  top.className = 'home-top';

  var nota = document.createElement('div');
  nota.className = 'home-note';
  nota.textContent = isExampleLayout()
    ? 'Stanze e dispositivi di esempio. Tocca Modifica per mettere i tuoi.'
    : (isLive() ? '' : 'Da collegare a Google Home: per ora le caselle non comandano niente.');
  top.appendChild(nota);

  var edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'btn';
  edit.textContent = 'Modifica';
  edit.addEventListener('click', function(){ if (homeHooks.onEdit) homeHooks.onEdit(); });
  top.appendChild(edit);
  body.appendChild(top);

  if (scenes.length) {
    var sg = document.createElement('div');
    sg.className = 'room-grid';
    for (var k = 0; k < scenes.length; k++) sg.appendChild(tile({ kind: 'scene', d: scenes[k] }, onChange));
    body.appendChild(section('Scene', sg));
  }

  var visti = {};
  for (var r = 0; r < rooms.length; r++) {
    var room = rooms[r];
    var qui = devices.filter(function(d){ return d.room === room.id; });
    for (var q = 0; q < qui.length; q++) visti[qui[q].id] = true;
    if (!qui.length) continue;
    var g = document.createElement('div');
    g.className = 'room-grid';
    for (var i = 0; i < qui.length; i++) g.appendChild(tile({ kind: 'dev', d: qui[i] }, onChange));
    body.appendChild(section(room.name, g));
  }

  // Dispositivi rimasti senza una stanza valida: non devono sparire.
  var orfani = devices.filter(function(d){ return !visti[d.id]; });
  if (orfani.length) {
    var og = document.createElement('div');
    og.className = 'room-grid';
    for (var o = 0; o < orfani.length; o++) og.appendChild(tile({ kind: 'dev', d: orfani[o] }, onChange));
    body.appendChild(section('Senza stanza', og));
  }

  if (!devices.length && !scenes.length) {
    var vuoto = document.createElement('div');
    vuoto.className = 'set-hint';
    vuoto.style.cssText = 'padding:24px 4px;font-size:16px;';
    vuoto.textContent = 'Nessun dispositivo. Tocca Modifica per aggiungere stanze e dispositivi.';
    body.appendChild(vuoto);
  }
}

function section(title, content){
  var s = document.createElement('div');
  s.className = 'room-section';
  var h = document.createElement('div');
  h.className = 'room-title';
  h.textContent = title;
  s.appendChild(h);
  s.appendChild(content);
  return s;
}

// Manda un messaggio a chi e in casa. Il pannello di la lo legge ad alta
// voce e lo mostra a schermo.
function intercomBar(){
  var row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:10px;align-items:center;';

  var field = document.createElement('input');
  field.type = 'text';
  field.placeholder = 'Manda un messaggio in casa, per esempio torno alle otto';
  field.style.cssText = 'flex:1;background:#1e2228;border:1px solid #272c33;color:#f2f3f5;' +
    'font-family:inherit;font-size:16px;padding:14px;border-radius:10px;';

  var note = document.createElement('div');
  note.className = 'set-hint';
  note.style.cssText = 'min-width:150px;text-align:right;';

  function send(){
    var text = field.value.trim();
    if (!text) { note.textContent = 'Scrivi prima il messaggio.'; return; }
    sendMessage(text, profileName(currentProfile));
    field.value = '';
    note.textContent = 'Inviato. Arriverà al prossimo allineamento.';
    setTimeout(function(){ note.textContent = ''; }, 5000);
  }

  field.addEventListener('input', function(){
    if (note.textContent.indexOf('Scrivi') === 0) note.textContent = '';
  });
  field.addEventListener('keydown', function(ev){
    if (ev.key === 'Enter') send();
  });

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn';
  btn.textContent = 'Manda';
  btn.addEventListener('click', send);

  row.appendChild(field);
  row.appendChild(btn);
  row.appendChild(note);
  return row;
}

function renderAgenda(body, onChange){
  body.innerHTML = '';

  var wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;height:100%;gap:14px;';

  var top = document.createElement('div');
  top.style.cssText = 'display:flex;gap:12px;align-items:center;';

  var dictate = document.createElement('button');
  dictate.type = 'button';
  dictate.className = 'btn';
  dictate.style.cssText = 'flex:1;font-size:19px;padding:20px;background:#1d3a55;color:#e2eefb;';
  dictate.textContent = 'Detta un promemoria';
  dictate.addEventListener('click', function(){
    if (agendaHooks.onDictate) agendaHooks.onDictate();
  });
  top.appendChild(dictate);

  var people = profiles();
  for (var i = 0; i < people.length; i++) {
    (function(pr){
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.textContent = pr.name;
      b.style.borderBottom = '3px solid ' + (currentProfile === pr.id ? pr.color : 'transparent');
      b.addEventListener('click', function(){
        currentProfile = pr.id;
        renderAgenda(body, onChange);
        if (agendaHooks.onProfile) agendaHooks.onProfile(pr.id);
      });
      top.appendChild(b);
    })(people[i]);
  }
  wrap.appendChild(top);
  wrap.appendChild(intercomBar());

  var list = document.createElement('div');
  list.style.cssText = 'flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;';
  var items = loadReminders();

  if (!items.length) {
    var empty = document.createElement('div');
    empty.className = 'set-hint';
    empty.style.cssText = 'padding:26px 4px;font-size:16px;';
    empty.textContent = 'Nessun promemoria. Premi il tasto qui sopra e detta, oppure chiama il tablet per nome e digli di ricordarti qualcosa.';
    list.appendChild(empty);
  }

  for (var k = 0; k < items.length; k++) {
    (function(r){
      var row = document.createElement('div');
      row.style.cssText =
        'background:#1b1f25;border-radius:12px;padding:16px 18px;' +
        'display:flex;align-items:center;gap:16px;';

      var txt = document.createElement('div');
      txt.style.flex = '1';
      var t1 = document.createElement('div');
      t1.style.fontSize = '17px';
      t1.textContent = r.text;
      var t2 = document.createElement('div');
      t2.className = 'set-hint';
      t2.textContent = describeWhen(r.when) + '  ·  ' + profileName(r.profile) +
                       (r.synced ? '' : '  ·  non ancora sul calendario');
      txt.appendChild(t1); txt.appendChild(t2);

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn';
      del.textContent = '×';
      del.setAttribute('aria-label', 'Elimina promemoria');
      del.addEventListener('click', function(){
        removeReminder(r.id);
        renderAgenda(body, onChange);
      });

      row.appendChild(txt); row.appendChild(del);
      list.appendChild(row);
    })(items[k]);
  }

  wrap.appendChild(list);
  body.appendChild(wrap);
}

function tile(item, onChange){
  var d = item.d;
  var el = document.createElement('button');
  el.type = 'button';
  el.className = 'tile' + (item.kind === 'scene' ? ' tile-scene' : (d.on ? ' is-on' : ''));

  var g = document.createElement('div');
  g.className = 'tile-glyph';
  g.textContent = d.glyph;

  var wrap = document.createElement('div');
  var name = document.createElement('div');
  name.className = 'tile-name';
  name.textContent = item.room ? d.name + ', ' + item.room : d.name;
  wrap.appendChild(name);

  var bridgeMissing = item.kind === 'dev' && needsBridge(d);
  var blocked = item.kind === 'dev' ? notConnected(d) : !isLive();
  var blockedText = bridgeMissing ? 'serve il ponte' : 'da collegare';
  var blockedTap = bridgeMissing ? 'raggiungibile solo da casa'
    : (d.kind === 'speaker' ? 'la musica arriverà con Spotify' : 'si collega tramite Google Home');

  if (item.kind === 'scene' && blocked) {
    var sc = document.createElement('div');
    sc.className = 'tile-state';
    sc.textContent = 'da collegare';
    wrap.appendChild(sc);
  }

  if (item.kind === 'dev') {
    var st = document.createElement('div');
    st.className = 'tile-state';
    st.textContent = blocked ? blockedText : (d.on ? 'acceso' : 'spento');
    wrap.appendChild(st);
  }

  if (blocked) el.style.opacity = '0.45';

  el.appendChild(g);
  el.appendChild(wrap);

  el.addEventListener('click', function(){
    if (item.kind === 'scene') {
      if (!isLive()) {
        var hint = el.querySelector('.tile-state');
        if (hint) {
          hint.textContent = 'si collega tramite Google Home';
          setTimeout(function(){ hint.textContent = 'da collegare'; }, 2500);
        }
        return;
      }
      runScene(d.id);
    }
    else if (blocked) {
      el.lastChild.lastChild.textContent = blockedTap;
      setTimeout(function(){ el.lastChild.lastChild.textContent = blockedText; }, 2500);
      return;
    }
    else {
      toggle(d.id);
      el.className = 'tile' + (d.on ? ' is-on' : '');
      el.lastChild.lastChild.textContent = d.on ? 'acceso' : 'spento';
    }
    if (onChange) onChange();
  });

  return el;
}

export function buildSettings(onApply){
  var host = document.getElementById('set-grid');
  host.innerHTML = '';
  var lastGroup = '';

  for (var i = 0; i < SCHEMA.length; i++) {
    var f = SCHEMA[i];
    if (f.type === 'hidden') continue;

    if (f.group && f.group !== lastGroup) {
      lastGroup = f.group;
      var head = document.createElement('div');
      head.className = 'set-hint';
      head.style.cssText = 'margin:18px 0 2px;font-size:12px;letter-spacing:1px;text-transform:uppercase;';
      head.textContent = f.group;
      host.appendChild(head);
    }

    var row = document.createElement('div');
    row.className = 'set-row';

    var lab = document.createElement('div');
    lab.className = 'set-label';
    var t = document.createElement('div');
    t.textContent = f.label;
    lab.appendChild(t);
    if (f.hint) {
      var h = document.createElement('div');
      h.className = 'set-hint';
      h.textContent = f.hint;
      lab.appendChild(h);
    }
    row.appendChild(lab);
    if (f.type === 'wallpaper' || f.type === 'widgets' || f.type === 'photos') {
      row.style.flexDirection = 'column';
      row.style.alignItems = 'stretch';
      lab.style.marginBottom = '10px';
      if (f.type === 'wallpaper') row.appendChild(wallpaperPicker(onApply));
      if (f.type === 'widgets') row.appendChild(widgetChooser(function(){ if (onApply) onApply('homeWidgets'); }));
      if (f.type === 'photos') row.appendChild(photoManager(onApply));
    } else {
      row.appendChild(control(f, onApply));
    }
    host.appendChild(row);
  }
}

function wallpaperPicker(onApply){
  var wrap = document.createElement('div');
  var strip = document.createElement('div');
  strip.style.cssText = 'display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;';
  wrap.appendChild(strip);

  function paint(){
    strip.innerHTML = '';
    var voci = [{ value: '', url: '' }].concat(wallpaperList());

    for (var i = 0; i < voci.length; i++) {
      (function(v){
        var b = document.createElement('button');
        b.type = 'button';
        var chosen = (settings.wallpaper || '') === v.value;
        b.style.cssText =
          'width:116px;height:72px;flex:none;border-radius:10px;position:relative;' +
          'background:#1e2228 center/cover;color:#9aa0a8;font-family:inherit;font-size:13px;' +
          'border:2px solid ' + (chosen ? '#4a8fe0' : 'transparent') + ';';
        if (v.url) b.style.backgroundImage = 'url("' + v.url + '")';
        else b.textContent = 'Nessuno';

        b.addEventListener('click', function(){
          setWallpaper(v.value);
          paint();
          if (onApply) onApply('wallpaper');
        });
        strip.appendChild(b);
      })(voci[i]);
    }
  }

  var add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn';
  add.style.marginTop = '10px';
  add.textContent = 'Aggiungi uno sfondo dalla galleria';
  var esito = document.createElement('div');
  esito.className = 'set-hint';
  add.addEventListener('click', function(){
    esito.textContent = 'Scegli un’immagine...';
    pickAndAdd('wallpaper', false).then(function(r){
      if (!r.salvate) { esito.textContent = r.scartate ? 'Immagine non leggibile.' : ''; return; }
      return loadWallpapers().then(function(){
        var mie = wallpaperList().filter(function(x){ return x.own; });
        if (mie.length) setWallpaper(mie[mie.length - 1].value);
        esito.textContent = 'Sfondo aggiunto e scelto.';
        paint();
        if (onApply) onApply('wallpaper');
      });
    });
  });
  wrap.appendChild(add);
  wrap.appendChild(esito);

  paint();
  return wrap;
}

// Le foto della cornice aggiunte dal tablet: anteprime da cancellare con
// un tocco, e il tasto per aggiungerne di nuove dalla galleria.
function photoManager(onApply){
  var wrap = document.createElement('div');
  var strip = document.createElement('div');
  strip.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
  var esito = document.createElement('div');
  esito.className = 'set-hint';

  function paint(){
    galleryList('photo').then(function(foto){
      strip.innerHTML = '';
      if (!foto.length) {
        var vuoto = document.createElement('div');
        vuoto.className = 'set-hint';
        vuoto.textContent = 'Nessuna foto ancora. Finché non ne aggiungi, al posto della cornice resta la stazione meteo.';
        strip.appendChild(vuoto);
      }
      foto.forEach(function(rec){
        var t = document.createElement('div');
        t.style.cssText = 'width:96px;height:64px;border-radius:8px;background:#1e2228 center/cover;position:relative;';
        t.style.backgroundImage = 'url("' + urlFor(rec) + '")';
        var x = document.createElement('button');
        x.type = 'button';
        x.textContent = '\u00D7';
        x.setAttribute('aria-label', 'Togli questa foto');
        x.style.cssText = 'position:absolute;top:2px;right:2px;width:28px;height:28px;border-radius:50%;' +
          'border:0;background:rgba(0,0,0,.7);color:#fff;font-size:17px;';
        x.addEventListener('click', function(){
          galleryRemove(rec.id).then(function(){ paint(); if (onApply) onApply('photos'); });
        });
        t.appendChild(x);
        strip.appendChild(t);
      });
    });
  }

  var add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn';
  add.style.marginTop = '10px';
  add.textContent = 'Aggiungi foto dalla galleria';
  add.addEventListener('click', function(){
    esito.textContent = 'Scegli una o più foto...';
    pickAndAdd('photo', true).then(function(r){
      esito.textContent = r.salvate
        ? 'Aggiunte ' + r.salvate + (r.salvate === 1 ? ' foto.' : ' foto.') + (r.scartate ? ' ' + r.scartate + ' non leggibili.' : '')
        : (r.scartate ? 'Le immagini scelte non sono leggibili.' : '');
      paint();
      if (r.salvate && onApply) onApply('photos');
    });
  });

  wrap.appendChild(strip);
  wrap.appendChild(add);
  wrap.appendChild(esito);
  paint();
  return wrap;
}

function control(f, onApply){
  if (f.type === 'choice') {
    var sel = document.createElement('select');
    sel.className = 'ed-select';
    sel.style.width = '190px';
    sel.style.flex = 'none';
    for (var k in f.options) {
      var o = document.createElement('option');
      o.value = k;
      o.textContent = f.options[k];
      sel.appendChild(o);
    }
    sel.value = settings[f.id] || '';
    sel.addEventListener('change', function(){
      settings[f.id] = sel.value;
      save(); if (onApply) onApply(f.id);
    });
    return sel;
  }

  if (f.type === 'bool') {
    var sw = document.createElement('button');
    sw.type = 'button';
    sw.className = 'switch' + (settings[f.id] ? ' is-on' : '');
    sw.setAttribute('aria-label', f.label);
    sw.addEventListener('click', function(){
      settings[f.id] = !settings[f.id];
      sw.className = 'switch' + (settings[f.id] ? ' is-on' : '');
      save(); if (onApply) onApply(f.id);
    });
    return sw;
  }

  var input = document.createElement('input');
  input.type = f.type === 'time' ? 'time' : (f.type === 'num' ? 'number' : 'text');
  input.value = settings[f.id];
  if (f.type === 'num') { input.min = f.min; input.max = f.max; }

  input.addEventListener('change', function(){
    var v = input.value;
    if (f.type === 'num') {
      v = parseInt(v, 10);
      if (isNaN(v)) v = f.def;
      v = Math.max(f.min, Math.min(f.max, v));
      input.value = v;
    }
    settings[f.id] = v;
    save(); if (onApply) onApply(f.id);
  });
  return input;
}
