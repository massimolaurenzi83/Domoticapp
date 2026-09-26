// Modifica di stanze, dispositivi e scene, direttamente dal pannello.
//
// Si apre dalla scheda Casa. Le modifiche restano in una copia finche non
// premi Salva, cosi puoi sempre annullare. Il nome in Google Home serve
// per comandare il dispositivo attraverso Google: va scritto uguale a come
// compare nell app Google Home.

import { TYPES, VIAS, currentLayout, saveLayout, resetToExample, newId, isExampleLayout } from './devices.js';

var draft = null;
var original = '';
var onSaved = null;
var sheet = null;

function el(tag, cls, text){
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function input(value, placeholder){
  var i = el('input', 'ed-input');
  i.type = 'text';
  i.value = value || '';
  if (placeholder) i.placeholder = placeholder;
  return i;
}

function select(options, value){
  var s = el('select', 'ed-select');
  for (var k in options) {
    var o = el('option', null, options[k]);
    o.value = k;
    s.appendChild(o);
  }
  s.value = value;
  return s;
}

function button(text, cls){
  var b = el('button', cls || 'btn', text);
  b.type = 'button';
  return b;
}

export function openHomeEditor(savedCallback){
  onSaved = savedCallback;
  draft = currentLayout();
  if (!draft.scenes) draft.scenes = [];
  original = JSON.stringify(draft);

  if (!sheet) {
    sheet = el('div', 'sheet');
    sheet.id = 'home-editor';
    document.body.appendChild(sheet);
  }
  sheet.hidden = false;
  paint();
}

function close(){
  if (sheet) sheet.hidden = true;
  draft = null;
}

function roomOptions(){
  var o = {};
  for (var i = 0; i < draft.rooms.length; i++) o[draft.rooms[i].id] = draft.rooms[i].name || 'senza nome';
  return o;
}

function paint(scrollTo){
  var keepScroll = sheet.firstChild ? sheet.firstChild.scrollTop : 0;
  sheet.innerHTML = '';

  var inner = el('div', 'sheet-inner ed-inner');
  sheet.appendChild(inner);

  var back = el('button', 'btn-back');
  back.type = 'button';
  back.innerHTML = '&#8592; Indietro';
  back.addEventListener('click', function(){
    if (JSON.stringify(draft) !== original &&
        !window.confirm('Uscire senza salvare le modifiche?')) return;
    close();
  });
  inner.appendChild(back);

  inner.appendChild(el('h2', null, 'Stanze e dispositivi'));
  if (isExampleLayout()) {
    inner.appendChild(el('p', 'set-hint',
      'Quelle che vedi sono di esempio. Rinominale, cancellale e aggiungi le tue: ' +
      'il pannello userà esattamente queste.'));
  }

  var msg = el('div', 'ed-msg');

  // ---- stanze ----
  inner.appendChild(el('div', 'ed-section', 'Stanze'));
  draft.rooms.forEach(function(r){
    var row = el('div', 'ed-row');
    var name = input(r.name, 'nome della stanza');
    name.addEventListener('input', function(){ r.name = name.value; });
    name.addEventListener('change', function(){ paint(); });

    var del = button('×', 'icon-btn');
    del.setAttribute('aria-label', 'Elimina stanza');
    del.addEventListener('click', function(){
      var dentro = draft.devices.filter(function(d){ return d.room === r.id; }).length;
      if (dentro) {
        msg.textContent = 'In ' + (r.name || 'questa stanza') + ' ci sono ancora ' + dentro +
          ' dispositivi. Spostali o eliminali prima.';
        return;
      }
      draft.rooms = draft.rooms.filter(function(x){ return x !== r; });
      paint();
    });

    row.appendChild(name);
    row.appendChild(del);
    inner.appendChild(row);
  });

  var addRoom = button('Aggiungi una stanza');
  addRoom.addEventListener('click', function(){
    draft.rooms.push({ id: newId('r'), name: '' });
    paint('end');
  });
  inner.appendChild(addRoom);

  // ---- dispositivi ----
  inner.appendChild(el('div', 'ed-section', 'Dispositivi'));
  inner.appendChild(el('p', 'set-hint',
    'Il nome in Google Home va scritto come compare nell’app Google Home: è quello che ' +
    'servirà per comandarlo davvero.'));

  var tipi = {};
  for (var t in TYPES) tipi[t] = TYPES[t].label;

  draft.devices.forEach(function(d){
    var box = el('div', 'ed-device');

    var top = el('div', 'ed-row');
    var name = input(d.name, 'nome sul pannello, per esempio Lampadario');
    name.addEventListener('input', function(){ d.name = name.value; });
    var del = button('×', 'icon-btn');
    del.setAttribute('aria-label', 'Elimina dispositivo');
    del.addEventListener('click', function(){
      draft.devices = draft.devices.filter(function(x){ return x !== d; });
      draft.scenes.forEach(function(s){
        s.actions = (s.actions || []).filter(function(a){ return a.device !== d.id; });
      });
      paint();
    });
    top.appendChild(name);
    top.appendChild(del);

    var grid = el('div', 'ed-grid');

    var tipo = select(tipi, d.type);
    tipo.addEventListener('change', function(){ d.type = tipo.value; });

    var stanza = select(roomOptions(), d.room);
    stanza.addEventListener('change', function(){ d.room = stanza.value; });

    var google = input(d.google, 'nome in Google Home');
    google.addEventListener('input', function(){ d.google = google.value; });

    var via = select(VIAS, d.via || 'google');
    via.addEventListener('change', function(){ d.via = via.value; });

    grid.appendChild(labelled('Tipo', tipo));
    grid.appendChild(labelled('Stanza', stanza));
    grid.appendChild(labelled('Nome in Google Home', google));
    grid.appendChild(labelled('Collegato tramite', via));

    box.appendChild(top);
    box.appendChild(grid);
    inner.appendChild(box);
  });

  var addDev = button('Aggiungi un dispositivo');
  addDev.addEventListener('click', function(){
    if (!draft.rooms.length) { msg.textContent = 'Aggiungi prima almeno una stanza.'; return; }
    draft.devices.push({ id: newId('d'), name: '', room: draft.rooms[0].id,
                         type: 'luce', google: '', via: 'google' });
    paint('end');
  });
  inner.appendChild(addDev);

  // ---- scene ----
  inner.appendChild(el('div', 'ed-section', 'Scene'));
  inner.appendChild(el('p', 'set-hint',
    'Una scena accende o spegne più cose con un tocco. Per ogni dispositivo scegli cosa fare.'));

  draft.scenes.forEach(function(s){
    var box = el('div', 'ed-device');
    var top = el('div', 'ed-row');
    var name = input(s.name, 'nome della scena, per esempio Film');
    name.addEventListener('input', function(){ s.name = name.value; });
    var del = button('×', 'icon-btn');
    del.setAttribute('aria-label', 'Elimina scena');
    del.addEventListener('click', function(){
      draft.scenes = draft.scenes.filter(function(x){ return x !== s; });
      paint();
    });
    top.appendChild(name);
    top.appendChild(del);
    box.appendChild(top);

    var grid = el('div', 'ed-grid');
    grid.appendChild(labelled('Tutte le luci', select(
      { '': 'non toccare', on: 'accendi', off: 'spegni' }, s.allLights || ''), function(v){ s.allLights = v || null; }));
    grid.appendChild(labelled('Tutti gli altoparlanti', select(
      { '': 'non toccare', off: 'spegni' }, s.allSpeakers || ''), function(v){ s.allSpeakers = v || null; }));

    draft.devices.forEach(function(d){
      var cur = '';
      (s.actions || []).forEach(function(a){ if (a.device === d.id) cur = a.on ? 'on' : 'off'; });
      var roomLabel = (roomOptions()[d.room] || '');
      grid.appendChild(labelled((d.name || 'senza nome') + (roomLabel ? ', ' + roomLabel : ''),
        select({ '': 'non toccare', on: 'accendi', off: 'spegni' }, cur),
        function(v){
          s.actions = (s.actions || []).filter(function(a){ return a.device !== d.id; });
          if (v) s.actions.push({ device: d.id, on: v === 'on' });
        }));
    });

    box.appendChild(grid);
    inner.appendChild(box);
  });

  var addScene = button('Aggiungi una scena');
  addScene.addEventListener('click', function(){
    draft.scenes.push({ id: newId('s'), name: '', actions: [] });
    paint('end');
  });
  inner.appendChild(addScene);

  // ---- azioni ----
  inner.appendChild(msg);

  var actions = el('div', 'sheet-actions');
  var saveBtn = button('Salva', 'btn btn-go');
  saveBtn.addEventListener('click', function(){
    var problema = validate();
    if (problema) { msg.textContent = problema; return; }
    saveLayout(draft);
    close();
    if (onSaved) onSaved();
  });
  var cancel = button('Annulla');
  cancel.addEventListener('click', close);
  var reset = button('Torna all’esempio');
  reset.addEventListener('click', function(){
    if (!window.confirm('Rimettere stanze e dispositivi di esempio? Le tue modifiche andranno perse.')) return;
    resetToExample();
    close();
    if (onSaved) onSaved();
  });
  actions.appendChild(cancel);
  actions.appendChild(reset);
  actions.appendChild(saveBtn);
  inner.appendChild(actions);

  inner.scrollTop = scrollTo === 'end' ? inner.scrollHeight : keepScroll;
}

// Un campo con la sua etichetta sopra. Se passi una funzione, viene
// chiamata con il nuovo valore a ogni cambio.
function labelled(text, control, onChange){
  var w = el('label', 'ed-field');
  w.appendChild(el('span', null, text));
  w.appendChild(control);
  if (onChange) control.addEventListener('change', function(){ onChange(control.value); });
  return w;
}

function validate(){
  for (var i = 0; i < draft.rooms.length; i++) {
    if (!String(draft.rooms[i].name || '').trim()) return 'C’è una stanza senza nome.';
  }
  for (var k = 0; k < draft.devices.length; k++) {
    if (!String(draft.devices[k].name || '').trim()) return 'C’è un dispositivo senza nome.';
  }
  for (var s = 0; s < draft.scenes.length; s++) {
    if (!String(draft.scenes[s].name || '').trim()) return 'C’è una scena senza nome.';
  }
  return '';
}
