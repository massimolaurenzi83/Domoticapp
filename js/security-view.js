// Scheda Sicurezza: sentinella, telecamere e allarmi registrati.

import { FAMILIES, loadCameras, addCamera, removeCamera, buildBridgeConfig } from './cameras.js';
import { listEvents, clearAll, storageInfo } from './sentinel.js';
import { settings } from './config.js';

export var securityHooks = { onArm: null, onDisarm: null, isArmed: null };

export function renderSecurity(body){
  body.innerHTML = '';

  var wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;gap:16px;height:100%;';

  var left = document.createElement('div');
  left.style.cssText = 'width:340px;display:flex;flex-direction:column;gap:12px;';
  left.appendChild(armBox());
  left.appendChild(cameraBox(body));
  wrap.appendChild(left);

  var right = document.createElement('div');
  right.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:10px;min-width:0;';
  right.appendChild(header('Allarmi registrati'));

  var events = document.createElement('div');
  events.style.cssText = 'flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:8px;';
  right.appendChild(events);

  var foot = document.createElement('div');
  foot.className = 'set-hint';
  right.appendChild(foot);

  wrap.appendChild(right);
  body.appendChild(wrap);

  fillEvents(events, foot);
  return wrap;
}

function header(text){
  var h = document.createElement('div');
  h.className = 'set-hint';
  h.style.cssText = 'font-size:12px;letter-spacing:1px;text-transform:uppercase;';
  h.textContent = text;
  return h;
}

function repaint(){
  renderSecurity(document.getElementById('control-body'));
}

function armBox(){
  var box = document.createElement('div');
  box.style.cssText = 'background:#14171b;border-radius:12px;padding:18px;';

  var armed = securityHooks.isArmed ? securityHooks.isArmed() : false;

  var title = document.createElement('div');
  title.style.cssText = 'font-size:19px;margin-bottom:4px;';
  title.textContent = armed ? 'Sentinella armata' : 'Sentinella disarmata';

  var sub = document.createElement('div');
  sub.className = 'set-hint';
  sub.textContent = armed
    ? 'La ripresa e silente. Nessuna spia a schermo.'
    : 'Da armare prima di partire. Poi riprende senza mostrarlo.';

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn';
  btn.style.cssText = 'width:100%;margin-top:14px;font-size:18px;padding:18px;' +
    (armed ? 'background:#5a1f1f;' : 'background:#1d5c2e;');
  btn.textContent = armed ? 'Disarma' : 'Arma la sentinella';
  btn.addEventListener('click', function(){
    if (armed) { if (securityHooks.onDisarm) securityHooks.onDisarm(); }
    else { if (securityHooks.onArm) securityHooks.onArm(); }
    repaint();
  });

  box.appendChild(title);
  box.appendChild(sub);
  box.appendChild(btn);
  return box;
}

function cameraBox(body){
  var box = document.createElement('div');
  box.style.cssText = 'background:#14171b;border-radius:12px;padding:18px;flex:1;overflow-y:auto;';
  box.appendChild(header('Telecamere'));

  var list = loadCameras();
  for (var i = 0; i < list.length; i++) {
    (function(cam){
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #272c33;';

      var t = document.createElement('div');
      t.style.flex = '1';
      var n = document.createElement('div');
      n.textContent = cam.name;
      var d = document.createElement('div');
      d.className = 'set-hint';
      d.textContent = (FAMILIES[cam.family] ? FAMILIES[cam.family].label : cam.family) + '  ·  ' + cam.ip;
      t.appendChild(n);
      t.appendChild(d);

      var x = document.createElement('button');
      x.type = 'button';
      x.className = 'icon-btn';
      x.textContent = '×';
      x.setAttribute('aria-label', 'Rimuovi telecamera');
      x.addEventListener('click', function(){ removeCamera(cam.id); repaint(); });

      row.appendChild(t);
      row.appendChild(x);
      box.appendChild(row);
    })(list[i]);
  }

  if (!list.length) {
    var empty = document.createElement('div');
    empty.className = 'set-hint';
    empty.style.padding = '12px 0';
    empty.textContent = 'Nessuna telecamera. Aggiungi le tue e poi genera il file per il ponte.';
    box.appendChild(empty);
  }

  box.appendChild(addForm());

  var gen = document.createElement('button');
  gen.type = 'button';
  gen.className = 'btn';
  gen.style.cssText = 'width:100%;margin-top:12px;';
  gen.textContent = 'Genera il file per il ponte';
  gen.addEventListener('click', showBridgeConfig);
  box.appendChild(gen);

  return box;
}

