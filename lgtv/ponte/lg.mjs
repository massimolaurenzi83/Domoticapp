// Telecomando di rete delle TV LG NetCast.
//
// Le LG del 2011 accettano i tasti del telecomando anche dalla rete di
// casa, sulla porta 8080, con il protocollo che LG chiamava "hdcp": i
// codici sono gli stessi dell infrarosso, da 0 a 255. I modelli 2012 e 2013
// usano invece "roap", con codici diversi. Il ponte prova da solo quale dei
// due risponde.
//
// La prima volta la TV mostra a schermo un codice di sei cifre, che va
// scritto nell app: e l unico modo di collegarsi, e non cambia niente
// nella TV.
//
// SICUREZZA. Con lo stesso protocollo si aprono anche i menu di servizio
// della fabbrica (EZ ADJUST, IN START, Installation, POWER ONLY): menu che
// possono alterare la TV in modo permanente. Per questo il ponte NON manda
// mai un numero qualsiasi: manda solo i tasti di questo elenco, scelti uno
// per uno. Un codice che non c e qui viene rifiutato, da chiunque arrivi.
// Mancano apposta anche i tasti che cambiano un impostazione con un solo
// tocco, come modo immagine, formato e risparmio energetico.

import http from 'node:http';

// nome: [codice 2011 "hdcp", codice 2012-2013 "roap", etichetta, gruppo]
// null vuol dire che quel protocollo non ha il tasto.
export var TASTI = {
  spegni:     [8,   1,   'Spegni', 'base'],
  volSu:      [2,   24,  'Volume +', 'base'],
  volGiu:     [3,   25,  'Volume −', 'base'],
  muto:       [9,   26,  'Muto', 'base'],
  canaleSu:   [0,   27,  'Canale +', 'base'],
  canaleGiu:  [1,   28,  'Canale −', 'base'],
  n0: [16, 2, '0', 'numeri'],  n1: [17, 3, '1', 'numeri'],  n2: [18, 4, '2', 'numeri'],
  n3: [19, 5, '3', 'numeri'],  n4: [20, 6, '4', 'numeri'],  n5: [21, 7, '5', 'numeri'],
  n6: [22, 8, '6', 'numeri'],  n7: [23, 9, '7', 'numeri'],  n8: [24, 10, '8', 'numeri'],
  n9: [25, 11, '9', 'numeri'],
  su:         [64,  12,  'Su', 'frecce'],
  giu:        [65,  13,  'Giù', 'frecce'],
  sinistra:   [7,   14,  'Sinistra', 'frecce'],
  destra:     [6,   15,  'Destra', 'frecce'],
  ok:         [68,  20,  'OK', 'frecce'],
  indietro:   [40,  23,  'Indietro', 'frecce'],
  esci:       [91,  412, 'Esci', 'frecce'],
  home:       [124, 21,  'Home', 'frecce'],
  info:       [170, 45,  'Info', 'tv'],
  guida:      [171, 44,  'Guida', 'tv'],
  lista:      [83,  50,  'Lista canali', 'tv'],
  precedente: [26,  403, 'Canale precedente', 'tv'],
  preferiti:  [30,  404, 'Preferiti', 'tv'],
  televideo:  [32,  51,  'Televideo', 'tv'],
  sottotitoli:[57,  49,  'Sottotitoli', 'tv'],
  ingresso:   [11,  47,  'Ingresso', 'ingressi'],
  inTv:       [214, null, 'TV', 'ingressi'],
  inHdmi1:    [206, null, 'HDMI 1', 'ingressi'],
  inHdmi2:    [204, null, 'HDMI 2', 'ingressi'],
  inHdmi3:    [233, null, 'HDMI 3', 'ingressi'],
  inHdmi4:    [218, null, 'HDMI 4', 'ingressi'],
  inAv:       [90,  null, 'AV', 'ingressi'],
  inComponent:[191, null, 'Component', 'ingressi'],
  inPc:       [213, null, 'PC', 'ingressi'],
  tre:        [220, 400, '3D', 'media'],
  play:       [176, 33,  'Play', 'media'],
  pausa:      [186, 34,  'Pausa', 'media'],
  stop:       [177, 35,  'Stop', 'media'],
  avanti:     [142, 36,  'Avanti', 'media'],
  indietroVeloce: [143, 37, 'Indietro', 'media'],
  rosso:      [114, 31,  'Rosso', 'colori'],
  verde:      [113, 30,  'Verde', 'colori'],
  giallo:     [99,  32,  'Giallo', 'colori'],
  blu:        [97,  29,  'Blu', 'colori'],
  // Aprono i menu dell utente: da li si possono cambiare impostazioni, come
  // con il telecomando vero. L app li tiene nascosti finche non li chiedi.
  menu:       [67,  null, 'Menu', 'menu'],
  qmenu:      [69,  405, 'Q.Menu', 'menu']
};

