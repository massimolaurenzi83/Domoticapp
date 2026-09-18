// Simulazione di presenza durante i viaggi.
//
// Si accende solo insieme alla sentinella, cioe quando parti, e si spegne
// appena disarmi. A casa non fa assolutamente nulla.
//
// La differenza rispetto a un timer sta nell irregolarita. Chi osserva una
// casa per due sere di fila riconosce uno schema fisso e capisce che non
// c'e nessuno. Qui ogni accensione si sposta di qualche decina di minuti
// ogni giorno, e gli orari di partenza vengono imparati guardando quando
// accendete le luci davvero.

import { settings } from './config.js';
import { devices, toggle, findDevice } from './devices.js';

var HABITS_KEY = 'domapp.habits.v1';

var running = false;
var timer = null;
var plan = [];
var planDay = -1;

// ---------- apprendimento delle abitudini ----------

// Chiamata a ogni accensione o spegnimento fatto da una persona.
// Registra solo l ora, mai altro.
export function noteHabit(deviceId, turnedOn){
  var d = findDevice(deviceId);
  if (!d || d.kind !== 'light') return;

  var habits = readHabits();
  var key = deviceId + '|' + (turnedOn ? 'on' : 'off');
  var minutes = new Date().getHours() * 60 + new Date().getMinutes();

  if (!habits[key]) habits[key] = [];
  habits[key].push(minutes);
  // Bastano gli ultimi episodi: le abitudini cambiano con le stagioni.
  if (habits[key].length > 30) habits[key].shift();

  writeHabits(habits);
}

function readHabits(){
  try { return JSON.parse(localStorage.getItem(HABITS_KEY) || '{}'); } catch (e) { return {}; }
}

function writeHabits(h){
  try { localStorage.setItem(HABITS_KEY, JSON.stringify(h)); } catch (e) {}
}

// L orario tipico e la mediana, non la media: una sera anomala non
// sposta tutto il resto.
function typicalTime(key){
  var habits = readHabits();
  var list = habits[key];
  if (!list || list.length < 3) return null;
  var sorted = list.slice().sort(function(a, b){ return a - b; });
  return sorted[Math.floor(sorted.length / 2)];
}

export function habitsKnown(){
  var habits = readHabits();
  var n = 0;
  for (var k in habits) if (habits[k].length >= 3) n++;
  return n;
}

// ---------- programma della giornata ----------

// Quando non sappiamo ancora nulla di questa casa, partiamo da orari
// plausibili per una sera qualunque.
var FALLBACK = {
  'luce-soggiorno': { on: 19 * 60 + 20, off: 23 * 60 + 10 },
  'luce-cucina':    { on: 19 * 60 +  0, off: 21 * 60 + 30 },
  'luce-camera':    { on: 22 * 60 + 40, off: 23 * 60 + 40 },
  'luce-corridoio': { on: 20 * 60 + 10, off: 22 * 60 + 50 }
};

function jitter(){
  var span = Math.max(0, parseInt(settings.simJitterMinutes, 10) || 35);
  return Math.round((Math.random() * 2 - 1) * span);
}

function buildPlan(){
  var out = [];

  for (var i = 0; i < devices.length; i++) {
    var d = devices[i];
    if (d.kind !== 'light') continue;

    var learnedOn = typicalTime(d.id + '|on');
    var learnedOff = typicalTime(d.id + '|off');
    var fb = FALLBACK[d.id] || { on: 19 * 60 + 30, off: 23 * 60 };

    var onAt = (learnedOn === null ? fb.on : learnedOn) + jitter();
    var offAt = (learnedOff === null ? fb.off : learnedOff) + jitter();

    // Una luce che si spegne prima di accendersi non ha senso.
    if (offAt <= onAt) offAt = onAt + 45 + Math.round(Math.random() * 60);

    out.push({ id: d.id, at: clamp(onAt), on: true, done: false });
    out.push({ id: d.id, at: clamp(offAt), on: false, done: false });
  }

  out.sort(function(a, b){ return a.at - b.at; });
  return out;
}

function clamp(m){
  while (m < 0) m += 1440;
  return m % 1440;
}

// ---------- ciclo ----------

export function startSimulation(){
  if (!settings.simEnabled) return false;
  if (running) return true;
  running = true;
  planDay = -1;
  tick();
  timer = setInterval(tick, 60000);
  return true;
}

export function stopSimulation(){
  running = false;
  if (timer) { clearInterval(timer); timer = null; }
  // Le luci accese dalla simulazione vanno spente, altrimenti restano
  // accese per giorni dopo il rientro.
  for (var i = 0; i < plan.length; i++) {
    var step = plan[i];
    if (!step.done || !step.on) continue;
    var d = findDevice(step.id);
    if (d && d.on) toggle(d.id, false);
  }
  plan = [];
}

export function simulationRunning(){ return running; }

function tick(){
  if (!running) return;

  var now = new Date();
  var today = now.getDate();
  if (today !== planDay) { plan = buildPlan(); planDay = today; }

  var minutes = now.getHours() * 60 + now.getMinutes();

  for (var i = 0; i < plan.length; i++) {
    var step = plan[i];
    if (step.done) continue;
    // Una finestra di due minuti evita che un passaggio saltato per un
    // riavvio resti indietro per sempre.
    if (minutes < step.at || minutes > step.at + 2) continue;

    var d = findDevice(step.id);
    if (d && d.on !== step.on) toggle(d.id, false);
    step.done = true;
  }
}

export function nextSteps(limit){
  var now = new Date();
  var minutes = now.getHours() * 60 + now.getMinutes();
  var out = [];
  for (var i = 0; i < plan.length && out.length < (limit || 4); i++) {
    if (plan[i].done || plan[i].at < minutes) continue;
    out.push(plan[i]);
  }
  return out;
}

export function simulationDiagnostics(){
  if (!settings.simEnabled) return 'Presenza simulata: disattivata nelle impostazioni.';
  if (!running) return 'Presenza simulata: pronta, parte quando armi la sentinella.';
  return 'Presenza simulata: attiva, ' + plan.length + ' passaggi previsti oggi, ' +
         habitsKnown() + ' abitudini imparate.';
}
