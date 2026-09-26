// Schede Spesa e Sveglia.

import { loadItems, toggleItem, removeItem, addItem, clearDone } from './shopping.js';
import { loadAlarms, addAlarm, updateAlarm, removeAlarm, GIORNI, nextAlarm } from './alarm-clock.js';
import { settings } from './config.js';

function repaintShopping(){ renderShopping(document.getElementById('control-body')); }
function repaintAlarms(){ renderAlarms(document.getElementById('control-body')); }

function hint(text){
  var h = document.createElement('div');
  h.className = 'set-hint';
  h.textContent = text;
  return h;
}

// ---------- spesa ----------

export function renderShopping(body){
  body.innerHTML = '';

  var wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;height:100%;gap:14px;';

  var top = document.createElement('div');
  top.style.cssText = 'display:flex;gap:10px;';

  var field = document.createElement('input');
  field.type = 'text';
  field.placeholder = 'Aggiungi alla spesa, oppure dillo al tablet';
  field.style.cssText = 'flex:1;background:#1e2228;border:1px solid #272c33;color:#f2f3f5;' +
    'font-family:inherit;font-size:17px;padding:16px;border-radius:10px;';

  function add(){
    if (!field.value.trim()) return;
    addItem(field.value);
    field.value = '';
    repaintShopping();
  }
  field.addEventListener('keydown', function(ev){ if (ev.key === 'Enter') add(); });

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn';
  btn.textContent = 'Aggiungi';
  btn.addEventListener('click', add);

  top.appendChild(field);
  top.appendChild(btn);
  wrap.appendChild(top);

  var items = loadItems();
  var list = document.createElement('div');
  list.style.cssText = 'flex:1;overflow-y:auto;display:grid;' +
    'grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:8px;align-content:start;';

  if (!items.length) {
    list.appendChild(hint('La lista e vuota. Scrivi qui sopra oppure chiama il tablet per nome e digli cosa aggiungere.'));
  }

  for (var i = 0; i < items.length; i++) {
    (function(it){
      var row = document.createElement('button');
      row.type = 'button';
      row.style.cssText = 'background:' + (it.done ? '#12181a' : '#1b1f25') + ';border:0;' +
        'border-radius:12px;padding:16px;color:' + (it.done ? '#5d636b' : '#f2f3f5') + ';' +
        'font-family:inherit;font-size:17px;text-align:left;display:flex;' +
        'align-items:center;gap:12px;' + (it.done ? 'text-decoration:line-through;' : '');

      var box = document.createElement('span');
      box.textContent = it.done ? '✓' : '○';
      box.style.cssText = 'font-size:19px;color:' + (it.done ? '#1d9e75' : '#5d636b') + ';';

      var name = document.createElement('span');
      name.style.flex = '1';
      name.textContent = it.text;

      row.appendChild(box);
      row.appendChild(name);
      row.addEventListener('click', function(){ toggleItem(it.id); repaintShopping(); });
      list.appendChild(row);
    })(items[i]);
  }

  wrap.appendChild(list);

  var done = items.filter(function(i){ return i.done; }).length;
  if (done) {
    var clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'btn';
    clear.textContent = 'Togli le ' + done + (done === 1 ? ' cosa presa' : ' cose prese');
    clear.addEventListener('click', function(){ clearDone(); repaintShopping(); });
    wrap.appendChild(clear);
  }

  body.appendChild(wrap);
}

// ---------- sveglia ----------