// I codici dei menu di servizio, scritti qui solo per poterli rifiutare
// anche se un giorno qualcuno li aggiungesse per sbaglio all elenco.
export var VIETATI = [207, 251, 254, 255];

export function codiceDi(nome, protocollo){
  var t = Object.prototype.hasOwnProperty.call(TASTI, nome) ? TASTI[nome] : null;
  if (!t) return null;
  var c = protocollo === 'roap' ? t[1] : t[0];
  if (c === null || c === undefined) return null;
  if (VIETATI.indexOf(c) !== -1) return null;
  return c;
}

var XML = '<?xml version="1.0" encoding="utf-8"?>';
var PROTOCOLLI = ['hdcp', 'roap'];

function richiesta(host, porta, percorso, corpo, attesa){
  return new Promise(function(resolve){
    var req = http.request({
      host: host, port: porta, path: percorso, method: corpo === null ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/atom+xml' },
      timeout: attesa || 4000
    }, function(res){
      var pezzi = [];
      res.on('data', function(d){ pezzi.push(d); });
      res.on('end', function(){ resolve({ stato: res.statusCode, testo: Buffer.concat(pezzi).toString('utf8') }); });
    });
    req.on('timeout', function(){ req.destroy(new Error('la TV non risponde')); });
    req.on('error', function(e){ resolve({ stato: 0, testo: '', errore: e.message }); });
    if (corpo !== null) req.write(corpo);
    req.end();
  });
}

function dentro(testo, tag){
  var m = new RegExp('<' + tag + '>([^<]*)</' + tag + '>').exec(testo || '');
  return m ? m[1] : '';
}

