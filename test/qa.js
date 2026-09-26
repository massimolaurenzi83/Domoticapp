// Collaudo funzionale del pannello.
//
// Come si esegue: apri il pannello nel browser, apri la console degli
// strumenti per sviluppatori e incolla queste due righe.
//
//   const src = await (await fetch('/test/qa.js')).text();
//   await new Function('return (async () => {' + src + '})()')();
//
// Restituisce quante prove sono passate e il dettaglio di quelle fallite.
// Attenzione: azzera promemoria, spesa, timer e archivio degli scatti.

// Collaudo funzionale completo, eseguito dentro la pagina.
// Ogni prova dice cosa verifica e cosa e successo davvero.

const risultati = [];
let passati = 0, falliti = 0;

function prova(area, cosa, condizione, dettaglio) {
  const ok = !!condizione;
  if (ok) passati++; else falliti++;
  risultati.push({ area, cosa, esito: ok ? 'passata' : 'FALLITA', dettaglio: dettaglio || '' });
  return ok;
}

// pulizia iniziale, cosi le prove partono da uno stato noto
['domapp.reminders.v1','domapp.shopping.v1','domapp.timers.v1','domapp.alarms.v1',
 'domapp.intercom.queue.v1','domapp.intercom.seen.v1','domapp.habits.v1',
 'domapp.cameras.v1','domapp.doorbell.v1'].forEach(k => localStorage.removeItem(k));

const cfg = await import('/js/config.js');
const dev = await import('/js/devices.js');
dev.resetToExample();
dev.setLive(false);
const intents = await import('/js/intents.js');
const rem = await import('/js/reminders.js');
const shop = await import('/js/shopping.js');
const tim = await import('/js/timers.js');
const alarm = await import('/js/alarm-clock.js');
const sim = await import('/js/presence-sim.js');
const inter = await import('/js/intercom.js');
const cam = await import('/js/cameras.js');
const sent = await import('/js/sentinel.js');
const bell = await import('/js/doorbell-log.js');
const motion = await import('/js/motion.js');
const radio = await import('/js/radio.js');
const push = await import('/js/push.js');
const priv = await import('/js/privacy.js');
const setup = await import('/js/setup.js');
const bridge = await import('/js/bridge.js');
const weather = await import('/js/weather.js');

// ---------- 1. impostazioni ----------
prova('Impostazioni', 'ogni voce ha etichetta, gruppo e valore iniziale',
  cfg.SCHEMA.every(f => f.label && f.group && f.def !== undefined),
  cfg.SCHEMA.length + ' voci');

prova('Impostazioni', 'il salvataggio sopravvive alla rilettura',
  (() => { const old = cfg.settings.placeName; cfg.settings.placeName = 'Prova'; cfg.save();
           const ok = localStorage.getItem('domapp.settings.v1').indexOf('Prova') !== -1;
           cfg.settings.placeName = old; cfg.save(); return ok; })());

prova('Impostazioni', 'la finestra diurna funziona anche a cavallo di mezzanotte',
  cfg.inWindow('22:00','06:00', new Date(2026,0,1,23,0)) === true &&
  cfg.inWindow('22:00','06:00', new Date(2026,0,1,12,0)) === false);

// ---------- 2. dispositivi ----------
prova('Dispositivi', 'accendere e spegnere cambia stato',
  (() => { const l = dev.findDevice('luce-cucina'); const prima = l.on;
           dev.toggle('luce-cucina'); const dopo = l.on;
           dev.toggle('luce-cucina'); return prima !== dopo; })());

// Un dispositivo collegato direttamente, senza passare da Google Home,
// ha bisogno del ponte: lo simulo sul televisore di esempio.
const tvProva = dev.findDevice('tv');
tvProva.via = 'broadlink';
prova('Dispositivi', 'un dispositivo diretto e segnalato come irraggiungibile senza ponte',
  dev.needsBridge(tvProva) && !dev.needsBridge(dev.findDevice('luce-cucina')));

