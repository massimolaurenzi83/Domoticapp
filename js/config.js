// Impostazioni dell'utente, salvate sul tablet.
// Ogni voce compare nel pannello Impostazioni con la sua etichetta.

var KEY = 'domapp.settings.v1';

export var SCHEMA = [
  { id:'homeLayout', type:'hidden', def:'', group:'Nascosto', label:'Disposizione di casa' },
  { id:'homeWidgets', type:'widgets', def:'', group:'Schermata principale',
    label:'Riquadri accanto all orologio',
    hint:'Accendi quelli che vuoi vedere e mettili nell ordine che preferisci' },
  { id:'photosManage', type:'photos', def:'', group:'Cornice',
    label:'Le tue foto',
    hint:'Aggiungile dalla galleria del tablet. Restano su questo tablet' },
  { id:'photosEnabled', type:'bool', def:true, group:'Cornice',
    label:'Cornice fotografica',
    hint:'Se spenta, a riposo resta sempre la stazione meteo' },
  { id:'dayStart', type:'time', def:'08:00', group:'Cornice',
    label:'Le foto iniziano alle',
    hint:'Prima di quest ora resta la stazione meteo' },
  { id:'dayEnd', type:'time', def:'21:00', group:'Cornice',
    label:'Le foto finiscono alle',
    hint:'Dopo quest ora si passa al modo notturno' },
  { id:'photoSeconds', type:'num', def:25, min:5, max:600, group:'Cornice',
    label:'Secondi per foto', hint:'Quanto resta a schermo ogni immagine' },

  { id:'deviceRole', type:'choice', def:'', group:'Questo dispositivo',
    label:'Uso di questo dispositivo',
    hint:'Il pannello usa fotocamera, voce e sentinella. Il telefono serve solo a comandare da fuori casa',
    options: { '': 'Automatico', 'pannello': 'Pannello di casa', 'telecomando': 'Telefono per fuori casa' } },
  { id:'uiScale', type:'choice', def:'', group:'Schermo',
    label:'Dimensione di testi e icone',
    hint:'Automatica ingrandisce sui tablet, cosi si legge anche da lontano',
    options: { '': 'Automatica', '0.9': 'Piccola', '1': 'Normale', '1.25': 'Grande', '1.5': 'Molto grande' } },
  { id:'wallpaper', type:'wallpaper', def:'', group:'Schermo',
    label:'Sfondo',
    hint:'Immagini dalla cartella wallpapers del progetto' },
  { id:'dayBrightness', type:'num', def:100, min:10, max:100, group:'Schermo',
    label:'Luminosita di giorno',
    hint:'Percentuale, da 10 a 100' },
  { id:'nightBrightness', type:'num', def:35, min:3, max:100, group:'Schermo',
    label:'Luminosita di notte',
    hint:'Si applica fuori dalla finestra diurna' },
  { id:'sleepStart', type:'time', def:'00:30', group:'Schermo',
    label:'Schermo a riposo dalle',
    hint:'Lo schermo va a nero profondo' },
  { id:'sleepEnd', type:'time', def:'06:30', group:'Schermo',
    label:'Schermo a riposo fino alle',
    hint:'Un tocco o il passaggio di una persona lo risvegliano subito' },
  { id:'releaseWakeLock', type:'bool', def:false, group:'Schermo',
    label:'Spegnimento vero nelle ore di riposo',
    hint:'Lascia che Android spenga lo schermo. Attenzione: per riaccenderlo serve il tasto fisico' },

  { id:'presenceEnabled', type:'bool', def:true, group:'Presenza',
    label:'Rilevamento presenza',
    hint:'Usa la fotocamera frontale per accorgersi di chi passa' },
  { id:'presenceSensitivity', type:'num', def:14, min:2, max:60, group:'Presenza',
    label:'Sensibilita presenza',
    hint:'Piu basso, piu sensibile. Alza il valore se si sveglia da sola' },
  { id:'controlIdleSeconds', type:'num', def:60, min:15, max:900, group:'Schermo',
    label:'Ritorno alla schermata di riposo',
    hint:'Secondi senza toccare lo schermo prima di tornare a foto, ora e meteo' },
  { id:'wakeSeconds', type:'num', def:45, min:5, max:600, group:'Presenza',
    label:'Secondi di risveglio',
    hint:'Quanto resta sveglia dopo aver visto qualcuno' },

  { id:'privacyMicOff', type:'bool', def:false, group:'Privacy',
    label:'Microfono spento',
    hint:'Blocca l ascolto continuo. Si comanda anche dal tasto in alto' },
  { id:'privacyCamOff', type:'bool', def:false, group:'Privacy',
    label:'Fotocamera spenta',
    hint:'Blocca il rilevamento presenza e la ripresa da fuori casa' },

  { id:'profile1Name', type:'text', def:'Francesco', group:'Persone',
    label:'Primo profilo', hint:'Il nome che compare quando scegli a chi va un promemoria' },
  { id:'profile2Name', type:'text', def:'', group:'Persone',
    label:'Secondo profilo', hint:'Lascia vuoto se non serve' },
  { id:'settingsPin', type:'text', def:'', group:'Persone',
    label:'Codice per le impostazioni',
    hint:'Solo cifre. Lascia vuoto per lasciare le impostazioni libere' },

  { id:'voiceEnabled', type:'bool', def:true, group:'Voce',
    label:'Ascolto continuo',
    hint:'Il tablet resta in ascolto e risponde quando lo chiami per nome' },
  { id:'wakeWord', type:'text', def:'ambrogio', group:'Voce',
    label:'Nome del tablet',
    hint:'La parola che lo risveglia. Scegline una che non ricorra nelle chiacchiere' },
  { id:'voiceReply', type:'bool', def:true, group:'Voce',
    label:'Risposta parlata',
    hint:'Se spenta risponde solo a schermo, senza disturbare' },

  { id:'bridgeUrl', type:'text', def:'', group:'Sincronizzazione',
    label:'Indirizzo del ponte di casa',
    hint:'Serve solo per Broadlink, presa D-Link e telecamere fisse. Lascialo vuoto finche non avrai un piccolo computer sempre acceso' },


  { id:'syncUrl', type:'text', def:'', group:'Sincronizzazione',
    label:'Indirizzo del servizio',
    hint:'Lascia vuoto per tenere tutto solo su questo tablet' },
  { id:'syncToken', type:'text', def:'', group:'Sincronizzazione',
    label:'Parola condivisa',
    hint:'La stessa sui due tablet. Serve a proteggere il documento comune' },

  { id:'intercomSpeak', type:'bool', def:true, group:'Interfono',
    label:'Leggi i messaggi ad alta voce',
    hint:'Se spenta i messaggi compaiono solo a schermo' },
  { id:'intercomQuietStart', type:'time', def:'22:30', group:'Interfono',
    label:'Silenzio dalle',
    hint:'In queste ore i messaggi si vedono ma non si sentono' },
  { id:'intercomQuietEnd', type:'time', def:'07:30', group:'Interfono',
    label:'Silenzio fino alle', hint:'' },

  { id:'simEnabled', type:'bool', def:false, group:'Presenza simulata',
    label:'Simula la presenza quando sei via',
    hint:'Si accende insieme alla sentinella e si spegne quando disarmi. A casa non fa nulla' },
  { id:'simJitterMinutes', type:'num', def:35, min:0, max:120, group:'Presenza simulata',
    label:'Variazione degli orari',
    hint:'Di quanti minuti spostare ogni accensione, in piu o in meno. Zero rende tutto prevedibile' },

  { id:'alarmEnabled', type:'bool', def:false, group:'Sveglia',
    label:'Sveglia con luce e musica',
    hint:'Spenta di fabbrica. Accendila e poi imposta gli orari nella scheda Sveglia' },
  { id:'alarmSunriseMinutes', type:'num', def:20, min:0, max:60, group:'Sveglia',
    label:'Minuti di alba',
    hint:'Quanto prima accendere la luce. La musica parte sempre all orario esatto' },

  { id:'sentinelKeepDays', type:'num', def:14, min:1, max:365, group:'Sentinella',
    label:'Giorni di conservazione',
    hint:'Gli scatti piu vecchi vengono cancellati da soli' },
  { id:'sentinelBurstSeconds', type:'num', def:20, min:5, max:120, group:'Sentinella',
    label:'Durata della raffica',
    hint:'Per quanti secondi continua a scattare dopo un rilevamento' },

  { id:'lat', type:'text', def:'41.9028', group:'Meteo', label:'Latitudine', hint:'Coordinata del luogo' },
  { id:'lon', type:'text', def:'12.4964', group:'Meteo', label:'Longitudine', hint:'Coordinata del luogo' },
  { id:'placeName', type:'text', def:'Roma', group:'Meteo', label:'Nome del luogo', hint:'Mostrato sotto il meteo' }
];