export function renderAlarms(body){
  body.innerHTML = '';

  var wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;height:100%;gap:14px;';

  if (!settings.alarmEnabled) {
    var off = document.createElement('div');
    off.style.cssText = 'background:#14171b;border-radius:12px;padding:22px;';
    var t = document.createElement('div');
    t.style.fontSize = '19px';
    t.textContent = 'La sveglia e spenta';
    off.appendChild(t);
    off.appendChild(hint('Accendila dalle impostazioni, nel gruppo Sveglia. Finche resta spenta questo pannello non tocca ne luci ne musica.'));
    wrap.appendChild(off);
  } else {
    var next = nextAlarm();
    var head = document.createElement('div');
    head.style.cssText = 'background:#14171b;border-radius:12px;padding:20px;';
    var line = document.createElement('div');
    line.style.fontSize = '19px';
    line.textContent = next
      ? 'Prossima sveglia alle ' + next.alarm.time + (next.inDays === 0 ? ', oggi' : (next.inDays === 1 ? ', domani' : ', fra ' + next.inDays + ' giorni'))
      : 'Nessun orario impostato';
    head.appendChild(line);
    head.appendChild(hint('Per ora suona il tablet e ti dice l ora. Luce della camera e musica partiranno quando Google Home sara collegato.'));
    wrap.appendChild(head);
  }

  var list = document.createElement('div');
  list.style.cssText = 'flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:10px;';

  var alarms = loadAlarms();
  if (!alarms.length) list.appendChild(hint('Nessuna sveglia. Aggiungine una qui sotto.'));

  for (var i = 0; i < alarms.length; i++) {
    (function(al){
      var row = document.createElement('div');
      row.style.cssText = 'background:#1b1f25;border-radius:12px;padding:16px;display:flex;align-items:center;gap:16px;';

      var time = document.createElement('div');
      time.style.cssText = 'font-size:32px;font-weight:200;font-variant-numeric:tabular-nums;' +
        'min-width:110px;' + (al.enabled ? '' : 'color:#5d636b;');
      time.textContent = al.time;

      var days = document.createElement('div');
      days.style.cssText = 'flex:1;display:flex;gap:6px;flex-wrap:wrap;';
      for (var d = 0; d < 7; d++) {
        (function(dayIndex){
          var chip = document.createElement('button');
          chip.type = 'button';
          var onDay = al.days.indexOf(dayIndex) !== -1;
          chip.textContent = GIORNI[dayIndex];
          chip.style.cssText = 'border:0;border-radius:999px;padding:7px 12px;font-family:inherit;' +
            'font-size:13px;background:' + (onDay ? '#132434' : '#14171b') + ';' +
            'color:' + (onDay ? '#4a8fe0' : '#5d636b') + ';';
          chip.addEventListener('click', function(){
            var set = al.days.slice();
            var at = set.indexOf(dayIndex);
            if (at === -1) set.push(dayIndex); else set.splice(at, 1);
            updateAlarm(al.id, { days: set });
            repaintAlarms();
          });
          days.appendChild(chip);
        })(d);
      }

      var sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'switch' + (al.enabled ? ' is-on' : '');
      sw.setAttribute('aria-label', 'Attiva questa sveglia');
      sw.addEventListener('click', function(){
        updateAlarm(al.id, { enabled: !al.enabled });
        repaintAlarms();
      });

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn';
      del.textContent = '×';
      del.setAttribute('aria-label', 'Elimina sveglia');
      del.addEventListener('click', function(){ removeAlarm(al.id); repaintAlarms(); });

      row.appendChild(time);
      row.appendChild(days);
      row.appendChild(sw);
      row.appendChild(del);
      list.appendChild(row);
    })(alarms[i]);
  }

  wrap.appendChild(list);

  var add = document.createElement('div');
  add.style.cssText = 'display:flex;gap:10px;align-items:center;';

  var when = document.createElement('input');
  when.type = 'time';
  when.value = '07:00';
  when.style.cssText = 'background:#1e2228;border:1px solid #272c33;color:#f2f3f5;' +
    'font-family:inherit;font-size:17px;padding:14px;border-radius:10px;';

  var addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'btn';
  addBtn.textContent = 'Aggiungi sveglia';
  addBtn.addEventListener('click', function(){
    addAlarm(when.value, [1, 2, 3, 4, 5]);
    repaintAlarms();
  });

  add.appendChild(when);
  add.appendChild(addBtn);
  add.appendChild(hint('Parte dal lunedi al venerdi. I giorni si cambiano toccandoli.'));
  wrap.appendChild(add);

  body.appendChild(wrap);
}