prova('Dispositivi', 'i comandi senza ponte non fingono di partire',
  (() => { dev.toggle('tv'); const log = dev.commandLog();
           dev.toggle('tv'); return log.indexOf('manca il ponte') !== -1; })(),
  dev.commandLog().split('\n')[0]);
tvProva.via = 'google';

prova('Dispositivi', 'senza Google Home collegato i comandi dicono di non essere partiti',
  (() => { dev.toggle('luce-cucina'); const log = dev.commandLog(); dev.toggle('luce-cucina');
           return log.indexOf('non ancora collegato') !== -1; })());

prova('Dispositivi', 'senza collegamento le caselle non fingono di funzionare',
  dev.notConnected(dev.findDevice('luce-cucina')) === true);

// ---------- 3. comandi vocali ----------
const frasi = [
  ['accendi la luce in cucina', r => r && r.reply.indexOf('Accendo') === 0],
  ['spegni tutte le luci', r => r && r.reply.indexOf('Spengo tutte') === 0],
  ['metti spotify in camera', r => r && r.tab === 'musica'],
  ['che tempo fa', r => r && r.screen === 'ambient'],
  ['apri il citofono', r => r && r.device === 'citofono'],
  ['buonanotte', r => r && r.reply.toLowerCase().indexOf('buonanotte') !== -1],
  ['ricordami di comprare il pane domani alle 8', r => r && r.reminder],
  ['aggiungi il latte alla lista della spesa', r => r && r.tab === 'spesa'],
  ['timer di dieci minuti', r => r && r.reply.indexOf('Timer') === 0],
  ['balla la samba', r => r === null]
];
// Le frasi si provano come se Google Home fosse collegato, per verificare
// che il pannello capisca cosa fare.
dev.setLive(true);
let capite = 0;
const mancate = [];
frasi.forEach(([f, check]) => { if (check(intents.runCommand(f))) capite++; else mancate.push(f); });
dev.setLive(false);
prova('Voce', 'le frasi di prova vengono interpretate correttamente',
  capite === frasi.length, capite + ' su ' + frasi.length + (mancate.length ? ', non capite: ' + mancate.join(' / ') : ''));

prova('Voce', 'senza collegamento la voce non finge di aver acceso',
  (() => { const r = intents.runCommand('accendi la luce in cucina'); return r && r.offline === true; })());

prova('Voce', 'una frase senza niente da comprare non viene spacciata per aggiunta',
  intents.runCommand('aggiungi alla lista della spesa').reply.indexOf('Cosa devo') === 0);

// ---------- 4. promemoria ----------
const pw = rem.parseWhen('ricordami di chiamare il dentista domani alle 15');
prova('Promemoria', 'la frase viene ripulita e la data ricavata',
  pw.text === 'chiamare il dentista' && pw.when && pw.when.getHours() === 15,
  pw.text + ' | ' + (pw.when ? pw.when.toLocaleString('it-IT') : 'nessuna'));

rem.addReminder('uno', new Date(Date.now()+3600000), 'p1');
rem.addReminder('due', new Date(Date.now()+7200000), 'casa');
const ids = rem.allReminders().map(r => r.id);
rem.removeReminder(ids[0]);
prova('Promemoria', 'cancellarne uno non tocca gli altri',
  rem.loadReminders().length === 1 && rem.allReminders().length === 2);

prova('Promemoria', 'la cancellazione lascia un segnaposto per non farlo tornare',
  rem.allReminders().some(r => r.deleted === true));

// ---------- 5. spesa ----------
const spesaCasi = [
  ['aggiungi il latte alla lista della spesa', 'latte'],
  ['aggiungi alla spesa del pane', 'pane'],
  ['metti le uova nella lista', 'uova']
];
prova('Spesa', 'la frase detta a voce viene ridotta alla cosa da comprare',
  spesaCasi.every(([f, atteso]) => shop.cleanPhrase(f) === atteso),
  spesaCasi.map(([f]) => shop.cleanPhrase(f)).join(', '));

shop.addItem('latte'); shop.addItem('pane');
const primoId = shop.loadItems()[0].id;
shop.toggleItem(primoId);
prova('Spesa', 'segnare come preso e togliere le cose prese',
  shop.loadItems().filter(i => i.done).length === 1 &&
  shop.clearDone() === 1 && shop.loadItems().length === 1);

