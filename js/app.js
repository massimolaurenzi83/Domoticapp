// Ciclo principale della plancia.
//
// Tre schermate che si alternano da sole:
//   PHOTOS   cornice fotografica, solo nella finestra diurna
//   AMBIENT  orologio, meteo e musica in corso
//   CONTROL  plancia di controllo, al tocco
//
// Il passaggio di una persona porta alla stazione meteo, il tocco porta
// ai controlli, e dopo il tempo di risveglio si torna allo stato di riposo.

import { settings, isDaytime, isSleepHours } from './config.js';
import { initScreen, applyScheduledBrightness, screenDiagnostics } from './screen.js';
import { startPresence, stopPresence, presenceDiagnostics, armSentinel, disarmSentinel, isArmed, armedSince } from './presence.js';
import { fetchWeather, weatherDiagnostics } from './weather.js';
import { loadPhotos, nextPhoto, photoCount } from './photos.js';
import { buildSettings, renderTab, timeString, dateString, agendaHooks, currentProfile } from './ui.js';
import { parseWhen, addReminder, describeWhen } from './reminders.js';
import { pinOk, pinRequired } from './profiles.js';
import { securityHooks } from './security-view.js';
import { setupDone, startSetup, resetSetup } from './setup.js';
import { startBackups, saveLocalCopy, pushToService, downloadFile, readFile,
         restore, backupDiagnostics, pullFromService } from './backup.js';
import { bridgeDiagnostics, checkBridge } from './bridge.js';
import { startSimulation, stopSimulation, simulationDiagnostics, noteHabit, simulationRunning } from './presence-sim.js';
import { startAlarms, alarmDiagnostics } from './alarm-clock.js';
import { watchTimers, activeTimers, remainingText, addTimer, spokenDuration } from './timers.js';
import { registerWorker, enableNotifications, notificationsActive, pushBlockedReason, isIOS, isStandalone } from './push.js';
import { micOn, camOn, setMic, setCam, silenceAll, onPrivacyChange, privacySummary } from './privacy.js';
import { setSyncConfig, startSync, syncConfigured, syncStatus, touch } from './sync.js';
import { setIntercomHandler } from './intercom.js';
import { commandLog, onToggle } from './devices.js';
import { loadWallpapers, applyWallpaper } from './wallpaper.js';
import { startVoice, stopVoice, say, voiceAvailable, voiceDiagnostics, captureNext } from './voice.js';
import { runCommand } from './intents.js';

var screens = {
  photos:  document.getElementById('screen-photos'),
  ambient: document.getElementById('screen-ambient'),
  control: document.getElementById('screen-control')
};

var currentScreen = '';
var awakeUntil = 0;
var photoTimer = null;
var photoSlot = 'a';
var settingsOpen = false;

function show(name){
  if (currentScreen === name) return;
  for (var k in screens) screens[k].className = 'screen' + (k === name ? ' is-on' : '');
  currentScreen = name;
  if (name === 'photos') startPhotoLoop(); else stopPhotoLoop();
}

function idleScreen(){
  var canShowPhotos = settings.photosEnabled && isDaytime() && photoCount() > 0;
  return canShowPhotos ? 'photos' : 'ambient';
}

function isAwake(){ return Date.now() < awakeUntil; }

function wake(toControl){
  awakeUntil = Date.now() + settings.wakeSeconds * 1000;
  show(toControl ? 'control' : 'ambient');
}

// ---------- cornice ----------

function startPhotoLoop(){
  if (photoTimer) return;
  swapPhoto();
  photoTimer = setInterval(swapPhoto, Math.max(5, settings.photoSeconds) * 1000);
}

function stopPhotoLoop(){
  if (photoTimer) { clearInterval(photoTimer); photoTimer = null; }
}

