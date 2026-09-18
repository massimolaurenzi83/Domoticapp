// Timer da cucina.
//
// Chiedi al tablet un timer di dieci minuti e parte il conto alla rovescia
// a tutto schermo. Restano sul pannello dove li hai fatti partire, perche
// un timer della pasta non ha senso sull altro tablet.
//
// Gli orari di scadenza sono assoluti, non conteggi a scalare: cosi un
// timer sopravvive al riavvio della pagina e non perde secondi se il
// tablet rallenta.

var KEY = 'domapp.timers.v1';

var tick = null;
var onChange = null;
var onExpire = null;

var NUMERI = {
  un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6,
  sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12,
  quindici: 15, venti: 20, venticinque: 25, trenta: 30, quaranta: 40,
  quarantacinque: 45, cinquanta: 50, sessanta: 60, novanta: 90
};

export function loadTimers(){
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
}

function persist(list){
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
}

// Ricava durata e nome da una frase detta a voce.
// Restituisce null se non c'e nessuna durata riconoscibile.
export function parseTimer(phrase){
  var t = ' ' + String(phrase || '').toLowerCase() + ' ';
  var total = 0;
  var found = false;

  var units = [
    { re: /(\d+|[a-z]+)\s*(?:ore|ora)\b/, mult: 3600 },
    { re: /(\d+|[a-z]+)\s*minuti?\b/, mult: 60 },
    { re: /(\d+|[a-z]+)\s*second[io]\b/, mult: 1 }
  ];

  for (var i = 0; i < units.length; i++) {
    var m = t.match(units[i].re);
    if (!m) continue;
    var n = /^\d+$/.test(m[1]) ? parseInt(m[1], 10) : NUMERI[m[1]];
    if (!n) continue;
    total += n * units[i].mult;
    found = true;
    t = t.replace(m[0], ' ');
  }

  // Mezzora e mezza detti a voce valgono trenta minuti.
  var HALF = /\bmezz[oa]\b|\bmezz'?ora\b/;
  if (HALF.test(t)) { total += 1800; found = true; t = t.replace(HALF, ' '); }

  if (!found) return null;

  var drop = ['timer', 'metti', 'imposta', 'fai', 'partire', 'avvia', 'un', 'uno',
              'una', 'di', 'da', 'per', 'il', 'lo', 'la', 'i', 'gli', 'le'];

  var words = t.split(' ').filter(function(w){
    return w.length > 0 && drop.indexOf(w) === -1;
  });
  var name = words.join(' ');

  while (name.indexOf('  ') !== -1) name = name.split('  ').join(' ');
  return { seconds: total, name: name || '' };
}

export function addTimer(seconds, name){
  if (!seconds || seconds < 1) return loadTimers();
  var list = loadTimers();
  list.push({
    id: 'tm' + Date.now() + '-' + Math.floor(Math.random() * 10000),
    name: name || '',
    endsAt: Date.now() + seconds * 1000,
    total: seconds,
    rung: false
  });
  persist(list);
  start();
  if (onChange) onChange(loadTimers());
  return list;
}

export function removeTimer(id){
  var list = loadTimers().filter(function(t){ return t.id !== id; });
  persist(list);
  if (onChange) onChange(list);
  return list;
}

export function clearAllTimers(){
  persist([]);
  if (onChange) onChange([]);
}

export function activeTimers(){
  return loadTimers().filter(function(t){ return !t.rung; });
}

export function watchTimers(changeCallback, expireCallback){
  onChange = changeCallback;
  onExpire = expireCallback;
  dropStale();
  start();
}

// Un timer scaduto mentre il tablet era spento non ha piu senso: la pasta
// e fredda da un pezzo. Viene chiuso in silenzio invece di suonare adesso.
function dropStale(){
  var list = loadTimers();
  var soglia = Date.now() - 120000;
  var changed = false;

  for (var i = 0; i < list.length; i++) {
    if (!list[i].rung && list[i].endsAt < soglia) { list[i].rung = true; changed = true; }
  }
  if (changed) persist(list);
}

function start(){
  if (tick) return;
  tick = setInterval(function(){
    var list = loadTimers();
    if (!list.length) { clearInterval(tick); tick = null; return; }

    var now = Date.now();
    var fired = [];
    var changed = false;

    for (var i = 0; i < list.length; i++) {
      if (list[i].rung || list[i].endsAt > now) continue;
      list[i].rung = true;
      fired.push(list[i]);
      changed = true;
    }

    if (changed) persist(list);
    if (onChange) onChange(list);
    for (var k = 0; k < fired.length; k++) if (onExpire) onExpire(fired[k]);
  }, 1000);
}

// Mostra il tempo che resta in forma leggibile.
export function remainingText(t){
  var left = Math.max(0, Math.round((t.endsAt - Date.now()) / 1000));
  var h = Math.floor(left / 3600);
  var m = Math.floor((left % 3600) / 60);
  var s = left % 60;
  if (h > 0) return h + ':' + two(m) + ':' + two(s);
  return m + ':' + two(s);
}

function two(n){ return n < 10 ? '0' + n : String(n); }

// Come dire a voce quanto dura, senza leggere cifre inutili.
export function spokenDuration(seconds){
  var h = Math.floor(seconds / 3600);
  var m = Math.floor((seconds % 3600) / 60);
  var s = seconds % 60;
  var parts = [];
  if (h) parts.push(h === 1 ? 'un ora' : h + ' ore');
  if (m) parts.push(m === 1 ? 'un minuto' : m + ' minuti');
  if (s) parts.push(s === 1 ? 'un secondo' : s + ' secondi');
  return parts.join(' e ');
}