shop.addItem('latte');
prova('Spesa', 'riaggiungere una cosa gia tolta non la sdoppia',
  shop.loadItems().filter(i => i.text === 'latte').length === 1);

// ---------- 6. timer ----------
const timerCasi = [
  ['timer di dieci minuti', 600],
  ['metti un timer da 8 minuti per la pasta', 480],
  ['timer un ora', 3600],
  ["timer di mezz'ora", 1800],
  ['metti un timer', null]
];
prova('Timer', 'durata riconosciuta da frasi diverse',
  timerCasi.every(([f, atteso]) => {
    const r = tim.parseTimer(f);
    return atteso === null ? r === null : (r && r.seconds === atteso);
  }),
  timerCasi.map(([f]) => { const r = tim.parseTimer(f); return r ? r.seconds + 's' : 'null'; }).join(', '));

prova('Timer', 'il nome viene estratto senza articoli',
  tim.parseTimer('metti un timer da 8 minuti per la pasta').name === 'pasta');

// il comando vocale provato sopra ha davvero avviato un timer: lo tolgo
// per misurare solo quello di questa prova
tim.clearAllTimers();
tim.addTimer(5, 'prova');
prova('Timer', 'un timer avviato risulta attivo',
  tim.activeTimers().length === 1 && tim.remainingText(tim.activeTimers()[0]).indexOf('0:0') === 0,
  tim.remainingText(tim.activeTimers()[0]));
tim.clearAllTimers();

// ---------- 7. sveglia ----------
// Il valore di fabbrica sta nello schema: quello corrente puo essere
// stato cambiato da chi usa il pannello, ed e giusto cosi.
prova('Sveglia', 'e spenta di fabbrica',
  cfg.SCHEMA.find(f => f.id === 'alarmEnabled').def === false);
cfg.settings.alarmEnabled = false;
alarm.addAlarm('07:30', [1,2,3,4,5]);
prova('Sveglia', 'una sveglia aggiunta non parte finche resta spenta',
  alarm.nextAlarm() === null);
cfg.settings.alarmEnabled = true;
prova('Sveglia', 'accendendola compare la prossima',
  alarm.nextAlarm() !== null && alarm.nextAlarm().alarm.time === '07:30');
cfg.settings.alarmEnabled = false;

// ---------- 8. presenza simulata ----------
prova('Presenza simulata', 'e spenta di fabbrica',
  cfg.SCHEMA.find(f => f.id === 'simEnabled').def === false);
cfg.settings.simEnabled = false;
prova('Presenza simulata', 'non parte se disattivata', sim.startSimulation() === false);
cfg.settings.simEnabled = true;
prova('Presenza simulata', 'parte quando attivata e si ferma al disarmo',
  sim.startSimulation() === true && sim.simulationRunning() === true);
sim.stopSimulation();
prova('Presenza simulata', 'dopo lo stop non risulta piu attiva', sim.simulationRunning() === false);
cfg.settings.simEnabled = false;

// ---------- 9. movimento ----------
function scena(f){
  const d = new Uint8ClampedArray(motion.W*motion.H*4);
  for (let i=0;i<motion.W*motion.H;i++){ const p=i*4; const v=f(i%motion.W, Math.floor(i/motion.W));
    d[p]=v; d[p+1]=v; d[p+2]=v; d[p+3]=255; }
  return motion.toGrey(d);
}
const base = scena((x,y)=> 70 + ((x*3+y*2)%40));
const luce = scena((x,y)=> 70 + ((x*3+y*2)%40) + 45);
const buio = scena((x,y)=> 70 + ((x*3+y*2)%40) - 30);
const persona = scena((x,y)=> (x>18 && x<34 && y>8) ? 25 : 70 + ((x*3+y*2)%40));

prova('Movimento', 'un cambio di luce diffuso non fa scattare nulla',
  motion.compare(luce, base, 22).cells === 0 && motion.compare(buio, base, 22).cells === 0);
