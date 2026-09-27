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
  changed();
}

// Avvisa l allineamento che c e qualcosa da consegnare agli altri
// dispositivi. Non lo importiamo direttamente per non legare i moduli.
function changed(){
  try { window.dispatchEvent(new Event('casa-dati')); } catch (e) {}
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

// ---------- frasi dette a voce ----------
//
// Il riconoscimento vocale non mette quasi mai le virgole: "aggiungi
// fagioli deodorante pasta e pane" arriva cosi. Le cose si separano con
// qualche regola semplice: le virgole e la "e", gli articoli che aprono
// una cosa nuova, e il resto parola per parola, tenendo insieme i nomi
// fatti di piu parole come "latte di soia", "carta igienica", "due litri
// di latte".

// Parole di comando intorno alle cose, da togliere. Le piu lunghe prima.
var COMANDI = [
  'aggiungi alla lista della spesa', 'metti nella lista della spesa', 'segna sulla lista della spesa',
  'dalla lista della spesa', 'alla lista della spesa', 'nella lista della spesa', 'sulla lista della spesa',
  'nella lista della spesa', 'della lista della spesa', 'lista della spesa',
  'dalla lista', 'alla lista', 'nella lista', 'sulla lista', 'dalla spesa', 'alla spesa', 'nella spesa',
  'della spesa', 'da comprare', 'ho comprato', 'ho preso', 'abbiamo comprato', 'abbiamo preso',
  'per favore', 'aggiungi', 'aggiungere', 'segna', 'segnami', 'metti', 'mettimi', 'compra', 'comprare',
  'rimuovi', 'rimuovere', 'togli', 'togliere', 'toglimi', 'cancella', 'cancellare', 'elimina', 'eliminare',
  'leva', 'depenna', 'anche', 'pure', 'la lista', 'lista'
];

var SEPARATORI = { ',': 1, 'e': 1, 'ed': 1, 'poi': 1, 'piu': 1, 'più': 1, 'inoltre': 1, 'oppure': 1 };

var ARTICOLI = { 'il': 1, 'lo': 1, 'la': 1, 'i': 1, 'gli': 1, 'le': 1, "l'": 1, 'un': 1, 'uno': 1,
  'una': 1, "un'": 1, 'del': 1, 'dello': 1, 'della': 1, 'dei': 1, 'degli': 1, 'delle': 1, "dell'": 1,
  'qualche': 1, 'dell': 1 };

// Parole che legano la parola prima alla dopo: "latte di soia".
var LEGAMI = { 'di': 1, "d'": 1, 'da': 1, 'per': 1, 'con': 1, 'senza': 1, 'al': 1, 'allo': 1, 'alla': 1,
  'ai': 1, 'agli': 1, 'alle': 1, "all'": 1, 'in': 1, 'a': 1 };

// Quantita: si attaccano alla cosa che segue.
var QUANTITA = { 'due': 1, 'tre': 1, 'quattro': 1, 'cinque': 1, 'sei': 1, 'sette': 1, 'otto': 1,
  'nove': 1, 'dieci': 1, 'dodici': 1, 'venti': 1, 'mezzo': 1, 'mezza': 1, 'chilo': 1, 'chili': 1, 'kg': 1,
  'etto': 1, 'etti': 1, 'grammi': 1, 'litro': 1, 'litri': 1, 'pacco': 1, 'pacchi': 1, 'pacchetto': 1,
  'pacchetti': 1, 'confezione': 1, 'confezioni': 1, 'bottiglia': 1, 'bottiglie': 1, 'scatola': 1,
  'scatole': 1, 'scatoletta': 1, 'scatolette': 1, 'vasetto': 1, 'vasetti': 1, 'barattolo': 1,
  'barattoli': 1, 'rotolo': 1, 'rotoli': 1, 'busta': 1, 'buste': 1, 'lattina': 1, 'lattine': 1,
  'cassa': 1, 'casse': 1, 'fetta': 1, 'fette': 1, 'tubetto': 1, 'flacone': 1 };

// Parole che descrivono quella prima: "latte intero", "acqua frizzante".
var AGGETTIVI = { 'intero': 1, 'intera': 1, 'scremato': 1, 'parzialmente': 1, 'frizzante': 1,
  'naturale': 1, 'gassata': 1, 'liscia': 1, 'integrale': 1, 'integrali': 1, 'grattugiato': 1,
  'grattugiata': 1, 'pelati': 1, 'pelato': 1, 'fresco': 1, 'fresca': 1, 'freschi': 1, 'fresche': 1,
  'surgelato': 1, 'surgelata': 1, 'surgelati': 1, 'surgelate': 1, 'bianco': 1, 'bianca': 1,
  'bianchi': 1, 'rosso': 1, 'rossa': 1, 'rossi': 1, 'rosse': 1, 'verde': 1, 'verdi': 1, 'nero': 1,
  'nera': 1, 'neri': 1, 'extravergine': 1, 'igienica': 1, 'grosso': 1, 'fino': 1, 'magro': 1,
  'magra': 1, 'light': 1, 'bio': 1, 'biologico': 1, 'biologica': 1, 'senza': 1, 'lattosio': 1,
  'glutine': 1, 'cotto': 1, 'crudo': 1, 'affumicato': 1, 'secco': 1, 'secca': 1, 'secchi': 1,
  'liquido': 1, 'liquida': 1, 'piccolo': 1, 'piccola': 1, 'piccoli': 1, 'grande': 1, 'grandi': 1,
  'zero': 1, 'dolce': 1, 'piccante': 1, 'borlotti': 1, 'cannellini': 1, 'dietetico': 1, 'vegetale': 1,
  'greco': 1, 'bianche': 1, 'marrone': 1, 'normale': 1, 'classico': 1 };

// Nomi fatti di due parole senza legame in mezzo.
var COPPIE = { 'carta forno': 1, 'carta cucina': 1, 'carta stagnola': 1, 'pasta sfoglia': 1,
  'pasta frolla': 1, 'pan carre': 1, 'pan carrè': 1, 'pan grattato': 1, 'detersivo piatti': 1,
  'detersivo lavatrice': 1, 'detersivo pavimenti': 1, 'sapone mani': 1, 'sapone piatti': 1,
  'crema mani': 1, 'crema viso': 1, 'acqua ossigenata': 1, 'coca cola': 1, 'olio semi': 1,
  'filo interdentale': 1, 'sacchi spazzatura': 1, 'sacchetti spazzatura': 1, 'pasta brisè': 1,
  'pasta brise': 1, 'pasta pizza': 1, 'lievito birra': 1, 'dado brodo': 1 };

function piegata(t){
  return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Separa la frase in parole, con virgole e apostrofi come pezzi a se.
function pezzi(frase){
  var t = ' ' + String(frase || '').toLowerCase().replace(/[’`]/g, "'") + ' ';
  t = t.replace(/[.;:!?]/g, ' , ').replace(/,/g, ' , ');
  t = t.replace(/\b(l|un|dell|all|nell|sull|d)'/g, "$1' ");
  // I comandi si confrontano senza accenti, ma le parole restano scritte giuste.
  var piega = piegata(t);
  for (var i = 0; i < COMANDI.length; i++) {
    var c = ' ' + piegata(COMANDI[i]) + ' ';
    var at;
    while ((at = piega.indexOf(c)) !== -1) {
      t = t.slice(0, at) + ' , ' + t.slice(at + c.length);
      piega = piega.slice(0, at) + ' , ' + piega.slice(at + c.length);
    }
  }
  return t.split(/\s+/).filter(Boolean);
}

function unisci(parole){
  var out = '';
  for (var i = 0; i < parole.length; i++) {
    out += parole[i];
    if (i < parole.length - 1 && parole[i].slice(-1) !== "'") out += ' ';
  }
  return out.trim();
}

// L elenco delle cose nominate in una frase.
export function parseItems(frase){
  var parole = pezzi(frase);
  var cose = [];
  var cur = [];

  function chiudi(){
    while (cur.length && (LEGAMI[piegata(cur[cur.length - 1])] || ARTICOLI[piegata(cur[cur.length - 1])])) cur.pop();
    if (cur.length) cose.push(unisci(cur));
    cur = [];
  }

  for (var i = 0; i < parole.length; i++) {
    var w = parole[i];
    var f = piegata(w);
    if (SEPARATORI[f]) { chiudi(); continue; }
    var prima = cur.length ? piegata(cur[cur.length - 1]) : '';

    if (ARTICOLI[f]) {
      // Un articolo apre una cosa nuova, salvo dopo "di", "da"...
      if (cur.length && !LEGAMI[prima]) chiudi();
      // "un chilo di mele": l articolo davanti a una quantita resta.
      if (!cur.length) {
        if ((f === 'un' || f === 'uno' || f === 'una') && QUANTITA[piegata(parole[i + 1] || '')]) cur.push(w);
        continue;
      }
      cur.push(w);
      continue;
    }

    if (!cur.length) { cur.push(w); continue; }

    var insieme = LEGAMI[prima] || QUANTITA[prima] || prima === 'un' || prima === 'uno' || prima === 'una' || /^\d+$/.test(prima) || LEGAMI[f] ||
      AGGETTIVI[f] || COPPIE[prima + ' ' + f] || prima.slice(-1) === "'";
    if (!insieme) chiudi();
    cur.push(w);
  }
  chiudi();

  // Via i doppioni nella stessa frase.
  var viste = {};
  return cose.filter(function(c){
    var k = piegata(c);
    if (viste[k]) return false;
    viste[k] = true;
    return true;
  });
}

// Confronto tollerante: "fagiolo" e "fagioli", "la pasta" e "pasta".
function radice(t){
  return piegata(t).split(/\s+/).filter(function(w){ return w && !ARTICOLI[w]; })
    .map(function(w){ return w.length > 3 ? w.replace(/[aeiou]$/, '') : w; }).join(' ');
}

function trova(lista, nome){
  var r = radice(nome);
  if (!r) return -1;
  var i;
  for (i = 0; i < lista.length; i++) if (!lista[i].deleted && radice(lista[i].text) === r) return i;
  for (i = 0; i < lista.length; i++) {
    if (lista[i].deleted) continue;
    var x = radice(lista[i].text);
    if ((' ' + x + ' ').indexOf(' ' + r + ' ') !== -1 || (' ' + r + ' ').indexOf(' ' + x + ' ') !== -1) return i;
  }
  return -1;
}

// Aggiunge tutte le cose nominate. Restituisce quelle aggiunte e quelle
// che c erano gia.
export function addFromVoice(frase){
  var nomi = parseItems(frase);
  var lista = allItems();
  var aggiunte = [], gia = [];
  var ora = Date.now();
  nomi.forEach(function(nome, n){
    var at = trova(lista, nome);
    if (at !== -1 && !lista[at].done) { gia.push(lista[at].text); return; }
    if (at !== -1) {
      lista[at].done = false;
      lista[at].editedAt = ora;
      aggiunte.push(lista[at].text);
      return;
    }
    // Una voce tolta tempo fa con lo stesso nome torna, invece di sdoppiarsi.
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].deleted && radice(lista[i].text) === radice(nome)) {
        lista[i].deleted = false; lista[i].done = false; lista[i].editedAt = ora;
        aggiunte.push(lista[i].text);
        return;
      }
    }
    lista.push({ id: 'sp' + ora + '-' + n + '-' + Math.floor(Math.random() * 10000), text: nome, done: false, editedAt: ora });
    aggiunte.push(nome);
  });
  if (aggiunte.length) persist(lista);
  return { aggiunte: aggiunte, gia: gia };
}

// Toglie le cose nominate. Restituisce quelle tolte e quelle non trovate.
export function removeFromVoice(frase){
  var nomi = parseItems(frase);
  var lista = allItems();
  var tolte = [], mancanti = [];
  var ora = Date.now();
  nomi.forEach(function(nome){
    var at = trova(lista, nome);
    if (at === -1) { mancanti.push(nome); return; }
    lista[at].deleted = true;
    lista[at].editedAt = ora;
    tolte.push(lista[at].text);
  });
  if (tolte.length) persist(lista);
  return { tolte: tolte, mancanti: mancanti };
}

// Svuota la lista.
export function clearAll(){
  var lista = allItems();
  var n = 0;
  var ora = Date.now();
  for (var i = 0; i < lista.length; i++) {
    if (!lista[i].deleted) { lista[i].deleted = true; lista[i].editedAt = ora; n++; }
  }
  if (n) persist(lista);
  return n;
}

// "a, b e c", come si dice.
export function spokenList(nomi){
  if (!nomi.length) return '';
  if (nomi.length === 1) return nomi[0];
  return nomi.slice(0, -1).join(', ') + ' e ' + nomi[nomi.length - 1];
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
