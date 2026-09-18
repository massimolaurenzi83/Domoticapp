// Disegno delle schermate e del pannello impostazioni.

import { SCHEMA, settings, save } from './config.js';
import { devices, scenes, speakers, toggle, runScene, needsBridge } from './devices.js';
import { wallpaperList, setWallpaper } from './wallpaper.js';
import { loadReminders, removeReminder, describeWhen } from './reminders.js';
import { renderSecurity } from './security-view.js';
import { sendMessage } from './intercom.js';
import { renderShopping, renderAlarms } from './extra-views.js';
import { renderRadio } from './radio-view.js';
import { profiles, profileName } from './profiles.js';

var GIORNI = ['domenica','lunedi','martedi','mercoledi','giovedi','venerdi','sabato'];
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
  var grid = document.createElement('div');
  grid.className = 'tile-grid';

  var items = [];
  if (tab === 'musica') {
    for (var s = 0; s < speakers.length; s++) items.push({ kind:'dev', d:speakers[s] });
  } else {
    for (var i = 0; i < devices.length; i++) {
      if (devices[i].room === tab) items.push({ kind:'dev', d:devices[i] });
    }
  }
  for (var k = 0; k < scenes.length; k++) {
    if (scenes[k].room === tab) items.push({ kind:'scene', d:scenes[k] });
  }

  for (var j = 0; j < items.length; j++) grid.appendChild(tile(items[j], onChange));

  body.innerHTML = '';
  body.appendChild(grid);
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
    note.textContent = 'Inviato. Arrivera al prossimo allineamento.';
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
  name.textContent = d.name;
  wrap.appendChild(name);

  var blocked = item.kind === 'dev' && needsBridge(d);

  if (item.kind === 'dev') {
    var st = document.createElement('div');
    st.className = 'tile-state';
    st.textContent = blocked ? 'serve il ponte' : (d.on ? 'acceso' : 'spento');
    wrap.appendChild(st);
  }

  if (blocked) el.style.opacity = '0.45';

  el.appendChild(g);
  el.appendChild(wrap);

  el.addEventListener('click', function(){
    if (item.kind === 'scene') runScene(d.id);
    else if (blocked) {
      el.lastChild.lastChild.textContent = 'raggiungibile solo da casa';
      setTimeout(function(){ el.lastChild.lastChild.textContent = 'serve il ponte'; }, 2500);
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
    if (f.type === 'wallpaper') {
      row.style.flexDirection = 'column';
      row.style.alignItems = 'stretch';
      lab.style.marginBottom = '10px';
      row.appendChild(wallpaperPicker(onApply));
    } else {
      row.appendChild(control(f, onApply));
    }
    host.appendChild(row);
  }
}

function wallpaperPicker(onApply){
  var strip = document.createElement('div');
  strip.style.cssText = 'display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;';
  var files = [''].concat(wallpaperList());

  for (var i = 0; i < files.length; i++) {
    (function(file){
      var b = document.createElement('button');
      b.type = 'button';
      var chosen = (settings.wallpaper || '') === file;
      b.style.cssText =
        'width:116px;height:72px;flex:none;border-radius:10px;cursor:pointer;' +
        'background:#1e2228 center/cover;color:#9aa0a8;font-family:inherit;font-size:13px;' +
        'border:2px solid ' + (chosen ? '#4a8fe0' : 'transparent') + ';';
      if (file) b.style.backgroundImage = 'url("wallpapers/' + file + '")';
      else b.textContent = 'Nessuno';

      b.addEventListener('click', function(){
        setWallpaper(file);
        var all = strip.getElementsByTagName('button');
        for (var k = 0; k < all.length; k++) all[k].style.borderColor = 'transparent';
        b.style.borderColor = '#4a8fe0';
        if (onApply) onApply('wallpaper');
      });
      strip.appendChild(b);
    })(files[i]);
  }

  if (files.length === 1) {
    var note = document.createElement('div');
    note.className = 'set-hint';
    note.textContent = 'Nessuna immagine trovata. Caricale nella cartella wallpapers e aggiungile a wallpapers/manifest.json';
    strip.appendChild(note);
  }
  return strip;
}

function control(f, onApply){
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
