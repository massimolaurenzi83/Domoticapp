// Telecamere fisse di casa.
//
// Nessun browser sa riprodurre RTSP, quindi i flussi passano da go2rtc sul
// Raspberry Pi, che traduce in un formato che il browser mostra. Il tablet
// chiede al ponte il flusso per nome.
//
// Le password delle telecamere NON vengono salvate qui. Restano solo nel
// file di configurazione del ponte: il tablet non ne ha bisogno, perche
// chiede i flussi al ponte e non alle telecamere.

var KEY = 'domapp.cameras.v1';

// Ogni famiglia corrisponde all app con cui la telecamera e stata
// configurata. Il primo indirizzo e il flusso ad alta risoluzione, il
// secondo quello leggero che conviene per la griglia.
export var FAMILIES = {
  icsee: {
    label: 'iCSee, XMEye, Xiongmai',
    main: 'rtsp://{user}:{pass}@{ip}:554/onvif1',
    sub:  'rtsp://{user}:{pass}@{ip}:554/onvif2',
    onvifPort: 8899,
    note: 'La piu diffusa fra le telecamere senza marca'
  },
  xmeye_sdp: {
    label: 'XMEye, variante con sdp',
    main: 'rtsp://{ip}:554/user={user}&password={pass}&channel=1&stream=0.sdp',
    sub:  'rtsp://{ip}:554/user={user}&password={pass}&channel=1&stream=1.sdp',
    onvifPort: 8899,
    note: 'Da provare se la variante onvif non risponde'
  },
  camhi: {
    label: 'CamHi, CamHiPro',
    main: 'rtsp://{user}:{pass}@{ip}:554/livestream/11',
    sub:  'rtsp://{user}:{pass}@{ip}:554/livestream/12',
    onvifPort: 8000,
    note: ''
  },
  v380: {
    label: 'V380, V380 Pro',
    main: 'rtsp://{user}:{pass}@{ip}:554/live/ch00_0',
    sub:  'rtsp://{user}:{pass}@{ip}:554/live/ch00_1',
    onvifPort: 8899,
    note: 'Su molti modelli RTSP e spento di fabbrica e va abilitato'
  },
  yoosee: {
    label: 'Yoosee',
    main: 'rtsp://{user}:{pass}@{ip}:554/onvif1',
    sub:  'rtsp://{user}:{pass}@{ip}:554/onvif2',
    onvifPort: 5000,
    note: ''
  },
  ycc365: {
    label: 'YCC365, YCC365 Plus',
    main: 'rtsp://{user}:{pass}@{ip}:554/stream1',
    sub:  'rtsp://{user}:{pass}@{ip}:554/stream2',
    onvifPort: 8000,
    note: 'Su diversi modelli RTSP va abilitato prima'
  },
  onvif: {
    label: 'Non lo so, cercala tu',
    main: 'onvif://{user}:{pass}@{ip}:{onvifPort}',
    sub:  '',
    onvifPort: 8899,
    note: 'Il ponte interroga la telecamera e ricava da solo l indirizzo'
  },
  custom: {
    label: 'Indirizzo scritto a mano',
    main: '',
    sub:  '',
    onvifPort: 0,
    note: 'Da usare quando conosci gia l indirizzo esatto'
  }
};

export function loadCameras(){
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; }
}

function persist(list){
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
}

export function addCamera(cam){
  var list = loadCameras();
  list.push({
    id: 'cam' + Date.now() + '-' + Math.floor(Math.random() * 10000),
    name: cam.name || 'Telecamera',
    family: cam.family || 'icsee',
    ip: cam.ip || '',
    user: cam.user || 'admin',
    customUrl: cam.customUrl || '',
    watch: cam.watch !== false
  });
  persist(list);
  return list;
}

export function removeCamera(id){
  var list = loadCameras().filter(function(c){ return c.id !== id; });
  persist(list);
  return list;
}

export function updateCamera(id, patch){
  var list = loadCameras();
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) for (var k in patch) list[i][k] = patch[k];
  }
  persist(list);
  return list;
}

// Nome usato dal ponte per identificare il flusso.
export function streamKey(cam){
  return String(cam.name || cam.id).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function fill(pattern, cam, password, which){
  if (!pattern) return '';
  var fam = FAMILIES[cam.family] || FAMILIES.icsee;
  return pattern
    .split('{user}').join(cam.user || 'admin')
    // Una password con @ : # o / romperebbe l indirizzo: va codificata.
    .split('{pass}').join(encodeURIComponent(password || ''))
    .split('{ip}').join(cam.ip || '')
    .split('{onvifPort}').join(String(fam.onvifPort || 8899));
}

// Costruisce il file di configurazione da mettere sul Raspberry Pi.
// Le password compaiono solo qui e non vengono conservate dal tablet.
export function buildBridgeConfig(passwords){
  var list = loadCameras();
  var lines = [
    '# Configurazione go2rtc per il ponte di casa.',
    '# Copiala in go2rtc.yaml accanto all eseguibile e riavvia il servizio.',
    '# Le password stanno solo in questo file, sul Raspberry Pi.',
    '',
    'streams:'
  ];

  for (var i = 0; i < list.length; i++) {
    var cam = list[i];
    var fam = FAMILIES[cam.family] || FAMILIES.icsee;
    var pw = (passwords || {})[cam.id] || '';
    var key = streamKey(cam);

    lines.push('  ' + key + ':');
    if (cam.family === 'custom') {
      lines.push('    - ' + (cam.customUrl || '# indirizzo mancante'));
    } else {
      lines.push('    - ' + fill(fam.main, cam, pw));
      if (fam.sub) lines.push('  ' + key + '_leggero:');
      if (fam.sub) lines.push('    - ' + fill(fam.sub, cam, pw));
    }
  }

  if (!list.length) lines.push('  # nessuna telecamera ancora configurata');

  lines.push('');
  lines.push('webrtc:');
  lines.push('  candidates:');
  lines.push('    - stun:8555');
  lines.push('');
  lines.push('api:');
  lines.push('  listen: ":1984"');

  return lines.join('\n');
}