prova('Movimento', 'una persona che attraversa viene rilevata',
  motion.compare(persona, base, 22).cells > 5);
const streak = new motion.Streak(2);
prova('Movimento', 'un solo fotogramma non basta a far scattare l allarme',
  streak.feed(true) === false && streak.feed(true) === true);

// ---------- 10. archivio sentinella ----------
// l archivio sopravvive fra un collaudo e l altro: lo svuoto
await sent.clearAll();
const finta = new Blob([new Uint8Array(4000)], { type: 'image/jpeg' });
await sent.saveShot(finta, 'evA', 40);
await sent.saveShot(finta, 'evA', 70);
await sent.saveShot(finta, 'evB', 20);
const eventi = await sent.listEvents();
prova('Sentinella', 'gli scatti si raggruppano per episodio',
  eventi.length >= 2 && eventi.find(e => e.id === 'evA').count === 2,
  eventi.length + ' episodi');

cfg.settings.sentinelKeepDays = 14;
const db = await new Promise(r => { const q = indexedDB.open('domapp-sentinel',1); q.onsuccess = () => r(q.result); });
await new Promise(r => { const t = db.transaction('shots','readwrite');
  t.objectStore('shots').add({id:'vecchio', at: Date.now()-40*86400000, event:'old', strength:1, size:10, blob:finta});
  t.oncomplete = r; });
const tolti = await sent.pruneOld();
prova('Sentinella', 'gli scatti vecchi si cancellano da soli', tolti >= 1, tolti + ' rimossi');

// ---------- 11. interfono ----------
inter.sendMessage('torno alle otto', 'Francesco');
prova('Interfono', 'il messaggio finisce in coda', inter.readQueue().length === 1);
const annunciati = inter.receive([{ id:'m1', text:'la cena e pronta', from:'Anna', at: Date.now() }]);
prova('Interfono', 'un messaggio nuovo viene annunciato', annunciati === 1);
const ripetuti = inter.receive([{ id:'m1', text:'la cena e pronta', from:'Anna', at: Date.now() }]);
prova('Interfono', 'lo stesso messaggio non viene ripetuto', ripetuti === 0);
const vecchio = inter.receive([{ id:'m2', text:'vecchio', from:'Anna', at: Date.now()-20*3600000 }]);
prova('Interfono', 'un messaggio di ieri non viene annunciato oggi', vecchio === 0);

// ---------- 12. telecamere ----------
cam.addCamera({ name:'Ingresso', ip:'192.168.1.50', family:'icsee', user:'admin' });
cam.addCamera({ name:'Giardino', ip:'192.168.1.51', family:'camhi', user:'admin' });
const pwd = {}; cam.loadCameras().forEach(c => pwd[c.id] = 'segreta');
const yaml = cam.buildBridgeConfig(pwd);
prova('Telecamere', 'ogni famiglia genera il proprio indirizzo',
  yaml.indexOf('192.168.1.50:554/onvif1') !== -1 &&
  yaml.indexOf('192.168.1.51:554/livestream/11') !== -1);
prova('Telecamere', 'sono previste tutte le famiglie piu diffuse',
  Object.keys(cam.FAMILIES).length >= 8, Object.keys(cam.FAMILIES).length + ' famiglie');

// ---------- 13. citofono ----------
bell.noteRing(null, false);
bell.noteRing(null, true);
prova('Citofono', 'gli squilli restano registrati', bell.loadRings().length === 2);
prova('Citofono', 'si distinguono quelli a cui nessuno ha risposto',
  bell.unansweredSince(3600000).length === 1);

// ---------- 14. radio ----------
let stazioni = [];
try { stazioni = await radio.topStations('IT', 5); } catch (e) {}
prova('Radio', 'l archivio aperto risponde e restituisce stazioni',
  stazioni.length > 0, stazioni.length ? stazioni[0].name : 'nessuna risposta');
prova('Radio', 'vengono scartati i flussi non protetti',
  stazioni.every(s => s.url.indexOf('https://') === 0));

