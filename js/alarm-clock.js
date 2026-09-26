// Sveglia con luce e musica.
//
// Spenta di fabbrica: va accesa dall interruttore nelle impostazioni e poi
// impostata. Finche non lo fai, questo modulo non tocca niente.
//
// Nei minuti prima dell orario la luce della camera sale piano dal minimo,
// poi parte la musica a volume crescente. Ci si sveglia con la luce, che e
// molto meno brusco di un allarme.

import { settings } from './config.js';
import { findDevice, toggle, devices, speakers, rooms } from './devices.js';

var KEY = 'domapp.alarms.v1';

var timer = null;
var active = null;
var lastFired = '';
var onStage = null;

export var GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

export function loadAlarms(){
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
}

function persist(list){
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
}

export function addAlarm(time, days){
  var list = loadAlarms();
  list.push({
    id: 'al' + Date.now() + '-' + Math.floor(Math.random() * 10000),
    time: time || '07:00',
    days: days || [1, 2, 3, 4, 5],
    light: bedroomDevice(devices, 'light'),
    speaker: bedroomDevice(speakers, 'speaker'),
    enabled: true
  });
  list.sort(function(a, b){ return a.time < b.time ? -1 : 1; });
  persist(list);
  return list;
}

// Sceglie la luce o l altoparlante della camera da letto, se esiste una
// stanza che si chiama camera. Altrimenti il primo disponibile.
function bedroomDevice(list, kind){
  var camera = null;
  for (var r = 0; r < rooms.length; r++) {
    if (/camera|letto/i.test(rooms[r].name)) { camera = rooms[r].id; break; }
  }
  var primo = null;
  for (var i = 0; i < list.length; i++) {
    if (list[i].kind !== kind) continue;
    if (!primo) primo = list[i].id;
    if (camera && list[i].room === camera) return list[i].id;
  }
  return primo;
}

export function updateAlarm(id, patch){
  var list = loadAlarms();
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) for (var k in patch) list[i][k] = patch[k];
  }
  persist(list);
  return list;
}

export function removeAlarm(id){
  var list = loadAlarms().filter(function(a){ return a.id !== id; });
  persist(list);
  return list;
}

// ---------- ciclo ----------

export function startAlarms(stageCallback){
  onStage = stageCallback;
  if (timer) clearInterval(timer);
  timer = setInterval(check, 30000);
  check();
}

export function stopAlarms(){
  if (timer) { clearInterval(timer); timer = null; }
  active = null;
}

function toMinutes(hhmm){
  var p = String(hhmm || '00:00').split(':');
  return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
}

function check(){
  if (!settings.alarmEnabled) { active = null; return; }

  var now = new Date();
  var minutes = now.getHours() * 60 + now.getMinutes();
  var lead = Math.max(0, parseInt(settings.alarmSunriseMinutes, 10) || 20);

  var list = loadAlarms();
  for (var i = 0; i < list.length; i++) {
    var a = list[i];
    if (!a.enabled) continue;

    var at = toMinutes(a.time);
    var start = at - lead;

    // Una sveglia poco dopo mezzanotte ha la sua alba la sera prima. In
    // quel caso i minuti di adesso si contano rispetto alla mezzanotte che
    // arriva, e il giorno da controllare e quello della sveglia, cioe domani.
    var rel = minutes;
    var giornoSveglia = now.getDay();
    if (start < 0 && minutes >= start + 1440) {
      rel = minutes - 1440;
      giornoSveglia = (giornoSveglia + 1) % 7;
    }
    if (a.days.indexOf(giornoSveglia) === -1) continue;
    if (rel < start || rel > at + 2) continue;

    var dataSveglia = new Date(now.getTime() + (rel !== minutes ? 86400000 : 0));
    var stamp = dataSveglia.toDateString() + ' ' + a.id;
    var progress = lead === 0 ? 1 : Math.min(1, Math.max(0, (rel - start) / lead));
    runStage(a, progress, stamp);
    return;
  }

  active = null;
}

function runStage(alarm, progress, stamp){
  active = { alarm: alarm, progress: progress };
  if (onStage) onStage(alarm, progress);

  // L alba: la luce si accende all inizio della finestra. Quando le luci
  // sapranno regolare l intensita, qui salira gradualmente.
  if (progress > 0.05) {
    var light = findDevice(alarm.light);
    if (light && !light.on) toggle(light.id, false);
  }

  // La musica parte solo all orario vero, e una volta sola.
  if (progress >= 1 && lastFired !== stamp) {
    lastFired = stamp;
    var sp = findDevice(alarm.speaker);
    if (sp && !sp.on) toggle(sp.id, false);
  }
}

export function activeAlarm(){ return active; }

export function nextAlarm(){
  if (!settings.alarmEnabled) return null;

  var list = loadAlarms().filter(function(a){ return a.enabled; });
  if (!list.length) return null;

  var now = new Date();
  var nowMin = now.getHours() * 60 + now.getMinutes();
  var best = null;

  for (var ahead = 0; ahead < 8 && !best; ahead++) {
    var day = (now.getDay() + ahead) % 7;
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (a.days.indexOf(day) === -1) continue;
      var at = toMinutes(a.time);
      if (ahead === 0 && at <= nowMin) continue;
      if (!best || at < toMinutes(best.time)) best = a;
    }
    if (best) return { alarm: best, inDays: ahead };
  }
  return null;
}

export function alarmDiagnostics(){
  if (!settings.alarmEnabled) return 'Sveglia: spenta.';
  var next = nextAlarm();
  if (!next) return 'Sveglia: accesa ma nessun orario impostato.';
  var when = next.inDays === 0 ? 'oggi' : (next.inDays === 1 ? 'domani' : 'fra ' + next.inDays + ' giorni');
  return 'Sveglia: prossima ' + when + ' alle ' + next.alarm.time + '.';
}