function defaults(){
  var out = {};
  for (var i = 0; i < SCHEMA.length; i++) out[SCHEMA[i].id] = SCHEMA[i].def;
  return out;
}

export var settings = load();

function load(){
  var base = defaults();
  try {
    var raw = localStorage.getItem(KEY);
    if (!raw) return base;
    var saved = JSON.parse(raw);
    for (var k in saved) if (k in base) base[k] = saved[k];
  } catch (e) {}
  return base;
}

export function save(){
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) {}
}

export function toMinutes(hhmm){
  var p = String(hhmm || '00:00').split(':');
  return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
}

// Vero quando "now" cade nella finestra fra start e fine, anche a cavallo di mezzanotte.
export function inWindow(start, end, now){
  var d = now || new Date();
  var mins = d.getHours() * 60 + d.getMinutes();
  var a = toMinutes(start);
  var b = toMinutes(end);
  if (a === b) return false;
  if (a < b) return mins >= a && mins < b;
  return mins >= a || mins < b;
}

export function isDaytime(now){
  if (toMinutes(settings.dayStart) === toMinutes(settings.dayEnd)) return true;
  return inWindow(settings.dayStart, settings.dayEnd, now);
}

export function isSleepHours(now){
  return inWindow(settings.sleepStart, settings.sleepEnd, now);
}

// Ruolo effettivo di questo dispositivo. In automatico, uno schermo largo
// da tablet fa da pannello e uno stretto da telefono fa da telecomando: un
// telefono non deve accendere la fotocamera ne mandare allarmi con la
// faccia di chi lo tiene in mano.
export function effectiveRole(){
  if (settings.deviceRole === 'pannello' || settings.deviceRole === 'telecomando') return settings.deviceRole;
  return window.innerWidth >= 1000 ? 'pannello' : 'telecomando';
}
