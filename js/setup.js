// Prima configurazione, passo passo.
//
// Parte da sola la prima volta che il pannello viene aperto e non riparte
// piu una volta finita. Si puo rifare dalle impostazioni.
//
// Il percorso lungo si fa una volta sola sul tablet principale. Il secondo
// tablet fa un percorso corto di due campi e poi si allinea da solo.

import { settings, save } from './config.js';
import { setSyncConfig, startSync, touch } from './sync.js';
import { enableNotifications, pushBlockedReason } from './push.js';

var DONE_KEY = 'domapp.setup.done.v1';

var step = 0;
var role = '';
var steps = [];
var onFinish = null;

export function setupDone(){
  try { return localStorage.getItem(DONE_KEY) === 'yes'; } catch (e) { return true; }
}

export function markSetupDone(){
  try { localStorage.setItem(DONE_KEY, 'yes'); } catch (e) {}
}

export function resetSetup(){
  try { localStorage.removeItem(DONE_KEY); } catch (e) {}
}

export function startSetup(finishCallback){
  onFinish = finishCallback;
  step = 0;
  role = '';
  steps = [stepWelcome];
  document.getElementById('setup').hidden = false;
  paint();
}

function close(){
  document.getElementById('setup').hidden = true;
  markSetupDone();
  if (onFinish) onFinish();
}

// ---------- impalcatura ----------

function paint(){
  var host = document.getElementById('setup-body');
  host.innerHTML = '';

  var card = document.createElement('div');
  card.className = 'setup-card';

  var progress = document.createElement('div');
  progress.className = 'setup-progress';
  progress.textContent = steps.length > 1
    ? 'Passo ' + (step + 1) + ' di ' + steps.length
    : '';
  card.appendChild(progress);

  steps[step](card);
  host.appendChild(card);
}

function title(card, text){
  var h = document.createElement('h2');
  h.textContent = text;
  card.appendChild(h);
}

function para(card, text){
  var p = document.createElement('p');
  p.className = 'setup-text';
  p.textContent = text;
  card.appendChild(p);
}

// Il riquadro che spiega dove si trova un dato, quando non e ovvio.
function where(card, lines){
  var box = document.createElement('div');
  box.className = 'setup-where';
  var h = document.createElement('div');
  h.className = 'setup-where-title';
  h.textContent = 'Dove lo trovo';
  box.appendChild(h);

  var ol = document.createElement('ol');
  for (var i = 0; i < lines.length; i++) {
    var li = document.createElement('li');
    li.textContent = lines[i];
    ol.appendChild(li);
  }
  box.appendChild(ol);
  card.appendChild(box);
}

function field(card, label, value, placeholder){
  var wrap = document.createElement('label');
  wrap.className = 'setup-field';

  var l = document.createElement('span');
  l.textContent = label;
  wrap.appendChild(l);

  var input = document.createElement('input');
  input.type = 'text';
  input.value = value || '';
  if (placeholder) input.placeholder = placeholder;
  wrap.appendChild(input);

  card.appendChild(wrap);
  return input;
}

function buttons(card, options){
  var row = document.createElement('div');
  row.className = 'setup-buttons';

  if (options.back && step > 0) {
    var back = document.createElement('button');
    back.type = 'button';
    back.className = 'btn';
    back.textContent = 'Indietro';
    back.addEventListener('click', function(){ step--; paint(); });
    row.appendChild(back);
  }

  if (options.skip) {
    var skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'btn';
    skip.textContent = 'Lo farò dopo';
    skip.addEventListener('click', next);
    row.appendChild(skip);
  }

  var go = document.createElement('button');
  go.type = 'button';
  go.className = 'btn btn-go';
  go.textContent = options.label || 'Avanti';
  go.addEventListener('click', options.onNext || next);
  row.appendChild(go);

  card.appendChild(row);
  return row;
}

function next(){
  if (step >= steps.length - 1) { close(); return; }
  step++;
  paint();
}

function note(card, text){
  var n = document.createElement('div');
  n.className = 'setup-note';
  n.textContent = text;
  card.appendChild(n);
  return n;
}