function swapPhoto(){
  var p = nextPhoto();
  if (!p) return;
  var incoming = photoSlot === 'a' ? 'b' : 'a';
  var elIn = document.getElementById('photo-' + incoming);
  var elOut = document.getElementById('photo-' + photoSlot);

  var img = new Image();
  img.onload = function(){
    elIn.style.backgroundImage = 'url("' + p.src + '")';
    elIn.className = 'photo-layer is-on';
    elOut.className = 'photo-layer';
    photoSlot = incoming;
    document.getElementById('photo-caption').textContent = p.caption;
  };
  img.src = p.src;
}

// ---------- battito ----------

function tick(){
  var now = new Date();
  var t = timeString(now);
  document.getElementById('photo-clock').textContent = t;
  document.getElementById('clock-big').textContent = t;
  document.getElementById('control-clock').textContent = t;
  document.getElementById('clock-date').textContent = dateString(now);

  applyScheduledBrightness(isAwake() || settingsOpen);
  paintTimers();

  if (!isAwake() && !settingsOpen && currentScreen === 'control') show(idleScreen());
  if (!isAwake() && !settingsOpen) {
    var want = isSleepHours() ? 'ambient' : idleScreen();
    if (currentScreen !== want) show(want);
  }
}

// ---------- meteo ----------

var lastWeatherError = '';

var lastWeather = null;

// Trasforma il meteo in una frase da dire ad alta voce, con i numeri
// scritti come si pronunciano: la sintesi vocale legge male il simbolo dei
// gradi e le barre.
function weatherSentence(w){
  if (!w) return 'Non ho ancora il meteo, riprova fra poco.';
  var frase = 'A ' + (settings.placeName || 'casa') + ' ci sono ' + w.temp +
              (w.temp === 1 || w.temp === -1 ? ' grado' : ' gradi') + ', ' + w.desc + '.';
  if (w.min !== null && w.max !== null) {
    frase += ' Oggi minima ' + w.min + ' e massima ' + w.max + '.';
  }
  return frase;
}

function refreshWeather(){
  fetchWeather().then(function(w){
    lastWeather = w;
    document.getElementById('weather-temp').textContent = w.temp + '\u00B0';
    var line = w.desc;
    if (w.min !== null && w.max !== null) line += '  ' + w.min + '\u00B0 / ' + w.max + '\u00B0';
    document.getElementById('weather-desc').textContent = line;
    document.getElementById('weather-place').textContent = settings.placeName;
  }).catch(function(e){
    lastWeatherError = (e && e.message) ? e.message : 'errore sconosciuto';
    document.getElementById('weather-desc').textContent = 'nessun servizio meteo raggiungibile';
  });
}

// ---------- impostazioni ----------

function openSettings(){
  settingsOpen = true;
  buildSettings(function(id){
    touch(id);
    if (id === 'syncUrl' || id === 'syncToken') setSyncConfig(settings.syncUrl, settings.syncToken);
    if (id === 'photoSeconds') { stopPhotoLoop(); if (currentScreen === 'photos') startPhotoLoop(); }
    if (id === 'lat' || id === 'lon' || id === 'placeName') refreshWeather();
    if (id === 'voiceEnabled') { stopVoice(); setupVoice(); }
  });
  document.getElementById('settings').hidden = false;
  updateDiagnostics();
}

function closeSettings(){
  settingsOpen = false;
  document.getElementById('settings').hidden = true;
  awakeUntil = Date.now() + settings.wakeSeconds * 1000;
}

function updateDiagnostics(){
  var lines = [
    screenDiagnostics(),
    presenceDiagnostics(),
    voiceDiagnostics(),
    weatherDiagnostics() + (lastWeatherError ? ' | ultimo errore: ' + lastWeatherError : ''),
    bridgeDiagnostics(),
    backupDiagnostics(),
    simulationDiagnostics(),
    alarmDiagnostics(),
    'Allineamento: ' + (syncConfigured() ? syncStatus() : 'solo questo tablet'),
    'Notifiche: ' + (notificationsActive() ? 'attive' : (pushBlockedReason() || 'da attivare')),
    'Telefono: ' + (isIOS() ? ('iPhone, ' + (isStandalone() ? 'aperta dalla schermata Home' : 'aperta dentro il browser')) : 'Android o altro'),
    'Foto caricate: ' + photoCount(),
    'Contesto sicuro: ' + (window.isSecureContext ? 'si' : 'no, la fotocamera restera spenta'),
    'Schermo: ' + window.innerWidth + ' per ' + window.innerHeight,
    '',
    'Ultimi comandi:',
    commandLog() || 'nessuno'
  ];
  document.getElementById('diag').textContent = lines.join('\n');
}