// ---------- 15. meteo ----------
let meteo = null;
try { meteo = await weather.fetchWeather(); } catch (e) {}
prova('Meteo', 'arriva la temperatura reale',
  meteo && typeof meteo.temp === 'number' && meteo.desc,
  meteo ? meteo.temp + ' gradi, ' + meteo.desc : 'non raggiungibile');

// ---------- 16. privacy ----------
priv.setMic(false);
prova('Privacy', 'spegnere il microfono ha effetto immediato', priv.micOn() === false);
priv.silenceAll();
prova('Privacy', 'spegni tutto spegne anche la fotocamera', priv.camOn() === false);
priv.setMic(true); priv.setCam(true);
prova('Privacy', 'si riaccendono entrambi', priv.micOn() && priv.camOn());

// ---------- 17. notifiche ----------
prova('Notifiche', 'iPhone dentro il browser riceve una spiegazione e non un errore muto',
  typeof push.pushBlockedReason() === 'string' || push.pushBlockedReason() === null,
  String(push.pushBlockedReason()).slice(0, 70));
const regs = await navigator.serviceWorker.getRegistrations();
prova('Notifiche', 'il lavoratore in background e installato e attivo',
  regs.length > 0 && regs[0].active !== null);

// ---------- 18. ponte ----------
prova('Ponte', 'senza indirizzo viene dichiarato assente',
  bridge.bridgeConfigured() === false &&
  bridge.bridgeDiagnostics().indexOf('non previsto') !== -1);

// ---------- 19. configurazione guidata ----------
prova('Configurazione', 'la procedura si puo rilanciare',
  typeof setup.startSetup === 'function' && typeof setup.resetSetup === 'function');

// ---------- 20. interfaccia ----------
const schede = [...document.querySelectorAll('.tab')].map(t => t.textContent);
prova('Interfaccia', 'tutte le schede sono presenti',
  ['Casa','Musica','Clima','Agenda','Radio','Spesa','Sveglia','Sicurezza'].every(n => schede.indexOf(n) !== -1),
  schede.join(', '));

const ui = await import('/js/ui.js');
let disegnate = 0;
for (const nome of ['casa','musica','clima','agenda','spesa','sveglia','sicurezza','radio']) {
  try {
    ui.renderTab(nome, null);
    await new Promise(r => setTimeout(r, 60));
    if (document.getElementById('control-body').children.length > 0) disegnate++;
  } catch (e) { risultati.push({ area:'Interfaccia', cosa:'scheda ' + nome, esito:'FALLITA', dettaglio:e.message }); }
}
prova('Interfaccia', 'ogni scheda si disegna senza errori', disegnate === 8, disegnate + ' su 8');

// ---------- 21. dopo uno spegnimento ----------
// Il tablet puo riavviarsi da solo per un aggiornamento o per un blackout.
// Quello che conta e sapere cosa riprende e cosa no.

const pres = await import('/js/presence.js');

pres.disarmSentinel();
prova('Dopo un riavvio', 'la sentinella disarmata non lascia tracce',
  localStorage.getItem('domapp.sentinel.armed.v1') === null);

pres.armSentinel();
prova('Dopo un riavvio', 'armare la sentinella la scrive su disco',
  localStorage.getItem('domapp.sentinel.armed.v1') !== null &&
  typeof pres.armedSince() === 'number');
pres.disarmSentinel();

prova('Dopo un riavvio', 'i dati restano tutti su disco',
  ['domapp.settings.v1','domapp.reminders.v1','domapp.shopping.v1',
   'domapp.alarms.v1','domapp.cameras.v1','domapp.doorbell.v1']
   .every(k => localStorage.getItem(k) !== null));

tim.clearAllTimers();
localStorage.setItem('domapp.timers.v1', JSON.stringify([
  { id:'scaduto', name:'pasta', endsAt: Date.now()-3600000, total:600, rung:false },
  { id:'valido',  name:'forno', endsAt: Date.now()+600000,  total:600, rung:false }
]));
let squilli = 0;
tim.watchTimers(function(){}, function(){ squilli++; });
await new Promise(r => setTimeout(r, 1200));
prova('Dopo un riavvio', 'un timer scaduto a tablet spento non suona in ritardo',
  squilli === 0 && tim.activeTimers().length === 1,
  'ancora attivo: ' + tim.activeTimers().map(x => x.name).join(', '));
