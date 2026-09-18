// Lista della spesa condivisa.
//
// Dici al tablet in cucina di aggiungere il latte e lo ritrovi sul telefono
// al supermercato. Si allinea fra i due pannelli come i promemoria: le voci
// tolte restano come segnaposto, altrimenti riapparirebbero dall altro lato
// mentre sei in fila alla cassa.

var KEY = 'domapp.shopping.v1';

// Parole che avvolgono la cosa vera e non vanno scritte. Nel parlato
// possono stare sia prima sia dopo: "aggiungi il latte alla lista della
// spesa" le ha da entrambi i lati.
var PHRASES = [
  'aggiungi alla lista della spesa',
  'aggiungi alla lista',
  'aggiungi alla spesa',
  'metti nella lista della spesa',
  'metti nella lista',
  'metti nella spesa',
  'segna sulla lista della spesa',
  'segna sulla lista',
  'alla lista della spesa',
  'nella lista della spesa',
  'sulla lista della spesa',
  'alla lista',
  'nella lista',
  'sulla lista',
  'alla spesa',
  'nella spesa',
  'della spesa',
  'da comprare',
  'aggiungi',
  'segna',
  'metti',
  'compra',
  'comprare'
];

var ARTICLES = ['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una',
                'del', 'dello', 'della', 'dei', 'degli', 'delle', 'di'];

export function allItems(){
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
}

export function loadItems(){
  return allItems().filter(function(i){ return !i.deleted; });
}

function persist(list){
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
}

// Ripulisce la frase detta a voce e ne ricava la cosa da comprare.
export function cleanPhrase(phrase){
  var t = ' ' + String(phrase || '').toLowerCase().trim() + ' ';

  for (var i = 0; i < PHRASES.length; i++) {
    t = t.split(' ' + PHRASES[i] + ' ').join(' ');
  }

  var words = t.split(' ').filter(function(w){ return w.length > 0; });

  // Gli articoli rimasti in testa e in coda non servono al nome.
  while (words.length && ARTICLES.indexOf(words[0]) !== -1) words.shift();
  while (words.length && ARTICLES.indexOf(words[words.length - 1]) !== -1) words.pop();

  return words.join(' ').trim();
}

export function addItem(text){
  var name = cleanPhrase(text);
  if (!name) return loadItems();

  var list = allItems();

  // Se c'e gia, e stata tolta prima, torna in lista invece di sdoppiarsi.
  for (var i = 0; i < list.length; i++) {
    if (list[i].text.toLowerCase() === name.toLowerCase()) {
      list[i].deleted = false;
      list[i].done = false;
      list[i].editedAt = Date.now();
      persist(list);
      return loadItems();
    }
  }

  list.push({
    id: 'sp' + Date.now() + '-' + Math.floor(Math.random() * 10000),
    text: name,
    done: false,
    editedAt: Date.now()
  });
  persist(list);
  return loadItems();
}

export function toggleItem(id){
  var list = allItems();
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) {
      list[i].done = !list[i].done;
      list[i].editedAt = Date.now();
    }
  }
  persist(list);
  return loadItems();
}

export function removeItem(id){
  var list = allItems();
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) {
      list[i].deleted = true;
      list[i].editedAt = Date.now();
    }
  }
  persist(list);
  return loadItems();
}

// Toglie in un colpo solo tutto quello che e stato preso.
export function clearDone(){
  var list = allItems();
  var n = 0;
  for (var i = 0; i < list.length; i++) {
    if (list[i].done && !list[i].deleted) {
      list[i].deleted = true;
      list[i].editedAt = Date.now();
      n++;
    }
  }
  persist(list);
  return n;
}

export function pendingCount(){
  return loadItems().filter(function(i){ return !i.done; }).length;
}

// Fusione fra i due pannelli: per ogni voce vince la modifica piu recente.
export function mergeItems(remote){
  if (!remote || !remote.length) return false;

  var local = allItems();
  var byId = {};
  var i;
  for (i = 0; i < local.length; i++) byId[local[i].id] = local[i];

  var changed = false;
  for (i = 0; i < remote.length; i++) {
    var r = remote[i];
    if (!r || !r.id) continue;
    if (!byId[r.id] || (r.editedAt || 0) > (byId[r.id].editedAt || 0)) {
      byId[r.id] = r;
      changed = true;
    }
  }
  if (!changed) return false;

  var out = [];
  var cutoff = Date.now() - 30 * 86400000;
  for (var id in byId) {
    if (byId[id].deleted && (byId[id].editedAt || 0) < cutoff) continue;
    out.push(byId[id]);
  }
  persist(out);
  return true;
}