// ---------- avvio ----------

function boot(){
  initScreen();
  renderTab('casa', function(){ awakeUntil = Date.now() + settings.wakeSeconds * 1000; });

  var tabs = document.getElementById('tabs').getElementsByClassName('tab');
  for (var i = 0; i < tabs.length; i++) {
    (function(btn){
      btn.addEventListener('click', function(){
        for (var j = 0; j < tabs.length; j++) tabs[j].className = 'tab';
        btn.className = 'tab is-active';
        renderTab(btn.getAttribute('data-tab'), null);
        awakeUntil = Date.now() + settings.wakeSeconds * 1000;
      });
    })(tabs[i]);
  }

  agendaHooks.onDictate = function(){ captureNext(); };

  setIntercomHandler(function(list){
    var last = list[list.length - 1];
    bumpAwake();
    show('ambient');
    showVoiceBar('Messaggio da ' + last.from, last.text);
  });

  securityHooks.isArmed = isArmed;
  securityHooks.onArm = function(){ armSentinel(); startSimulation(); bumpAwake(); };
  securityHooks.onDisarm = function(){ disarmSentinel(); stopSimulation(); bumpAwake(); };

  document.getElementById('btn-close-bridge').addEventListener('click', function(){
    document.getElementById('bridge-conf').hidden = true;
  });
  document.getElementById('btn-copy-bridge').addEventListener('click', function(){
    var area = document.getElementById('bridge-text');
    area.select();
    try { document.execCommand('copy'); } catch (e) {}
  });

  setupPrivacyPanel();
  onPrivacyChange(applyPrivacy);

  document.getElementById('btn-settings').addEventListener('click', function(){
    if (!pinRequired()) { openSettings(); return; }
    var entered = window.prompt('Codice impostazioni');
    if (entered === null) return;
    if (pinOk(entered)) openSettings();
    else showVoiceBar('', 'Codice errato.');
  });
  document.getElementById('btn-close-settings').addEventListener('click', closeSettings);
  document.getElementById('btn-redo-setup').addEventListener('click', function(){
    closeSettings();
    resetSetup();
    startSetup(function(){ renderCurrentTab(); refreshWeather(); });
  });
  document.getElementById('btn-push').addEventListener('click', function(){
    var btn = document.getElementById('btn-push');
    btn.textContent = 'Attendo...';
    enableNotifications().then(function(r){
      btn.textContent = r.ok ? 'Notifiche attive' : 'Attiva notifiche';
      document.getElementById('diag').textContent = r.message;
      updateDiagnostics();
    });
  });

  document.getElementById('btn-cam-test').addEventListener('click', function(){
    startCamera().then(updateDiagnostics);
  });
  document.getElementById('btn-door-dismiss').addEventListener('click', function(){
    document.getElementById('doorbell').hidden = true;
  });
  document.getElementById('btn-door-open').addEventListener('click', function(){
    document.getElementById('doorbell').hidden = true;
  });

  document.addEventListener('click', function(ev){
    if (settingsOpen) return;
    if (ev.target.closest && ev.target.closest('.tile')) return;
    wake(true);
  });

  if (!setupDone()) {
    startSetup(function(){
      refreshWeather();
      renderCurrentTab();
      setupVoice();
      if (settings.presenceEnabled) startCamera();
    });
  }

  loadWallpapers();
  loadPhotos().then(function(){ show(idleScreen()); });
  refreshWeather();
  setInterval(refreshWeather, 15 * 60 * 1000);

  tick();
  setInterval(tick, 1000);

  if (settings.presenceEnabled) startCamera();
  setupVoice();

  onToggle(noteHabit);

  startBackups();
  setupBackupButtons();

  // Se il tablet si e riavviato mentre la sentinella era armata, la
  // sorveglianza riprende da sola e lo schermo lo dice.
  if (isArmed()) {
    startSimulation();
    var da = armedSince();
    var quando = da ? new Date(da).toLocaleString('it-IT') : 'prima del riavvio';
    setTimeout(function(){
      showVoiceBar('Sentinella ancora armata', 'Sorveglianza ripresa. Armata dal ' + quando + '.');
    }, 1500);
  }

  registerWorker();
  checkBridge();

  startAlarms(function(alarm, progress){
    if (progress >= 1) { bumpAwake(); show('ambient'); }
  });

  watchTimers(paintTimers, function(t){
    bumpAwake();
    show('ambient');
    var what = t.name ? 'Il timer ' + t.name : 'Il timer';
    showVoiceBar('', what + ' e finito.');
    if (settings.voiceReply) say(what + ' e finito.');
  });

  setSyncConfig(settings.syncUrl, settings.syncToken);
  startSync(function(){
    renderCurrentTab();
    applyWallpaper();
    refreshWeather();

    // La sentinella puo essere stata armata dal telefono: qui il pannello
    // se ne accorge e si adegua.
    if (isArmed() && !simulationRunning()) startSimulation();
    if (!isArmed() && simulationRunning()) stopSimulation();
  });
}