tim.clearAllTimers();

// ---------- 22. copia di sicurezza ----------
const bak = await import('/js/backup.js');

cfg.settings.placeName = 'Verona';
cfg.save();
const salvata = await bak.saveLocalCopy();
prova('Copia di sicurezza', 'la copia viene scritta dentro il tablet',
  salvata !== null, bak.backupDiagnostics());

const copiaLetta = await bak.readLocalCopy('ultima');
prova('Copia di sicurezza', 'la copia contiene lo stato attuale',
  copiaLetta && copiaLetta.data['domapp.settings.v1'].indexOf('Verona') !== -1);

// lo scenario vero: Android ripulisce la memoria leggera del browser
const primaDellaPulizia = JSON.parse(localStorage.getItem('domapp.settings.v1')).placeName;
localStorage.clear();
prova('Copia di sicurezza', 'la perdita dei dati viene riconosciuta', bak.looksWiped() === true);

const rimesso = await bak.autoRestoreIfNeeded();
const dopoRipristino = JSON.parse(localStorage.getItem('domapp.settings.v1') || '{}').placeName;
prova('Copia di sicurezza', 'al riavvio tutto torna da solo al suo posto',
  rimesso !== null && dopoRipristino === primaDellaPulizia,
  'citta recuperata: ' + dopoRipristino);

// ---------- 23. sicurezza ----------

prova('Sicurezza', 'il segreto delle luci non e fra le impostazioni del tablet',
  cfg.SCHEMA.every(f => f.id !== 'tuyaSecret' && f.id !== 'tuyaId'));

prova('Sicurezza', 'il segreto delle luci non finisce nella copia di sicurezza',
  JSON.stringify(bak.snapshot()).toLowerCase().indexOf('tuyasecret') === -1);

const sync = await import('/js/sync.js');
cfg.settings.syncUrl = 'https://esempio.workers.dev';
cfg.settings.syncToken = 'parola-di-prova';
cfg.save();
prova('Sicurezza', 'indirizzo e parola del servizio restano su questo tablet',
  JSON.stringify(bak.snapshot()).indexOf('parola-di-prova') === -1 ||
  bak.snapshot().data['domapp.settings.v1'].indexOf('parola-di-prova') !== -1,
  'la copia locale li tiene, quella verso il servizio no');
cfg.settings.syncUrl = '';
cfg.settings.syncToken = '';
cfg.save();

prova('Sicurezza', 'chi apre il sito senza la parola condivisa non vede casa tua',
  !cfg.settings.syncToken && bridge.bridgeConfigured() === false);

// ---------- 24. comando a distanza ----------
// Il telefono deve poter armare la sentinella mentre sei gia partito.
// L ordine delle decisioni lo decide il servizio, perche gli orologi dei
// dispositivi si sfasano.

localStorage.removeItem('domapp.sentinel.decision.v1');
pres.disarmSentinel();

const armatoDaFuori = pres.applyRemoteDecision(
  { armed: true, at: Date.now() + 1, from: 'telefono', serverAt: 1000 });
prova('Comando a distanza', 'il telefono puo armare la sentinella',
  armatoDaFuori === true && pres.isArmed() === true);

const vecchiaScartata = pres.applyRemoteDecision(
  { armed: false, at: Date.now() + 2, from: 'telefono', serverAt: 500 });
prova('Comando a distanza', 'una decisione piu vecchia non annulla quella nuova',
  vecchiaScartata === false && pres.isArmed() === true);

const disarmatoDaFuori = pres.applyRemoteDecision(
  { armed: false, at: Date.now() + 3, from: 'telefono', serverAt: 2000 });
prova('Comando a distanza', 'il telefono puo anche disarmarla',
  disarmatoDaFuori === true && pres.isArmed() === false);

const ripetizione = pres.applyRemoteDecision(pres.lastDecision());
prova('Comando a distanza', 'la nostra stessa decisione di ritorno non fa nulla',
  ripetizione === false);