// Una TV LG. conf: { host, porta, protocollo, chiave }. Le modifiche
// (protocollo trovato, chiave accettata) le riporta a chi la usa con salva().
export function creaTv(conf, salva){
  var tv = {
    host: conf.host || '',
    porta: conf.porta || 8080,
    protocollo: conf.protocollo || '',
    chiave: conf.chiave || '',
    sessione: ''
  };

  function memorizza(){
    if (salva) salva({ host: tv.host, porta: tv.porta, protocollo: tv.protocollo, chiave: tv.chiave });
  }

  function auth(corpo){
    return richiesta(tv.host, tv.porta, '/' + tv.protocollo + '/api/auth', XML + corpo);
  }

  // Chiede alla TV di mostrare il codice di collegamento. Se il protocollo
  // non e ancora noto, il primo che accetta la richiesta e quello giusto.
  tv.mostraCodice = function(){
    if (!tv.host) return Promise.resolve({ ok: false, errore: 'manca l indirizzo della TV' });
    var prova = tv.protocollo ? [tv.protocollo] : PROTOCOLLI.slice();
    function prossimo(){
      if (!prova.length) return Promise.resolve({ ok: false, errore: 'la TV non accetta il telecomando di rete' });
      var p = prova.shift();
      return richiesta(tv.host, tv.porta, '/' + p + '/api/auth', XML + '<auth><type>AuthKeyReq</type></auth>')
        .then(function(r){
          if (r.stato === 200) { tv.protocollo = p; memorizza(); return { ok: true, protocollo: p }; }
          if (r.stato === 0) return { ok: false, errore: 'la TV non risponde: è accesa e sulla stessa rete?' };
          return prossimo();
        });
    }
    return prossimo();
  };

  // Scambia il codice letto sulla TV con una sessione.
  tv.collega = function(chiave){
    var k = String(chiave || tv.chiave || '').replace(/\D/g, '');
    if (!k) return Promise.resolve({ ok: false, errore: 'manca il codice mostrato dalla TV' });
    if (!tv.protocollo) return Promise.resolve({ ok: false, errore: 'prima chiedi alla TV di mostrare il codice' });
    return auth('<auth><type>AuthReq</type><value>' + k + '</value></auth>').then(function(r){
      var s = dentro(r.testo, 'session');
      if (r.stato !== 200 || !s) {
        return { ok: false, errore: r.stato === 0 ? 'la TV non risponde' : 'codice non accettato dalla TV' };
      }
      tv.sessione = s;
      if (tv.chiave !== k) { tv.chiave = k; memorizza(); }
      return { ok: true };
    });
  };

  function invia(codice){
    var percorso = tv.protocollo === 'roap' ? '/roap/api/command' : '/hdcp/api/dtv_wifirc';
    return richiesta(tv.host, tv.porta, percorso, XML + '<command><session>' + tv.sessione +
      '</session><type>HandleKeyInput</type><value>' + codice + '</value></command>');
  }

  // Manda un tasto dell elenco. La sessione scade quando la TV si spegne:
  // se la TV la rifiuta, ci si ricollega con il codice salvato e si riprova
  // una volta sola.
  tv.tasto = function(nome){
    var codice = codiceDi(nome, tv.protocollo);
    if (codice === null) return Promise.resolve({ ok: false, errore: 'tasto non consentito' });
    if (!tv.chiave) return Promise.resolve({ ok: false, errore: 'TV non ancora collegata' });
    var pronto = tv.sessione ? Promise.resolve({ ok: true }) : tv.collega();
    return pronto.then(function(c){
      if (!c.ok) return c;
      return invia(codice).then(function(r){
        if (r.stato === 200) return { ok: true };
        if (r.stato === 0) return { ok: false, errore: 'la TV non risponde: forse è spenta' };
        tv.sessione = '';
        return tv.collega().then(function(c2){
          if (!c2.ok) return c2;
          return invia(codice).then(function(r2){
            return r2.stato === 200 ? { ok: true } : { ok: false, errore: 'la TV ha rifiutato il tasto' };
          });
        });
      });
    });
  };

  // Un canale si cambia come a mano: le cifre una dopo l altra.
  tv.canale = function(numero){
    var cifre = String(numero || '').replace(/\D/g, '').slice(0, 4);
    if (!cifre) return Promise.resolve({ ok: false, errore: 'numero di canale mancante' });
    var i = 0;
    function prossima(){
      if (i >= cifre.length) return Promise.resolve({ ok: true });
      var nome = 'n' + cifre[i++];
      return tv.tasto(nome).then(function(r){
        if (!r.ok) return r;
        return new Promise(function(res){ setTimeout(res, 250); }).then(prossima);
      });
    }
    return prossima();
  };

  tv.stato = function(){
    return { host: tv.host, protocollo: tv.protocollo, collegata: !!tv.chiave };
  };

  tv.imposta = function(host){
    if (host !== tv.host) { tv.host = host; tv.protocollo = ''; tv.chiave = ''; tv.sessione = ''; memorizza(); }
  };

  return tv;
}

// I tasti che l app puo mostrare, con il protocollo in uso.
export function elencoTasti(protocollo){
  var out = [];
  for (var nome in TASTI) {
    if (codiceDi(nome, protocollo) === null) continue;
    out.push({ nome: nome, etichetta: TASTI[nome][2], gruppo: TASTI[nome][3] });
  }
  return out;
}