function addForm(){
  var form = document.createElement('div');
  form.style.cssText = 'margin-top:14px;display:flex;flex-direction:column;gap:8px;';

  var name = input('Nome, per esempio Ingresso');
  var ip = input('Indirizzo sulla rete, per esempio 192.168.1.50');

  var fam = document.createElement('select');
  fam.style.cssText = 'background:#1e2228;border:1px solid #272c33;color:#f2f3f5;' +
    'font-family:inherit;font-size:15px;padding:10px;border-radius:10px;';
  for (var k in FAMILIES) {
    var o = document.createElement('option');
    o.value = k;
    o.textContent = FAMILIES[k].label;
    fam.appendChild(o);
  }
  fam.value = 'icsee';

  var hint = document.createElement('div');
  hint.className = 'set-hint';

  function paintHint(){
    var f = FAMILIES[fam.value];
    hint.style.color = '';
    hint.textContent = f && f.note ? f.note : '';
  }
  fam.addEventListener('change', paintHint);
  paintHint();

  var user = input('Utente, di solito admin');
  user.value = 'admin';

  var add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn';
  add.textContent = 'Aggiungi';
  add.addEventListener('click', function(){
    if (!name.value.trim() || !ip.value.trim()) {
      hint.textContent = 'Servono almeno il nome e l indirizzo sulla rete.';
      hint.style.color = '#e05555';
      return;
    }
    addCamera({
      name: name.value.trim(),
      ip: ip.value.trim(),
      family: fam.value,
      user: user.value.trim() || 'admin'
    });
    repaint();
  });

  form.appendChild(name);
  form.appendChild(ip);
  form.appendChild(fam);
  form.appendChild(hint);
  form.appendChild(user);
  form.appendChild(add);
  return form;
}

function input(placeholder){
  var el = document.createElement('input');
  el.type = 'text';
  el.placeholder = placeholder;
  el.style.cssText = 'background:#1e2228;border:1px solid #272c33;color:#f2f3f5;' +
    'font-family:inherit;font-size:15px;padding:10px;border-radius:10px;width:100%;';
  return el;
}

// Le password vengono chieste qui e finiscono solo nel file per il ponte.
// Il tablet non le conserva, perche chiede i flussi al ponte e non alle
// telecamere.
function showBridgeConfig(){
  var cams = loadCameras();
  var passwords = {};

  for (var i = 0; i < cams.length; i++) {
    var pw = window.prompt('Password di ' + cams[i].name +
      '. Finisce solo nel file per il ponte, non viene salvata sul tablet.');
    if (pw === null) return;
    passwords[cams[i].id] = pw;
  }

  document.getElementById('bridge-text').value = buildBridgeConfig(passwords);
  document.getElementById('bridge-conf').hidden = false;
}

function fillEvents(host, foot){
  listEvents().then(function(events){
    host.innerHTML = '';

    if (!events.length) {
      var e = document.createElement('div');
      e.className = 'set-hint';
      e.style.padding = '16px 0';
      e.textContent = 'Nessun allarme registrato.';
      host.appendChild(e);
    }

    for (var i = 0; i < events.length && i < 40; i++) {
      (function(ev){
        var row = document.createElement('div');
        row.style.cssText = 'background:#1b1f25;border-radius:12px;padding:12px;display:flex;gap:14px;align-items:center;';

        var thumb = document.createElement('div');
        thumb.style.cssText = 'width:96px;height:72px;border-radius:8px;background:#0c0e11 center/cover;flex:none;';
        if (ev.cover && ev.cover.blob) {
          thumb.style.backgroundImage = 'url("' + URL.createObjectURL(ev.cover.blob) + '")';
        }

        var txt = document.createElement('div');
        var t1 = document.createElement('div');
        t1.style.fontSize = '16px';
        t1.textContent = new Date(ev.at).toLocaleString('it-IT');
        var t2 = document.createElement('div');
        t2.className = 'set-hint';
        t2.textContent = ev.count + ' scatti, intensita ' + ev.peak;
        txt.appendChild(t1);
        txt.appendChild(t2);

        row.appendChild(thumb);
        row.appendChild(txt);
        host.appendChild(row);
      })(events[i]);
    }

    storageInfo().then(function(info){
      foot.textContent = info + '. Cancellazione automatica dopo ' +
        settings.sentinelKeepDays + ' giorni.';
    });
  });
}

export function wipeArchive(){
  return clearAll();
}