// ---------- i passi ----------

function stepWelcome(card){
  title(card, 'Benvenuto');
  para(card, 'Quattro domande facili e hai finito. Questo è il tablet fisso al muro, oppure un altro dispositivo, come il secondo tablet o un telefono?');

  var row = document.createElement('div');
  row.className = 'setup-choice';

  var main = document.createElement('button');
  main.type = 'button';
  main.className = 'setup-big';
  main.innerHTML = '<strong>Il principale</strong><span>Quello fisso al muro</span>';
  main.addEventListener('click', function(){
    role = 'main';
    steps = [stepWelcome, stepPlace, stepPeople, stepName, stepPermissions, stepFork];
    step = 1;
    paint();
  });

  var second = document.createElement('button');
  second.type = 'button';
  second.className = 'setup-big';
  second.innerHTML = '<strong>Un altro dispositivo</strong><span>Secondo tablet o telefono</span>';
  second.addEventListener('click', function(){
    role = 'second';
    steps = [stepWelcome, stepJoin];
    step = 1;
    paint();
  });

  row.appendChild(main);
  row.appendChild(second);
  card.appendChild(row);
}

// ---- luogo ----

// Due servizi di ricerca invece di uno. Il primo e piu preciso sui nomi
// italiani, ma su alcune reti non e raggiungibile: in quel caso si ripiega
// sull archivio di OpenStreetMap.
function cercaCitta(nome){
  var q = encodeURIComponent(nome);

  return fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=it&name=' + q,
               { cache: 'no-store' })
    .then(function(r){
      if (!r.ok) throw new Error('stato ' + r.status);
      return r.json();
    })
    .then(function(j){
      if (!j.results || !j.results.length) return null;
      var x = j.results[0];
      return { name: x.name, admin1: x.admin1, latitude: x.latitude, longitude: x.longitude };
    })
    .catch(function(){
      return fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=it&q=' + q,
                   { cache: 'no-store' })
        .then(function(r){
          if (!r.ok) throw new Error('stato ' + r.status);
          return r.json();
        })
        .then(function(lista){
          if (!lista || !lista.length) return null;
          var x = lista[0];
          // Il nome arriva come indirizzo completo: teniamo le prime due parti.
          var pezzi = String(x.display_name || nome).split(',');
          return {
            name: pezzi[0].trim(),
            admin1: pezzi.length > 1 ? pezzi[1].trim() : '',
            latitude: parseFloat(x.lat),
            longitude: parseFloat(x.lon)
          };
        });
    });
}

function stepPlace(card){
  title(card, 'Dove sei');
  para(card, 'Scrivi la tua città e premi Cerca. Serve per il meteo.');

  var input = field(card, 'Citta', settings.placeName || '', 'per esempio Roma');
  var result = note(card, '');

  var found = null;

  function search(){
    var q = input.value.trim();
    if (!q) { result.textContent = 'Scrivi prima il nome della città.'; return; }
    result.textContent = 'Cerco...';

    cercaCitta(q).then(function(luogo){
      if (!luogo) {
        result.textContent = 'Non ho trovato questa città. Prova col nome completo.';
        found = null;
        return;
      }
      found = luogo;
      result.textContent = 'Trovata: ' + luogo.name +
        (luogo.admin1 ? ', ' + luogo.admin1 : '') + '. Premi Avanti per confermare.';
    }).catch(function(){
      result.textContent = 'Nessun servizio di ricerca raggiungibile. Vai avanti lo stesso: ' +
        'il meteo si sistema dalle impostazioni.';
    });
  }

  input.addEventListener('keydown', function(ev){ if (ev.key === 'Enter') search(); });

  var searchBtn = document.createElement('button');
  searchBtn.type = 'button';
  searchBtn.className = 'btn';
  searchBtn.textContent = 'Cerca';
  searchBtn.style.marginTop = '10px';
  searchBtn.addEventListener('click', search);
  card.appendChild(searchBtn);

  buttons(card, { back: true, onNext: function(){
    if (found) {
      settings.placeName = found.name;
      settings.lat = String(found.latitude);
      settings.lon = String(found.longitude);
      save();
      touch('placeName', 'lat', 'lon');
    } else if (input.value.trim()) {
      settings.placeName = input.value.trim();
      save();
      touch('placeName');
    }
    next();
  }});
}

