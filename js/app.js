// Ciclo principale della plancia.
//
// Tre schermate che si alternano da sole:
//   PHOTOS   cornice fotografica, solo nella finestra diurna
//   AMBIENT  orologio, meteo e musica in corso
//   CONTROL  plancia di controllo, al tocco
//
// Il passaggio di una persona porta alla stazione meteo, il tocco porta
// ai controlli, e dopo il tempo di risveglio si torna allo stato di riposo.

import { settings, save as saveSettings, isDaytime, isSleepHours, effectiveRole } from './config.js';
import { initScreen, applyScheduledBrightness, screenDiagnostics } from './screen.js';
import { startPresence, stopPresence, presenceDiagnostics, armSentinel, disarmSentinel, isArmed, armedSince, cameraLive, cameraStatus } from './presence.js';
import { fetchWeather, weatherDiagnostics } from './weather.js';
import { loadPhotos, nextPhoto, photoCount } from './photos.js';
import { buildSettings, renderTab, timeString, dateString, agendaHooks, currentProfile, homeHooks } from './ui.js';
import { parseWhen, addReminder, describeWhen } from './reminders.js';
import { pinOk, pinRequired } from './profiles.js';
import { securityHooks } from './security-view.js';
import { setupDone, startSetup, resetSetup, markSetupDone } from './setup.js';
import { renderWidgets } from './widgets.js';
import { openHomeEditor } from './home-editor.js';
import { reloadLayout } from './devices.js';
import { startBackups, saveLocalCopy, pushToService, downloadFile, readFile,
         restore, backupDiagnostics, pullFromService } from './backup.js';
import { bridgeDiagnostics, checkBridge } from './bridge.js';
import { startSimulation, stopSimulation, simulationDiagnostics, noteHabit, simulationRunning } from './presence-sim.js';
import { startAlarms, alarmDiagnostics } from './alarm-clock.js';
import { watchTimers, activeTimers, remainingText, addTimer, spokenDuration, removeTimer } from './timers.js';
import { loadReminders } from './reminders.js';
import { autoRestoreIfNeeded } from './backup.js';
import { registerWorker, enableNotifications, notificationsActive, pushBlockedReason, isIOS, isStandalone } from './push.js';
import { micOn, camOn, setMic, setCam, silenceAll, onPrivacyChange, privacySummary } from './privacy.js';
import { setSyncConfig, startSync, syncConfigured, syncStatus, touch } from './sync.js';
import { setIntercomHandler } from './intercom.js';
import { commandLog, onToggle, onSendResult, setLive, isLive, onSceneSpeakers } from './devices.js';
import { checkGoogle, googleStatus, sendToGoogle } from './google.js';
import { checkSpotify, spotifyCommand, spotifyStatus, spotifyReady } from './spotify.js';
import { loadWallpapers, applyWallpaper } from './wallpaper.js';
import { startVoice, stopVoice, say, voiceAvailable, voiceDiagnostics, captureNext, primeSpeech, speechStatus, voiceListening } from './voice.js';
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

// Ultimo tocco sullo schermo, o ultimo comando a voce. E il solo segnale
// che tiene aperta la plancia: la fotocamera che vede qualcuno davanti al
// tablet la teneva aperta per sempre, anche senza che nessuno la usasse.
var lastTouchAt = Date.now();

function markTouch(){ lastTouchAt = Date.now(); }

// Con una finestra aperta, impostazioni, modifica delle stanze o
// configurazione guidata, non si torna a riposo: si perderebbe il lavoro.
function sheetOpen(){
  if (settingsOpen) return true;
  var ids = ['home-editor', 'setup', 'bridge-conf', 'settings', 'privacy'];
  for (var i = 0; i < ids.length; i++) {
    var el = document.getElementById(ids[i]);
    if (el && !el.hidden) return true;
  }
  return false;
}

function controlExpired(){
  var limite = Math.max(15, parseInt(settings.controlIdleSeconds, 10) || 60) * 1000;
  return Date.now() - lastTouchAt > limite;
}

