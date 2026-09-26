// Riquadri della schermata principale.
//
// Accanto all orologio scegli tu cosa vedere, e in che ordine, dalle
// impostazioni. I riquadri si aggiornano da soli ogni mezzo minuto; il
// timer, che deve scorrere, lo aggiorna l app ogni secondo.

import { settings, save } from './config.js';
import { loadReminders, describeWhen } from './reminders.js';
import { loadItems } from './shopping.js';
import { nextAlarm } from './alarm-clock.js';
import { isArmed } from './presence.js';
import { inbox } from './intercom.js';
import { playing } from './radio.js';
import { profileName } from './profiles.js';

export var WIDGETS = {
  meteo:      { label: 'Meteo' },
  timer:      { label: 'Timer in corso', hint: 'compare solo quando ce n e uno' },
  promemoria: { label: 'Prossimi promemoria' },
  spesa:      { label: 'Lista della spesa' },
  sveglia:    { label: 'Prossima sveglia' },
  messaggi:   { label: 'Ultimo messaggio ricevuto' },
  sentinella: { label: 'Stato della sentinella' },
  radio:      { label: 'Radio in onda', hint: 'compare solo mentre suona' }
};

var DEFAULT_ORDER = ['meteo', 'timer', 'messaggi', 'promemoria', 'spesa'];

export function chosenWidgets(){
  try {
    var v = settings.homeWidgets ? JSON.parse(settings.homeWidgets) : null;
    if (v && v.length !== undefined) return v.filter(function(id){ return !!WIDGETS[id]; });
  } catch (e) {}
  return DEFAULT_ORDER.slice();
}

export function setChosenWidgets(list){
  settings.homeWidgets = JSON.stringify(list);
  save();
}

// ---------- disegno ----------

function card(title){
  var c = document.createElement('div');
  c.className = 'widget';
  if (title) {
    var h = document.createElement('div');
    h.className = 'widget-title';
    h.textContent = title;
    c.appendChild(h);
  }
  return c;
}

function line(c, text, cls){
  var d = document.createElement('div');
  d.className = cls || 'widget-line';
  d.textContent = text;
  c.appendChild(d);
  return d;
}

var BUILDERS = {
  promemoria: function(){
    var ora = Date.now();
    var lista = loadReminders().filter(function(r){ return !r.when || r.when >= ora - 3600000; });
    if (!lista.length) return null;
    var c = card('Promemoria');
    for (var i = 0; i < lista.length && i < 3; i++) {
      line(c, lista[i].text, 'widget-line');
      line(c, describeWhen(lista[i].when) + (lista[i].profile !== 'casa' ? ', ' + profileName(lista[i].profile) : ''), 'widget-sub');
    }
    return c;
  },

  spesa: function(){
    var da = loadItems().filter(function(i){ return !i.done; });
    if (!da.length) return null;
    var c = card('Spesa, ' + da.length + (da.length === 1 ? ' cosa' : ' cose'));
    var nomi = [];
    for (var i = 0; i < da.length && i < 6; i++) nomi.push(da[i].text);
    line(c, nomi.join(', ') + (da.length > 6 ? '...' : ''));
    return c;
  },

  sveglia: function(){
    var n = nextAlarm();
    if (!n) return null;
    var c = card('Sveglia');
    var quando = n.inDays === 0 ? 'oggi' : (n.inDays === 1 ? 'domani' : 'fra ' + n.inDays + ' giorni');
    line(c, n.alarm.time + ', ' + quando, 'widget-big');
    return c;
  },

  messaggi: function(){
    var m = inbox()[0];
    if (!m || Date.now() - m.at > 12 * 3600000) return null;
    var c = card('Messaggio da ' + m.from);
    line(c, m.text);
    line(c, new Date(m.at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }), 'widget-sub');
    return c;
  },

  sentinella: function(){
    var c = card('Sentinella');
    line(c, isArmed() ? 'armata' : 'disarmata', 'widget-big');
    return c;
  },

  radio: function(){
    var st = playing();
    if (!st) return null;
    var c = card('Radio');
    line(c, st.name);
    return c;
  }
};

// Mette in fila i riquadri scelti. Meteo e timer sono elementi fissi della
// pagina, perche l app li aggiorna per conto suo: vengono spostati, mai
// ricreati. Quando non sono scelti restano in un deposito nascosto.
export function renderWidgets(){
  var side = document.querySelector('.ambient-side');
  if (!side) return;

  var parcheggio = document.getElementById('widget-parking');
  if (!parcheggio) {
    parcheggio = document.createElement('div');
    parcheggio.id = 'widget-parking';
    parcheggio.style.display = 'none';
    document.body.appendChild(parcheggio);
  }

  var meteo = document.getElementById('weather-card');
  var timer = document.getElementById('timer-box');
  var suona = document.getElementById('now-playing');
  if (meteo) parcheggio.appendChild(meteo);
  if (timer) parcheggio.appendChild(timer);
  if (suona) parcheggio.appendChild(suona);

  side.innerHTML = '';

  var scelti = chosenWidgets();
  for (var i = 0; i < scelti.length; i++) {
    var id = scelti[i];
    if (id === 'meteo' && meteo) { side.appendChild(meteo); continue; }
    if (id === 'timer' && timer) { side.appendChild(timer); continue; }
    if (BUILDERS[id]) {
      var el = BUILDERS[id]();
      if (el) side.appendChild(el);
    }
  }
}

// ---------- scelta nelle impostazioni ----------

export function widgetChooser(onChange){
  var box = document.createElement('div');
  box.style.cssText = 'display:flex;flex-direction:column;gap:6px;';

  function paint(){
    box.innerHTML = '';
    var scelti = chosenWidgets();
    var tutti = scelti.concat(Object.keys(WIDGETS).filter(function(id){ return scelti.indexOf(id) === -1; }));

    for (var i = 0; i < tutti.length; i++) {
      (function(id, pos){
        var attivo = scelti.indexOf(id) !== -1;
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;background:#1b1f25;border-radius:10px;padding:10px 12px;';

        var nome = document.createElement('div');
        nome.style.cssText = 'flex:1;font-size:15px;' + (attivo ? '' : 'color:#5d636b;');
        nome.textContent = WIDGETS[id].label + (WIDGETS[id].hint ? ', ' + WIDGETS[id].hint : '');

        function arrow(label, delta){
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'icon-btn';
          b.style.cssText = 'width:38px;height:38px;font-size:16px;';
          b.textContent = label;
          b.setAttribute('aria-label', delta < 0 ? 'Sposta in su' : 'Sposta in giu');
          b.disabled = !attivo;
          b.addEventListener('click', function(){
            var s = chosenWidgets();
            var at = s.indexOf(id);
            var to = at + delta;
            if (at === -1 || to < 0 || to >= s.length) return;
            s.splice(at, 1);
            s.splice(to, 0, id);
            setChosenWidgets(s);
            paint();
            if (onChange) onChange();
          });
          return b;
        }

        var sw = document.createElement('button');
        sw.type = 'button';
        sw.className = 'switch' + (attivo ? ' is-on' : '');
        sw.setAttribute('aria-label', WIDGETS[id].label);
        sw.addEventListener('click', function(){
          var s = chosenWidgets();
          var at = s.indexOf(id);
          if (at === -1) s.push(id); else s.splice(at, 1);
          setChosenWidgets(s);
          paint();
          if (onChange) onChange();
        });

        row.appendChild(nome);
        row.appendChild(arrow('↑', -1));
        row.appendChild(arrow('↓', 1));
        row.appendChild(sw);
        box.appendChild(row);
      })(tutti[i], i);
    }
  }

  paint();
  return box;
}