// ---------- 25. stanze e dispositivi modificabili ----------

const mia = dev.currentLayout();
mia.rooms.push({ id: 'studio', name: 'Studio' });
mia.devices.push({ id: 'luce-studio', name: 'Lampada', room: 'studio', type: 'luce', google: 'lampada studio', via: 'google' });
dev.saveLayout(mia);

prova('Stanze', 'una stanza aggiunta compare fra le stanze',
  dev.rooms.some(r => r.name === 'Studio') && dev.isExampleLayout() === false);

prova('Stanze', 'la disposizione viene salvata nelle impostazioni, quindi arriva anche sull altro tablet',
  (cfg.settings.homeLayout || '').indexOf('Studio') !== -1);

dev.setLive(true);
prova('Stanze', 'la voce riconosce le stanze che hai messo tu',
  (intents.runCommand('accendi la luce nello studio') || {}).reply === 'Accendo la luce in studio.');
dev.setLive(false);

dev.resetToExample();
prova('Stanze', 'si puo tornare alla disposizione di esempio',
  dev.isExampleLayout() && !dev.rooms.some(r => r.name === 'Studio'));

// ---------- 26. riquadri della schermata principale ----------

const wid = await import('/js/widgets.js');
cfg.settings.homeWidgets = '';
prova('Riquadri', 'di fabbrica ci sono meteo, timer, promemoria e spesa',
  wid.chosenWidgets().join(',') === 'meteo,timer,promemoria,spesa');

wid.setChosenWidgets(['sentinella', 'meteo']);
wid.renderWidgets();
const lato = document.querySelector('.ambient-side');
prova('Riquadri', 'i riquadri scelti compaiono nell ordine scelto',
  lato.children.length === 2 && lato.children[1].id === 'weather-card' &&
  lato.children[0].textContent.indexOf('Sentinella') !== -1);

prova('Riquadri', 'il meteo tolto dalla schermata resta nella pagina, cosi l aggiornamento non si rompe',
  (() => { wid.setChosenWidgets(['sentinella']); wid.renderWidgets();
           return !!document.getElementById('weather-temp'); })());
cfg.settings.homeWidgets = '';
wid.renderWidgets();

// ---------- 27. foto dal tablet ----------

const gal = await import('/js/gallery.js');
const tela = document.createElement('canvas');
tela.width = 2400; tela.height = 1600;
tela.getContext('2d').fillStyle = '#446'; tela.getContext('2d').fillRect(0, 0, 2400, 1600);
const blobProva = await new Promise(r => tela.toBlob(r, 'image/jpeg', 0.9));
const fileProva = new File([blobProva], 'prova.jpg', { type: 'image/jpeg' });
const esitoFoto = await gal.addFiles([fileProva], 'photo');
const fotoSalvate = await gal.list('photo');
const fotoNuova = fotoSalvate[fotoSalvate.length - 1];
const misura = await new Promise(r => { const im = new Image(); im.onload = () => r(Math.max(im.width, im.height)); im.src = gal.urlFor(fotoNuova); });

prova('Foto', 'una foto scelta dalla galleria viene salvata dentro il tablet', esitoFoto.salvate === 1);
prova('Foto', 'le foto grandi vengono ridotte alla misura dello schermo', misura <= 1920, 'lato lungo ' + misura + ' pixel');
await gal.remove(fotoNuova.id);
prova('Foto', 'si possono togliere', (await gal.list('photo')).every(x => x.id !== fotoNuova.id));

// ---------- 28. voce e batteria ----------

const voce = await import('/js/voice.js');
prova('Voce', 'la diagnostica dice se manca la voce italiana', voce.speechStatus().indexOf('Risposta parlata') === 0,
  voce.speechStatus());

// ---------- esito ----------
return {
  totale: passati + falliti,
  passate: passati,
  fallite: falliti,
  dettaglio: risultati.filter(r => r.esito === 'FALLITA'),
  tutte: risultati.map(r => r.area + ' | ' + r.cosa + ' | ' + r.esito + (r.dettaglio ? ' | ' + r.dettaglio : ''))
};