// ---------- voce ----------

var voiceBarTimer = null;

// Piccola scritta in alto a destra, al posto del pallino, quando la voce
// non puo partire. Meglio dire cosa fare che sparire senza spiegazioni.
function micHint(text){
  var el = document.getElementById('mic-hint');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mic-hint';
    el.style.cssText = 'position:absolute;top:12px;right:16px;z-index:18;font-size:13px;' +
      'color:#9aa0a8;background:#14171b;padding:6px 12px;border-radius:999px;pointer-events:none;';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.hidden = !text;
}

function setupVoice(){
  var dot = document.getElementById('mic-dot');
  if (!settings.voiceEnabled || !voiceAvailable()) { dot.hidden = true; return; }

  var ok = startVoice({
    onStateChange: function(state){
      dot.hidden = (state !== 'listening' && state !== 'capturing');
      if (state === 'capturing') showVoiceBar('', 'Ti ascolto, detta il promemoria.');
      // Il passaggio a fermo arriva subito dopo un rifiuto: non deve
      // cancellare l avviso che spiega cosa e successo.
      if (state !== 'idle') {
        micHint(state === 'needs-touch'
          ? 'Tocca lo schermo per attivare la voce'
          : (state === 'denied' ? 'Microfono non consentito da Chrome' : ''));
      }
    },
    onCommand: function(rest, full, captured){
      awakeUntil = Date.now() + settings.wakeSeconds * 1000;

      if (captured) { saveDictated(rest); return; }

      var result = runCommand(rest);

      if (result && result.reminder) { saveDictated(rest); return; }

      if (!result) {
        showVoiceBar(rest, 'Non ho capito.');
        if (settings.voiceReply) say('Non ho capito.');
        return;
      }

      if (result.tab) selectTab(result.tab);
      show(result.screen === 'ambient' ? 'ambient' : 'control');
      if (result.device === 'citofono') document.getElementById('doorbell').hidden = false;

      if (result.screen === 'control') renderCurrentTab();
      if (result.weather) result.reply = weatherSentence(lastWeather);
      showVoiceBar(rest, result.reply);
      if (settings.voiceReply) say(result.reply);
    }
  });
  dot.hidden = !ok;
}

// ---------- microfono e fotocamera ----------

// ---------- copia di sicurezza ----------

