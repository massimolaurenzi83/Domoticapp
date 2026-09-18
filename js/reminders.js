// Promemoria dettati a voce.
//
// Vengono salvati sul tablet e messi in coda. Quando il collegamento a
// Google Calendar sara attivo, la coda viene svuotata sul calendario del
// profilo scelto. Finche non lo e, restano comunque visibili in Agenda.

var KEY = 'domapp.reminders.v1';

var GIORNI = ['domenica','lunedi','martedi','mercoledi','giovedi','venerdi','sabato'];
var MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio',
            'agosto','settembre','ottobre','novembre','dicembre'];

// Restituisce solo i promemoria vivi. Le voci cancellate restano nel
// deposito come segnaposto, altrimenti tornerebbero dall altro tablet.
export function loadReminders(){
  return allReminders().filter(function(r){ return !r.deleted; });
}

export function allReminders(){
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
}

function persist(list){
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
}

export function addReminder(text, when, profileId){
  var list = allReminders();
  list.push({
    id: 'r' + Date.now() + '-' + Math.floor(Math.random() * 10000),
    text: text,
    when: when ? when.getTime() : null,
    profile: profileId || 'casa',
    editedAt: Date.now(),
    synced: false
  });
  list.sort(function(a, b){ return (a.when || 0) - (b.when || 0); });
  persist(list);
  return list;
}

export function removeReminder(id){
  var list = allReminders();
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) {
      list[i].deleted = true;
      list[i].editedAt = Date.now();
    }
  }
  persist(list);
  return loadReminders();
}

export function pendingSync(){
  return loadReminders().filter(function(r){ return !r.synced; });
}

// ---------- interpretazione della data detta a voce ----------

// Restituisce { when, text } dove text e la frase ripulita dai riferimenti
// temporali. Se non trova nessuna data, when resta null.
export function parseWhen(phrase, now){
  var base = now ? new Date(now.getTime()) : new Date();
  var t = ' ' + String(phrase || '').toLowerCase() + ' ';
  var d = null;
  var found = [];

  function take(re){
    var m = t.match(re);
    if (m) found.push(m[0].trim());
    return m;
  }

  // giorno
  var m;
  if ((m = take(/\bdopodomani\b/))) {
    d = startOfDay(base); d.setDate(d.getDate() + 2);
  } else if ((m = take(/\bdomani\b/))) {
    d = startOfDay(base); d.setDate(d.getDate() + 1);
  } else if ((m = take(/\boggi\b/))) {
    d = startOfDay(base);
  } else if ((m = take(/\bfra\s+(\d{1,3})\s+giorni?\b/))) {
    d = startOfDay(base); d.setDate(d.getDate() + parseInt(m[1], 10));
  } else if ((m = take(/\bil\s+(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\b/))) {
    d = startOfDay(base);
    d.setMonth(MESI.indexOf(m[2]));
    d.setDate(parseInt(m[1], 10));
    if (d < base) d.setFullYear(d.getFullYear() + 1);
  } else if ((m = take(/\b(lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\b/))) {
    d = startOfDay(base);
    var target = GIORNI.indexOf(m[1]);
    var delta = (target - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + (delta === 0 ? 7 : delta));
  }

  // ora
  if ((m = take(/\bfra\s+(un|due|tre|quattro|\d{1,2})\s+ore?\b/))) {
    var n = { un:1, due:2, tre:3, quattro:4 }[m[1]] || parseInt(m[1], 10) || 1;
    d = new Date(base.getTime() + n * 3600000);
  } else if ((m = take(/\balle\s+(\d{1,2})(?:[:.e]\s?(\d{2}))?\b/))) {
    if (!d) d = startOfDay(base);
    var h = parseInt(m[1], 10);
    if (h < 8 && /\bsera\b|\bpomeriggio\b/.test(t)) h += 12;
    d.setHours(h, m[2] ? parseInt(m[2], 10) : 0, 0, 0);
    if (d < base && !/\bdomani\b|\boggi\b/.test(t)) d.setDate(d.getDate() + 1);
  } else if (d) {
    d.setHours(9, 0, 0, 0);
  }

  var clean = ' ' + String(phrase || '').toLowerCase() + ' ';
  for (var i = 0; i < found.length; i++) clean = clean.split(found[i]).join(' ');

  var fillers = ['ricordami di ', 'ricordami ', 'promemoria ', 'segna ', 'annota ', 'appunta '];
  for (var k = 0; k < fillers.length; k++) clean = clean.split(fillers[k]).join(' ');

  while (clean.indexOf('  ') !== -1) clean = clean.split('  ').join(' ');
  clean = clean.trim();

  return { when: d, text: clean || String(phrase || '').trim() };
}

function startOfDay(x){
  var d = new Date(x.getTime());
  d.setHours(0, 0, 0, 0);
  return d;
}

export function describeWhen(ms){
  if (!ms) return 'senza data';
  var d = new Date(ms);
  var now = new Date();
  var sameDay = d.toDateString() === now.toDateString();
  var hm = (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' +
           (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  if (sameDay) return 'oggi alle ' + hm;
  var tomorrow = new Date(now.getTime() + 86400000);
  if (d.toDateString() === tomorrow.toDateString()) return 'domani alle ' + hm;
  return GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()] + ' alle ' + hm;
}