// ---- persone ----

function stepPeople(card){
  title(card, 'Chi vive in casa');
  para(card, 'Servono per firmare promemoria e messaggi. Non sono una password.');

  var a = field(card, 'Primo nome', settings.profile1Name || '', 'per esempio Francesco');
  var b = field(card, 'Secondo nome', settings.profile2Name || '', 'lascia vuoto se non serve');
  var pin = field(card, 'Codice per le impostazioni', settings.settingsPin || '',
                  'solo cifre, oppure lascia vuoto');

  para(card, 'Il codice protegge solo le impostazioni. Puoi lasciarlo vuoto.');

  buttons(card, { back: true, onNext: function(){
    settings.profile1Name = a.value.trim();
    settings.profile2Name = b.value.trim();
    settings.settingsPin = pin.value.replace(/\D/g, '');
    save();
    touch('profile1Name', 'profile2Name', 'settingsPin');
    next();
  }});
}

// ---- nome del tablet ----

function stepName(card){
  title(card, 'Come si chiama il tablet');
  para(card, 'Il pannello risponde quando lo chiami per nome. Scegli una parola che non usi spesso parlando.');

  var name = field(card, 'Nome', settings.wakeWord || 'ambrogio', 'per esempio ambrogio');
  para(card, 'Poi basta dire: accendi la luce in cucina, timer di dieci minuti, aggiungi il latte alla spesa.');

  buttons(card, { back: true, onNext: function(){
    settings.wakeWord = name.value.trim().toLowerCase() || 'ambrogio';
    save();
    touch('wakeWord');
    next();
  }});
}

// ---- orari ----

function stepHours(card){
  title(card, 'Gli orari della casa');
  para(card, 'Di giorno mostra le foto, di sera orologio e meteo, di notte si spegne quasi del tutto.');

  var wrap = document.createElement('div');
  wrap.className = 'setup-times';

  function timeField(label, key){
    var l = document.createElement('label');
    l.className = 'setup-field';
    var s = document.createElement('span');
    s.textContent = label;
    var i = document.createElement('input');
    i.type = 'time';
    i.value = settings[key];
    l.appendChild(s);
    l.appendChild(i);
    wrap.appendChild(l);
    return i;
  }

  var d1 = timeField('Le foto iniziano alle', 'dayStart');
  var d2 = timeField('Le foto finiscono alle', 'dayEnd');
  var s1 = timeField('Schermo a riposo dalle', 'sleepStart');
  var s2 = timeField('Schermo a riposo fino alle', 'sleepEnd');

  card.appendChild(wrap);

  para(card, 'Finché non carichi delle foto, resta sempre la stazione meteo.');

  buttons(card, { back: true, onNext: function(){
    settings.dayStart = d1.value;
    settings.dayEnd = d2.value;
    settings.sleepStart = s1.value;
    settings.sleepEnd = s2.value;
    save();
    touch('dayStart', 'dayEnd', 'sleepStart', 'sleepEnd');
    next();
  }});
}

// ---- servizio ----