function setupBackupButtons(){
  var esito = document.getElementById('backup-note');

  document.getElementById('btn-backup-now').addEventListener('click', function(){
    esito.textContent = 'Salvo...';
    saveLocalCopy().then(function(at){
      if (!at) { esito.textContent = 'Non sono riuscito a salvare la copia.'; return; }
      return pushToService().then(function(suServizio){
        esito.textContent = 'Copia salvata sul tablet' +
          (suServizio ? ' e sul servizio.' : '. Il servizio non e raggiungibile.');
        updateDiagnostics();
      });
    });
  });

  document.getElementById('btn-backup-file').addEventListener('click', function(){
    var nome = downloadFile();
    esito.textContent = 'Scaricato il file ' + nome + '. Tienilo da parte.';
  });

  var picker = document.getElementById('backup-file');
  document.getElementById('btn-backup-load').addEventListener('click', function(){
    picker.click();
  });

  picker.addEventListener('change', function(){
    if (!picker.files || !picker.files[0]) return;
    esito.textContent = 'Leggo il file...';
    readFile(picker.files[0]).then(function(copy){
      var quando = new Date(copy.at).toLocaleString('it-IT');
      if (!window.confirm('Ripristino la copia del ' + quando +
          '? Le impostazioni attuali di questo tablet verranno sostituite.')) {
        esito.textContent = 'Ripristino annullato.';
        return;
      }
      restore(copy);
      esito.textContent = 'Ripristinata la copia del ' + quando + '. Ricarico...';
      setTimeout(function(){ location.reload(); }, 1200);
    }).catch(function(e){
      esito.textContent = 'Non riesco a leggere il file: ' + e.message;
    });
    picker.value = '';
  });

  document.getElementById('btn-backup-service').addEventListener('click', function(){
    esito.textContent = 'Cerco una copia sul servizio...';
    pullFromService().then(function(copy){
      if (!copy) { esito.textContent = 'Nessuna copia trovata sul servizio.'; return; }
      var quando = new Date(copy.at).toLocaleString('it-IT');
      if (!window.confirm('Ripristino la copia del ' + quando + ' presa dal servizio?')) {
        esito.textContent = 'Ripristino annullato.';
        return;
      }
      restore(copy);
      esito.textContent = 'Ripristinata. Ricarico...';
      setTimeout(function(){ location.reload(); }, 1200);
    });
  });
}

function setupPrivacyPanel(){
  var panel = document.getElementById('privacy');

  document.getElementById('btn-privacy').addEventListener('click', function(){
    paintSwitches();
    panel.hidden = false;
    settingsOpen = true;
  });
  document.getElementById('btn-close-privacy').addEventListener('click', function(){
    panel.hidden = true;
    settingsOpen = false;
    bumpAwake();
  });
  document.getElementById('sw-mic').addEventListener('click', function(){
    setMic(!micOn()); paintSwitches();
  });
  document.getElementById('sw-cam').addEventListener('click', function(){
    setCam(!camOn()); paintSwitches();
  });
  document.getElementById('btn-silence').addEventListener('click', function(){
    silenceAll(); paintSwitches();
  });

  applyPrivacy();
}

function paintSwitches(){
  document.getElementById('sw-mic').className = 'switch' + (micOn() ? ' is-on' : '');
  document.getElementById('sw-cam').className = 'switch' + (camOn() ? ' is-on' : '');
}

// Accende o spegne davvero i sensori, e aggiorna la targhetta di stato.
function applyPrivacy(){
  if (micOn()) { if (settings.voiceEnabled) setupVoice(); }
  else { stopVoice(); document.getElementById('mic-dot').hidden = true; }

  if (camOn()) { if (settings.presenceEnabled) startCamera(); }
  else stopPresence();

  var flag = document.getElementById('priv-flag');
  var off = !micOn() || !camOn();
  if (!flag && off) {
    flag = document.createElement('div');
    flag.id = 'priv-flag';
    document.body.appendChild(flag);
  }
  if (flag) {
    flag.hidden = !off;
    if (off) flag.textContent = privacySummary();
  }
}