function wake(toControl){
  awakeUntil = Date.now() + settings.wakeSeconds * 1000;
  if (toControl) markTouch();
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

  // Chi sta usando il pannello deve vederlo bene, a qualsiasi ora.
  var inUso = currentScreen === 'control' || settingsOpen || sheetOpen() || Date.now() - lastTouchAt < 20000;
  applyScheduledBrightness(isAwake() || settingsOpen, inUso);
  paintTimers();

  // La plancia torna a riposo dopo il tempo scelto senza tocchi.
  if (currentScreen === 'control' && !sheetOpen() && controlExpired()) {
    awakeUntil = 0;
    show(isSleepHours() ? 'ambient' : idleScreen());
  }
  if (currentScreen !== 'control' && !isAwake() && !sheetOpen()) {
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
    if (id === 'homeWidgets') renderWidgets();
    if (id === 'uiScale') applyScale();
    if (id === 'privacyMicOff' || id === 'privacyCamOff' || id === 'presenceEnabled' ||
        id === 'voiceEnabled' || id === 'deviceRole') applyPrivacy();
    if (id === 'photos') loadPhotos().then(function(){ if (!isAwake()) show(idleScreen()); });
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
    speechStatus(),
    batteryStatus(),
    weatherDiagnostics() + (lastWeatherError ? ' | ultimo errore: ' + lastWeatherError : ''),
    'Allarmi: ' + (lastAlarmResult || 'nessuno inviato finora'),
    'Ruolo: ' + (effectiveRole() === 'pannello' ? 'pannello di casa' : 'telefono per fuori casa'),
    bridgeDiagnostics(),
    backupDiagnostics(),
    simulationDiagnostics(),
    alarmDiagnostics(),
    'Allineamento: ' + (syncConfigured() ? syncStatus() : 'solo questo tablet'),
    'Google Home: ' + googleStatus(),
    'Spotify: ' + spotifyStatus(),
    'Notifiche: ' + (notificationsActive() ? 'attive' : (pushBlockedReason() || 'da attivare')),
    'Telefono: ' + (isIOS() ? ('iPhone, ' + (isStandalone() ? 'aperta dalla schermata Home' : 'aperta dentro il browser')) : 'Android o altro'),
    'Foto caricate: ' + photoCount(),
    'Contesto sicuro: ' + (window.isSecureContext ? 'sì' : 'no, la fotocamera resterà spenta'),
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

  agendaHooks.onDictate = function(){
    if (!captureNext()) {
      showVoiceBar('', voiceListening() ? 'Un attimo, riprova.' :
        'Il microfono non sta ascoltando. Tocca lo schermo, oppure controlla il tasto del microfono in alto.');
    }
  };

  setIntercomHandler(function(list){
    var last = list[list.length - 1];
    bumpAwake();
    show('ambient');
    beep(1);
    showVoiceBar('Messaggio da ' + last.from, last.text, 60000);
    renderWidgets();
  });

  securityHooks.isArmed = isArmed;
  securityHooks.onArm = function(){
    armSentinel();
    bumpAwake();
    if (effectiveRole() !== 'pannello') {
      showVoiceBar('Sentinella', syncConfigured()
        ? 'Comando inviato: i pannelli di casa cominciano a sorvegliare entro mezzo minuto.'
        : 'Questo telefono non è collegato ai pannelli di casa: il comando non arriverà.');
      return;
    }
    startSimulation();
    if (!cameraLive()) {
      showVoiceBar('Attenzione', 'Sentinella armata, ma la fotocamera di questo tablet non sta riprendendo: ' + cameraStatus() + '.');
    }
  };
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
  setupBackButtons();

  document.getElementById('btn-settings').addEventListener('click', function(){
    if (!pinRequired()) { openSettings(); return; }
    var entered = window.prompt('Codice impostazioni');
    if (entered === null) return;
    if (pinOk(entered)) openSettings();
    else showVoiceBar('', 'Codice errato.');
  });
  document.getElementById('btn-close-settings').addEventListener('click', closeSettings);
  document.getElementById('btn-open-diag').addEventListener('click', function(){
    window.location.href = 'diagnostica/';
  });
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

  // Qualunque tocco conta, comprese caselle, schede e scorrimento.
  document.addEventListener('touchstart', markTouch, true);
  document.addEventListener('mousedown', markTouch, true);
  document.addEventListener('click', markTouch, true);
  document.addEventListener('keydown', markTouch, true);
  document.addEventListener('input', markTouch, true);

  document.addEventListener('click', function(ev){
    if (sheetOpen()) return;
    if (currentScreen === 'control') return;
    wake(true);
  });

  if (!setupDone()) {
    startSetup(function(){
      refreshWeather();
      renderCurrentTab();
      applyPrivacy();
    });
  }

  loadWallpapers();
  loadPhotos().then(function(){ show(idleScreen()); });
  refreshWeather();
  setInterval(refreshWeather, 15 * 60 * 1000);

  tick();
  setInterval(tick, 1000);

  // Fotocamera e voce le accende applyPrivacy, gia chiamata dal pannello
  // della privacy: chiamarle anche qui apriva due flussi video.
  onToggle(noteHabit);
  setupGoogle();
  setupSpotify();

  applyScale();
  unlockOnFirstTouch();

  // Modifica di stanze e dispositivi: protetta dal codice, come le impostazioni.
  homeHooks.onEdit = function(){
    if (pinRequired()) {
      var entered = window.prompt('Codice impostazioni');
      if (entered === null) return;
      if (!pinOk(entered)) { showVoiceBar('', 'Codice errato.'); return; }
    }
    openHomeEditor(function(){
      touch('homeLayout');
      renderCurrentTab();
    });
  };

  renderWidgets();
  setInterval(renderWidgets, 30000);
  watchBattery();

  startBackups();
  setupBackupButtons();

  // Se il tablet si e riavviato mentre la sentinella era armata, la
  // sorveglianza riprende da sola e lo schermo lo dice.
  if (isArmed() && effectiveRole() === 'pannello') {
    startSimulation();
    var da = armedSince();
    var quando = da ? new Date(da).toLocaleString('it-IT') : 'prima del riavvio';
    setTimeout(function(){
      showVoiceBar('Sentinella ancora armata', 'Sorveglianza ripresa. Armata dal ' + quando + '.');
    }, 1500);
  }

  registerWorker();
  checkBridge();

  // La sveglia oggi suona sul tablet; luce e musica partiranno quando Google
  // Home sara collegato.
  var lastAlarmRing = '';
  startAlarms(function(alarm, progress){
    if (progress < 1) return;
    var chiave = new Date().toDateString() + alarm.id;
    if (chiave === lastAlarmRing) return;
    lastAlarmRing = chiave;
    bumpAwake();
    show('ambient');
    beep(6);
    if (settings.voiceReply) say('Buongiorno. Sono le ' + alarm.time.replace(':', ' e ') + '.');
  });

  watchTimers(paintTimers, function(t){
    bumpAwake();
    show('ambient');
    beep(4);
    var what = t.name ? 'Il timer ' + t.name : 'Il timer';
    showVoiceBar('', what + ' è finito.');
    if (settings.voiceReply) say(what + ' è finito.');
  });

  checkDueReminders(true);
  setInterval(function(){ checkDueReminders(false); }, 20000);

  setSyncConfig(settings.syncUrl, settings.syncToken);
  startSync(function(){
    applyPrivacy();
    reloadLayout();
    renderCurrentTab();
    applyWallpaper();
    refreshWeather();
    renderWidgets();

    // La sentinella puo essere stata armata dal telefono: qui il pannello
    // se ne accorge e si adegua.
    if (effectiveRole() === 'pannello' && isArmed() && !simulationRunning()) startSimulation();
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
    // In basso a destra: in alto coprirebbe i tasti della plancia.
    el.style.cssText = 'position:absolute;bottom:14px;right:16px;z-index:18;font-size:17px;' +
      'color:#f0b429;background:#2a220c;padding:9px 16px;border-radius:999px;pointer-events:none;';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.hidden = !text;
}

// Ingrandisce tutto il pannello, testi e icone insieme. In automatico
// ingrandisce sugli schermi da tablet, che si guardano da lontano, e lascia
// normale sui telefoni, che si tengono in mano.
function applyScale(){
  var v = parseFloat(settings.uiScale);
  if (!v) v = window.innerWidth >= 1000 ? 1.25 : 1;
  document.body.style.zoom = String(v);
}

// Al primo tocco dopo l apertura sblocca tutto cio che Chrome su Android
// concede solo dopo un gesto: la voce che risponde, e con lei interfono e
// timer. Il microfono ha un suo meccanismo, dentro voice.js.
function unlockOnFirstTouch(){
  function once(){
    document.removeEventListener('touchstart', once, true);
    document.removeEventListener('click', once, true);
    primeSpeech();
  }
  document.addEventListener('touchstart', once, true);
  document.addEventListener('click', once, true);
}

// ---------- batteria ----------
//
// Un tablet del 2014 con la batteria stanca puo spegnersi anche in carica,
// se il caricatore non ce la fa a stare dietro a schermo, fotocamera e
// microfono sempre accesi. Il pannello lo tiene d occhio e lo dice prima
// che succeda.

var battery = null;
var chargingSamples = [];

function watchBattery(){
  if (!navigator.getBattery) return;
  navigator.getBattery().then(function(b){
    battery = b;
    function check(){
      if (b.charging) {
        chargingSamples.push({ at: Date.now(), level: b.level });
        if (chargingSamples.length > 40) chargingSamples.shift();
      } else {
        chargingSamples = [];
      }
      paintBattery();
    }
    b.addEventListener('levelchange', check);
    b.addEventListener('chargingchange', check);
    check();
    setInterval(check, 5 * 60000);
  }).catch(function(){});
}

// Vero quando e in carica ma la batteria scende lo stesso: il caricatore
// e troppo debole per questo tablet.
function chargerTooWeak(){
  if (chargingSamples.length < 3) return false;
  var primo = chargingSamples[0];
  var ultimo = chargingSamples[chargingSamples.length - 1];
  return (ultimo.at - primo.at) > 20 * 60000 && (primo.level - ultimo.level) >= 0.04;
}

function paintBattery(){
  if (!battery) return;
  var pct = Math.round(battery.level * 100);
  var testo = '';
  if (!battery.charging && pct <= 25) testo = 'Batteria al ' + pct + '%, collega il caricatore';
  else if (chargerTooWeak()) testo = 'Il caricatore non basta: batteria in calo anche in carica';

  var el = document.getElementById('battery-hint');
  if (!el) {
    el = document.createElement('div');
    el.id = 'battery-hint';
    el.style.cssText = 'position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:18;' +
      'font-size:13px;color:#f0b429;background:#2a220c;padding:6px 14px;border-radius:999px;pointer-events:none;';
    document.body.appendChild(el);
  }
  el.textContent = testo;
  el.hidden = !testo;
}

function batteryStatus(){
  if (!battery) return 'Batteria: non misurabile';
  return 'Batteria: ' + Math.round(battery.level * 100) + '%, ' +
    (battery.charging ? 'in carica' : 'non in carica') +
    (chargerTooWeak() ? ', il caricatore non basta' : '');
}

function setupVoice(){
  var dot = document.getElementById('mic-dot');
  if (!settings.voiceEnabled || !voiceAvailable()) { dot.hidden = true; return; }

  var ok = startVoice({
    onStateChange: function(state, payload){
      // I risultati parziali e l attesa dopo il nome non spengono la scritta In ascolto.
      var passeggero = state === 'partial' || state === 'awaiting' || state === 'heard' || state === 'captured';
      if (!passeggero) dot.hidden = (state !== 'listening' && state !== 'capturing');
      if (state === 'capturing') showVoiceBar('', 'Ti ascolto, detta il promemoria.');
      if (state === 'awaiting') { beep(1); bumpAwake(); showVoiceBar('', 'Dimmi pure, ti ascolto.', 8000); }
      if (state === 'partial') showVoiceBar(payload || '…', '…', 8000);
      // Il passaggio a fermo arriva subito dopo un rifiuto: non deve
      // cancellare l avviso che spiega cosa e successo.
      if (state !== 'idle') {
        micHint(state === 'needs-touch'
          ? 'Tocca lo schermo per attivare la voce'
          : (state === 'denied' ? 'Microfono non consentito da Chrome' : ''));
      }
    },
    onCommand: function(rest, full, captured){
      markTouch();
      awakeUntil = Date.now() + settings.wakeSeconds * 1000;

      if (captured) { saveDictated(rest); return; }

      lastVoiceAt = Date.now();
      var result = runCommand(rest);

      if (result && result.reminder) { saveDictated(rest); return; }

      if (result && result.google) { askGoogleAloud(rest, result.google); return; }

      if (!result) {
        showVoiceBar(rest, 'Non ho capito.');
        if (settings.voiceReply) say('Non ho capito.');
        return;
      }

      if (result.tab) selectTab(result.tab);
      show(result.screen === 'ambient' ? 'ambient' : 'control');
      if (result.device === 'citofono') document.getElementById('doorbell').hidden = false;

      if (result.screen === 'control') renderCurrentTab();
      if (result.spotify) runSpotify(rest, result.spotify);
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
          (suServizio ? ' e sul servizio.' : '. Il servizio non è raggiungibile.');
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
    pullFromService().then(function(res){
      var copy = res.copy;
      var quando = new Date(copy.at).toLocaleString('it-IT');
      var chi = res.from && res.from.label ? ' fatta da ' + res.from.label : '';
      if (!window.confirm('Ripristino la copia del ' + quando + chi + '?')) {
        esito.textContent = 'Ripristino annullato.';
        return;
      }
      restore(copy);
      esito.textContent = 'Ripristinata. Ricarico...';
      setTimeout(function(){ location.reload(); }, 1200);
    }, function(e){
      esito.textContent = 'Ripristino non possibile: ' + e.message + '.';
    });
  });
}

// Con la sentinella armata, spegnere la fotocamera e proprio quello che
// farebbe un intruso. Se c e un codice lo si chiede, e in ogni caso parte
// un avviso verso il telefono.
function allowCameraOffWhileArmed(){
  if (!isArmed()) return true;
  if (pinRequired()) {
    var entered = window.prompt('La sentinella è armata. Codice per spegnere la fotocamera');
    if (entered === null) return false;
    if (!pinOk(entered)) { showVoiceBar('', 'Codice errato. La fotocamera resta accesa.'); return false; }
  }
  sendAlarm({ at: Date.now(), source: 'fotocamera spenta a mano con la sentinella armata', strength: 0, blob: null });
  return true;
}

// Tasto Indietro in cima a ogni schermata. Dalla plancia riporta alla
// schermata di riposo; da una finestra la chiude, come il suo tasto Chiudi.
function setupBackButtons(){
  document.addEventListener('click', function(ev){
    var b = ev.target.closest ? ev.target.closest('[data-back]') : null;
    if (!b) return;
    ev.stopPropagation();
    var dove = b.getAttribute('data-back');
    if (dove === 'control') {
      awakeUntil = 0;
      show(isSleepHours() ? 'ambient' : idleScreen());
      return;
    }
    if (dove === 'settings') { closeSettings(); return; }
    if (dove === 'privacy') { document.getElementById('btn-close-privacy').click(); return; }
    var el = document.getElementById(dove);
    if (el) el.hidden = true;
  }, true);
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
    if (camOn() && !allowCameraOffWhileArmed()) return;
    setCam(!camOn()); paintSwitches();
  });
  document.getElementById('btn-silence').addEventListener('click', function(){
    if (camOn() && !allowCameraOffWhileArmed()) return;
    silenceAll(); paintSwitches();
  });

  applyPrivacy();
}

function paintSwitches(){
  document.getElementById('sw-mic').className = 'switch' + (micOn() ? ' is-on' : '');
  document.getElementById('sw-cam').className = 'switch' + (camOn() ? ' is-on' : '');
}

// Accende o spegne davvero i sensori, e aggiorna la targhetta di stato.
// Accende o spegne microfono e fotocamera secondo interruttori, impostazioni
// e ruolo del dispositivo. Un telefono non ascolta e non riprende: serve a
// comandare da fuori casa, e non deve mandare allarmi con la faccia di chi
// lo tiene in mano.
function applyPrivacy(){
  var pannello = effectiveRole() === 'pannello';

  if (pannello && micOn() && settings.voiceEnabled) setupVoice();
  else { stopVoice(); document.getElementById('mic-dot').hidden = true; micHint(''); }

  if (pannello && camOn() && settings.presenceEnabled) startCamera();
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

// ---------- Google Home ----------

var lastVoiceAt = 0;

// Chiede al servizio se Google Home e collegato e accende le caselle di
// conseguenza. Si ripete ogni cinque minuti: se il collegamento viene
// installato dal computer, i tablet se ne accorgono da soli.
function refreshGoogle(){
  var prima = isLive();
  return checkGoogle().then(function(ok){
    setLive(ok);
    if (ok !== prima) renderCurrentTab();
  });
}

// Una frase che il pannello non conosce va a Google Assistant, e la sua
// risposta si legge e si dice.
function askGoogleAloud(heard, frase){
  showVoiceBar(heard, 'Lo chiedo a Google...', 25000);
  sendToGoogle(frase).then(function(r){
    var reply = r.ok
      ? (r.risposta || 'Fatto.')
      : 'Google non ha risposto: ' + r.errore + '.';
    showVoiceBar(heard, reply, 12000);
    if (settings.voiceReply) say(reply);
    renderCurrentTab();
    updateDiagnostics();
  });
}

// ---------- Spotify ----------

// Manda il comando detto a voce e, se non va, lo dice.
function runSpotify(heard, cmd){
  spotifyCommand(cmd).then(function(r){
    if (!r.ok) {
      var reply = 'Spotify: ' + r.errore + '.';
      showVoiceBar(heard, reply, 12000);
      if (settings.voiceReply) say(reply);
    }
    setTimeout(function(){ checkSpotify().then(renderCurrentTab); }, 900);
  });
}

function setupSpotify(){
  onSceneSpeakers(function(on){
    if (spotifyReady()) spotifyCommand({ azione: on ? 'play' : 'pausa' });
  });
  checkSpotify();
  setInterval(checkSpotify, 5 * 60000);
}

function setupGoogle(){
  onSendResult(function(dev, ok, testo){
    if (ok) return;
    renderCurrentTab();
    var reply = (dev.name || 'Il dispositivo') + ': comando non riuscito. ' + testo;
    showVoiceBar('', reply, 12000);
    if (settings.voiceReply && Date.now() - lastVoiceAt < 30000) say(reply);
  });
  refreshGoogle();
  setInterval(refreshGoogle, 5 * 60000);
}

function showVoiceBar(heard, reply, durata){
  var bar = document.getElementById('voice-bar');
  document.getElementById('vb-heard').textContent = heard ? '“' + heard + '”' : '';
  document.getElementById('vb-reply').textContent = reply;
  bar.hidden = false;
  if (voiceBarTimer) clearTimeout(voiceBarTimer);
  voiceBarTimer = setTimeout(function(){ bar.hidden = true; }, durata || 7000);
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
// I timer si ridisegnano solo quando cambia l elenco; ogni secondo si
// aggiorna solo il tempo che resta. Un tocco sulla riga annulla il timer.
var paintedTimers = '';

function paintTimers(){
  var box = document.getElementById('timer-box');
  var list = activeTimers();
  if (!list.length) {
    if (paintedTimers) { box.hidden = true; box.innerHTML = ''; paintedTimers = ''; }
    return;
  }

  var chiave = list.map(function(t){ return t.id; }).join(',');
  if (chiave !== paintedTimers) {
    paintedTimers = chiave;
    box.innerHTML = '';
    list.forEach(function(t){
      var row = document.createElement('div');
      row.className = 'timer-row';
      row.setAttribute('data-id', t.id);

      var left = document.createElement('div');
      left.className = 'timer-left';

      var name = document.createElement('div');
      name.className = 'timer-name';
      name.textContent = (t.name || 'timer') + ', tocca per annullare';

      row.appendChild(left);
      row.appendChild(name);
      row.addEventListener('click', function(ev){
        ev.stopPropagation();
        removeTimer(t.id);
        paintTimers();
      });
      box.appendChild(row);
    });
    box.hidden = false;
  }

  var righe = box.getElementsByClassName('timer-row');
  for (var i = 0; i < righe.length; i++) {
    var t = list.filter(function(x){ return x.id === righe[i].getAttribute('data-id'); })[0];
    if (t) righe[i].firstChild.textContent = remainingText(t);
  }
}

// Un suono breve generato dal tablet, per timer, sveglia e promemoria.
// Non serve nessun file audio, e dopo il primo tocco Chrome lo permette.
var audioCtx = null;

function beep(times){
  try {
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audioCtx = new AC();
    }
    if (audioCtx.resume) audioCtx.resume();
    var n = times || 3;
    for (var i = 0; i < n; i++) {
      var o = audioCtx.createOscillator();
      var g = audioCtx.createGain();
      o.frequency.value = 880;
      o.connect(g);
      g.connect(audioCtx.destination);
      var t0 = audioCtx.currentTime + i * 0.45;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      o.start(t0);
      o.stop(t0 + 0.32);
    }
  } catch (e) {}
}

// ---------- promemoria all ora giusta ----------
//
// Quando arriva l ora di un promemoria il pannello suona e lo dice. Quelli
// scaduti mentre il tablet era spento vengono segnati come gia visti, per
// non ricevere una raffica di avvisi vecchi all accensione.

var NOTIFIED_KEY = 'domapp.reminders.notified.v1';

function notifiedIds(){
  try { return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '[]'); } catch (e) { return []; }
}

function checkDueReminders(firstRun){
  var gia = notifiedIds();
  var ora = Date.now();
  var dovuti = loadReminders().filter(function(r){
    return r.when && r.when <= ora && gia.indexOf(r.id) === -1;
  });
  if (!dovuti.length) return;

  var nuovi = [];
  dovuti.forEach(function(r){
    gia.push(r.id);
    if (!firstRun && ora - r.when < 10 * 60000) nuovi.push(r);
  });
  if (gia.length > 300) gia = gia.slice(gia.length - 300);
  try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(gia)); } catch (e) {}

  if (!nuovi.length || effectiveRole() !== 'pannello') return;
  var r = nuovi[nuovi.length - 1];
  bumpAwake();
  show('ambient');
  beep(2);
  showVoiceBar('Promemoria', r.text);
  if (settings.voiceReply) say('Promemoria: ' + r.text);
}