function stepService(card){
  title(card, 'Collegare i dispositivi');
  para(card, 'Il servizio di collegamento tiene insieme i due tablet e i telefoni, e porta le notifiche fuori casa. È gratuito e si installa dal computer.');

  where(card, [
    'Sul computer, nella cartella del progetto, esegui npx wrangler login: si apre il browser per entrare in Cloudflare, anche con un account nuovo è gratuito.',
    'Poi esegui node worker/installa.mjs. Fa tutto da solo e alla fine ti mostra un link.',
    'Manda quel link a te stesso, per email o WhatsApp, e aprilo su questo tablet: il collegamento si compila da solo.',
    'Se preferisci, puoi scrivere qui sotto i due valori, che trovi anche nel file worker/credenziali.txt.'
  ]);

  var url = field(card, 'Indirizzo del servizio', settings.syncUrl || '', 'https://casa-ponte.nome.workers.dev');
  var token = field(card, 'Parola condivisa', settings.syncToken || '', 'quattro gruppi da quattro, per esempio ab3k-...');
  var result = note(card, '');

  var test = document.createElement('button');
  test.type = 'button';
  test.className = 'btn';
  test.style.marginTop = '10px';
  test.textContent = 'Prova il collegamento';
  test.addEventListener('click', function(){
    if (!url.value.trim()) { result.textContent = 'Scrivi prima l’indirizzo.'; return; }
    result.textContent = 'Provo...';
    fetch(url.value.trim().replace(/\/+$/, '') + '/state', {
      headers: { 'X-Casa-Token': token.value.trim() }
    }).then(function(r){
      if (r.ok) result.textContent = 'Funziona. Il servizio risponde correttamente.';
      else if (r.status === 401) result.textContent = 'Il servizio risponde ma rifiuta la parola. Controlla di averla scritta identica, trattini compresi.';
      else if (r.status === 429) result.textContent = 'Troppi tentativi con una parola sbagliata. Aspetta un quarto d’ora.';
      else if (r.status === 500) result.textContent = 'Il servizio non ha ancora la parola impostata: rilancia l’installazione sul computer.';
      else result.textContent = 'Il servizio risponde con un errore: ' + r.status;
    }).catch(function(){
      result.textContent = 'Non risponde. Controlla l’indirizzo, oppure vai avanti e sistemalo dopo.';
    });
  });
  card.appendChild(test);

  buttons(card, { back: true, skip: true, onNext: function(){
    settings.syncUrl = url.value.trim();
    settings.syncToken = token.value.trim();
    save();
    setSyncConfig(settings.syncUrl, settings.syncToken);
    startSync();
    next();
  }});
}

// ---- permessi ----

function stepPermissions(card){
  title(card, 'I permessi del tablet');
  para(card, 'Tocca Consenti su quelli che vuoi usare. Quello che rifiuti resta spento.');

  var list = document.createElement('div');
  list.className = 'setup-perms';

  function perm(name, desc, action){
    var row = document.createElement('div');
    row.className = 'setup-perm';

    var txt = document.createElement('div');
    var t = document.createElement('div');
    t.textContent = name;
    var d = document.createElement('div');
    d.className = 'setup-note';
    d.textContent = desc;
    txt.appendChild(t);
    txt.appendChild(d);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.textContent = 'Consenti';
    btn.addEventListener('click', function(){
      btn.textContent = 'Attendo...';
      action(function(ok, message){
        btn.textContent = ok ? 'Concesso' : 'Non concesso';
        if (message) d.textContent = message;
      });
    });

    row.appendChild(txt);
    row.appendChild(btn);
    list.appendChild(row);
  }

  perm('Microfono', 'Per chiamare il tablet per nome e dargli ordini a voce.', function(done){
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(s){
      s.getTracks().forEach(function(t){ t.stop(); });
      done(true);
    }).catch(function(){ done(false, 'Rifiutato. La voce resterà spenta.'); });
  });

  perm('Fotocamera', 'Per accorgersi di chi passa e per la sentinella.', function(done){
    navigator.mediaDevices.getUserMedia({ video: true }).then(function(s){
      s.getTracks().forEach(function(t){ t.stop(); });
      done(true);
    }).catch(function(){ done(false, 'Rifiutata. Il rilevamento resterà spento.'); });
  });

  perm('Notifiche', 'Per avvisarti sul telefono quando la sentinella rileva qualcosa.', function(done){
    var why = pushBlockedReason();
    if (why) { done(false, why); return; }
    enableNotifications().then(function(r){ done(r.ok, r.message); });
  });

  card.appendChild(list);

  para(card, 'Si spengono quando vuoi dal tasto tondo in alto.');

  buttons(card, { back: true, label: 'Avanti' });
}

// ---- bivio: finire qui, oppure fare anche la parte tecnica ----