function saveDictated(phrase){
  var parsed = parseWhen(phrase);
  addReminder(parsed.text, parsed.when, currentProfile);
  selectTab('agenda');
  show('control');
  var reply = 'Segnato: ' + parsed.text + ', ' + describeWhen(parsed.when ? parsed.when.getTime() : null) + '.';
  showVoiceBar(phrase, reply);
  if (settings.voiceReply) say(reply);
}

function showVoiceBar(heard, reply){
  var bar = document.getElementById('voice-bar');
  document.getElementById('vb-heard').textContent = heard ? '“' + heard + '”' : '';
  document.getElementById('vb-reply').textContent = reply;
  bar.hidden = false;
  if (voiceBarTimer) clearTimeout(voiceBarTimer);
  voiceBarTimer = setTimeout(function(){ bar.hidden = true; }, 7000);
}

function selectTab(name){
  var tabs = document.getElementById('tabs').getElementsByClassName('tab');
  for (var i = 0; i < tabs.length; i++) {
    var isIt = tabs[i].getAttribute('data-tab') === name;
    tabs[i].className = 'tab' + (isIt ? ' is-active' : '');
  }
  renderTab(name, bumpAwake);
}

function renderCurrentTab(){
  var tabs = document.getElementById('tabs').getElementsByClassName('tab');
  for (var i = 0; i < tabs.length; i++) {
    if (tabs[i].className.indexOf('is-active') !== -1) {
      renderTab(tabs[i].getAttribute('data-tab'), bumpAwake);
      return;
    }
  }
}

// Mostra i timer in corso sulla schermata a riposo.
function paintTimers(){
  var box = document.getElementById('timer-box');
  var list = activeTimers();
  if (!list.length) { box.hidden = true; box.innerHTML = ''; return; }

  box.innerHTML = '';
  for (var i = 0; i < list.length; i++) {
    var row = document.createElement('div');
    row.className = 'timer-row';

    var left = document.createElement('div');
    left.className = 'timer-left';
    left.textContent = remainingText(list[i]);

    var name = document.createElement('div');
    name.className = 'timer-name';
    name.textContent = list[i].name || 'timer';

    row.appendChild(left);
    row.appendChild(name);
    box.appendChild(row);
  }
  box.hidden = false;
}

function bumpAwake(){ awakeUntil = Date.now() + settings.wakeSeconds * 1000; }

function startCamera(){
  return startPresence({ onMotion: onPresence, onAlarm: onAlarm });
}

// Per ora l allarme resta sul tablet. Quando il servizio sara pubblicato,
// da qui partira anche la notifica verso il telefono.
// Manda fuori l allarme con una miniatura. Le immagini piene restano nel
// tablet: parte solo questa, cosi resta qualcosa anche se il tablet sparisce.
function onAlarm(info){
  updateDiagnostics();
  if (!settings.syncUrl) return;

  thumbFrom(info.blob).then(function(thumb){
    fetch(String(settings.syncUrl).replace(/\/+$/, '') + '/alarm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Casa-Token': settings.syncToken },
      body: JSON.stringify({
        at: info.at,
        source: 'tablet',
        strength: info.strength,
        thumb: thumb
      })
    }).catch(function(){});
  });
}

// Riduce lo scatto a una miniatura leggera, adatta a viaggiare in rete.
function thumbFrom(blob){
  return new Promise(function(resolve){
    if (!blob || !window.FileReader) { resolve(null); return; }
    var img = new Image();
    var url = URL.createObjectURL(blob);
    img.onload = function(){
      try {
        var c = document.createElement('canvas');
        c.width = 160; c.height = 120;
        c.getContext('2d').drawImage(img, 0, 0, 160, 120);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.5));
      } catch (e) { resolve(null); }
    };
    img.onerror = function(){ URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function onPresence(){
  if (settingsOpen) return;
  if (currentScreen !== 'control') wake(false);
  else awakeUntil = Date.now() + settings.wakeSeconds * 1000;
}

boot();