function bumpAwake(){ awakeUntil = Date.now() + settings.wakeSeconds * 1000; }

function startCamera(){
  return startPresence({ onMotion: onPresence, onAlarm: onAlarm });
}

// Manda fuori l allarme con una miniatura. Le immagini piene restano nel
// tablet: parte solo questa, cosi resta qualcosa anche se il tablet sparisce.
var lastAlarmResult = '';

function onAlarm(info){
  updateDiagnostics();
  sendAlarm(info);
}

function sendAlarm(info){
  if (!settings.syncUrl || !settings.syncToken) {
    lastAlarmResult = 'servizio non configurato: l’allarme resta solo su questo tablet';
    return;
  }
  thumbFrom(info.blob).then(function(thumb){
    return fetch(String(settings.syncUrl).replace(/\/+$/, '') + '/alarm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Casa-Token': settings.syncToken },
      body: JSON.stringify({ at: info.at, source: info.source || 'tablet', strength: info.strength, thumb: thumb })
    });
  }).then(function(r){
    lastAlarmResult = r.ok
      ? 'ultimo allarme consegnato alle ' + new Date().toLocaleTimeString('it-IT')
      : 'ultimo allarme rifiutato dal servizio, stato ' + r.status;
  }).catch(function(){
    lastAlarmResult = 'ultimo allarme non consegnato: servizio non raggiungibile';
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

// Chi passa davanti al tablet sveglia la schermata con ora e meteo, ma non
// tiene aperta la plancia: quella si chiude dopo un minuto senza tocchi.
function onPresence(){
  if (sheetOpen()) return;
  if (currentScreen !== 'control') wake(false);
}

// Un link dell installazione porta indirizzo e parola del servizio dopo il
// simbolo #, parte che non viene mai spedita ai server di GitHub. Aperto su
// un dispositivo, lo collega in un tocco.
var linkedNow = false;

function acceptLink(){
  var m = (window.location.hash || '').match(/#collega=([^&]+)/);
  if (!m) return;
  var parti = decodeURIComponent(m[1]).split('|');
  // Si ripulisce subito l indirizzo, cosi il link non resta nella cronologia.
  try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) {}
  if (parti.length !== 2 || !/^https:\/\/[a-z0-9.-]+\.workers\.dev$/i.test(parti[0])) {
    window.alert('Questo link non sembra quello del servizio di casa.');
    return;
  }
  var host = parti[0].replace('https://', '');
  if (!window.confirm('Collegare questo dispositivo al servizio di casa ' + host + '?')) return;
  settings.syncUrl = parti[0];
  settings.syncToken = parti[1];
  saveSettings();
  // Un dispositivo nuovo collegato col link non ha bisogno della
  // configurazione guidata: il resto arriva dal servizio.
  if (!setupDone()) markSetupDone();
  linkedNow = true;
}

function start(){
  acceptLink();
  // Se Android ha svuotato la memoria, si rimette tutto a posto e si
  // ricarica, prima che il pannello parta con i valori di fabbrica.
  autoRestoreIfNeeded().then(function(at){
    if (at) { window.location.reload(); return; }
    boot();
    if (linkedNow) showVoiceBar('Collegato', 'Questo dispositivo ora fa parte della casa.');
  }, function(){ boot(); });
}

start();