function stepFork(card){
  title(card, 'Hai finito');
  para(card, 'Il pannello è già pronto: orologio, meteo, voce, promemoria, spesa, timer e radio.');
  para(card, 'Resta una cosa facoltativa, da fare al computer in una decina di minuti: collegare fra loro i due tablet e i telefoni, così puoi comandare tutto anche da fuori casa. Puoi farla quando vuoi dalle impostazioni.');

  var row = document.createElement('div');
  row.className = 'setup-choice';

  var later = document.createElement('button');
  later.type = 'button';
  later.className = 'setup-big';
  later.innerHTML = '<strong>Finisci qui</strong><span>Le farò con calma</span>';
  later.addEventListener('click', close);

  var now = document.createElement('button');
  now.type = 'button';
  now.className = 'setup-big';
  now.innerHTML = '<strong>Facciamole ora</strong><span>Ho tempo e un computer</span>';
  now.addEventListener('click', function(){
    steps = steps.concat([stepService, stepHours, stepHandoff]);
    next();
  });

  row.appendChild(later);
  row.appendChild(now);
  card.appendChild(row);
}

// ---- passaggio al secondo tablet ----

function stepHandoff(card){
  title(card, 'Gli altri dispositivi');
  para(card, 'Sul secondo tablet e sui telefoni apri lo stesso link che ti ha dato l’installazione. Si collegano da soli e ricevono stanze, promemoria, spesa e impostazioni.');

  if (!settings.syncUrl) {
    note(card, 'Non hai ancora impostato il servizio, quindi per ora ogni dispositivo resta indipendente. Puoi farlo più avanti dalle impostazioni.');
  } else {
    para(card, 'Se il link non ce l’hai sotto mano, sull’altro dispositivo scegli Un altro dispositivo e scrivi questi due valori.');
    var box = document.createElement('div');
    box.className = 'setup-handoff';
    [['Indirizzo del servizio', settings.syncUrl], ['Parola condivisa', settings.syncToken]].forEach(function(r){
      var d = document.createElement('div');
      var l = document.createElement('div');
      l.className = 'setup-note';
      l.textContent = r[0];
      var v = document.createElement('div');
      v.className = 'setup-value';
      v.textContent = r[1] || 'non impostato';
      d.appendChild(l);
      d.appendChild(v);
      box.appendChild(d);
    });
    card.appendChild(box);
  }

  buttons(card, { back: true, label: 'Ho finito', onNext: close });
}

function stepJoin(card){
  title(card, 'Collega questo dispositivo');
  para(card, 'Il modo più semplice: apri su questo dispositivo il link che ti ha dato l’installazione, e si collega da solo. In alternativa scrivi qui i due valori.');

  var url = field(card, 'Indirizzo del servizio', settings.syncUrl || '',
                  'https://qualcosa.workers.dev');
  var token = field(card, 'Parola condivisa', settings.syncToken || '', '');
  var result = note(card, '');

  buttons(card, { back: true, label: 'Aggancia', onNext: function(){
    if (!url.value.trim() || !token.value.trim()) {
      result.textContent = 'Servono tutti e due i valori.';
      return;
    }
    settings.syncUrl = url.value.trim();
    settings.syncToken = token.value.trim();
    save();
    setSyncConfig(settings.syncUrl, settings.syncToken);

    result.textContent = 'Provo a collegarmi...';
    fetch(settings.syncUrl.replace(/\/+$/, '') + '/state', {
      headers: { 'X-Casa-Token': settings.syncToken }
    }).then(function(r){
      if (r.ok) {
        result.textContent = 'Collegato. Sto scaricando la configurazione dal tablet principale.';
        startSync();
        setTimeout(close, 2200);
      } else if (r.status === 401) {
        result.textContent = 'La parola condivisa non corrisponde. Controllala sul tablet principale.';
      } else {
        result.textContent = 'Il servizio risponde con un errore: ' + r.status;
      }
    }).catch(function(){
      result.textContent = 'Non risponde. Controlla l’indirizzo e che il tablet sia in rete.';
    });
  }});
}
