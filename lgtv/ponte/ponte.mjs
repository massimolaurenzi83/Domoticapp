// Ponte TV: il programma che fa da tramite fra il telefono e la TV LG.
//
// Gira su qualunque cosa resti accesa in casa e abbia Node: un Raspberry
// Pi, un computer, un vecchio telefono Android con Termux. Il telefono apre
// la sua pagina, e lui parla con la TV nella lingua che la TV capisce:
//
//   - i tasti del telecomando, con il protocollo di rete delle LG;
//   - foto, musica e video, con il DLNA;
//   - per il browser della TV, che e del 2011 e non apre piu i siti
//     protetti di oggi, fa da tramite verso meteo, notizie e radio.
//
// Avvio:   node lgtv/ponte/ponte.mjs
// Poi, dal telefono sulla stessa rete Wi-Fi: http://<indirizzo>:8095
//
// Non usa librerie esterne: basta Node 18 o piu recente.

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { creaTv, elencoTasti, TASTI } from './lg.mjs';
import { cerca, descrivi, creaRenderer } from './dlna.mjs';

var QUI = path.dirname(fileURLToPath(import.meta.url));
var GIORNO = 24 * 3600000;
var MAX_FILE = 4 * 1024 * 1024 * 1024;

var TIPI = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo'
};

export function avvia(opz){
  opz = opz || {};
  var porta = opz.porta !== undefined ? opz.porta : (parseInt(process.env.PONTE_TV_PORTA, 10) || 8095);
  var fileConf = opz.conf || process.env.PONTE_TV_CONF || path.join(os.homedir(), '.ponte-tv.json');
  var cartella = opz.media || path.join(os.tmpdir(), 'ponte-tv-media');
  fs.mkdirSync(cartella, { recursive: true });

  var conf = leggiConf(fileConf);
  function salvaConf(){
    try { fs.writeFileSync(fileConf, JSON.stringify(conf, null, 2)); } catch (e) {}
  }

  var tv = creaTv(conf.tv || {}, function(t){ conf.tv = t; salvaConf(); });
  var renderer = null;
  var media = {};

  // ---------- spegnimento programmato ----------
  //
  // L orario resta salvato: se il ponte si riavvia, lo spegnimento non si
  // perde. Uno scaduto da piu di tre minuti non si esegue: spegnere tardi
  // la TV a qualcuno che sta guardando un film sarebbe uno scherzo.

  var MINUTO = opz.msMinuto || 60000;
  var timerSpegni = null;

  function programmaSpegnimento(){
    if (timerSpegni) { clearTimeout(timerSpegni); timerSpegni = null; }
    var at = conf.spegnimento || 0;
    if (!at) return;
    var manca = at - Date.now();
    if (manca < -3 * MINUTO) { conf.spegnimento = 0; salvaConf(); return; }
    timerSpegni = setTimeout(function(){
      conf.spegnimento = 0;
      salvaConf();
      tv.tasto('spegni');
    }, Math.max(0, manca));
    timerSpegni.unref();
  }
  programmaSpegnimento();

  // ---------- la TV come renderer DLNA ----------

  function preparaRenderer(){
    if (renderer) return Promise.resolve(renderer);
    if (conf.dlna) {
      return descrivi(conf.dlna).then(function(d){
        if (d && d.avt) { renderer = creaRenderer(d); return renderer; }
        return null;
      });
    }
    return Promise.resolve(null);
  }

  // Cerca le TV in rete: tiene le LG, e fra queste quella gia scelta.
  function trovaTv(){
    var elenco = opz.cercaFinta ? opz.cercaFinta() : cerca(3000);
    return Promise.resolve(elenco).then(function(lista){
      return Promise.all(lista.map(function(x){ return descrivi(x.descrizione); }));
    }).then(function(descritti){
      return descritti.filter(function(d){ return d && /lg/i.test(d.marca + ' ' + d.nome); });
    });
  }

  function scegli(d){
    conf.dlna = d.descrizione;
    renderer = creaRenderer(d);
    tv.imposta(d.ip);
    salvaConf();
  }

  // L indirizzo con cui la TV raggiunge il ponte: quello sulla stessa rete.
  function mioIndirizzo(){
    if (opz.indirizzo) return opz.indirizzo;
    var tvIp = tv.host || '';
    var candidati = [];
    var schede = os.networkInterfaces();
    for (var k in schede) {
      (schede[k] || []).forEach(function(a){ if (a.family === 'IPv4' && !a.internal) candidati.push(a.address); });
    }
    var stessa = candidati.filter(function(ip){ return tvIp && ip.split('.').slice(0, 3).join('.') === tvIp.split('.').slice(0, 3).join('.'); });
    return stessa[0] || candidati[0] || '127.0.0.1';
  }

  function base(){ return 'http://' + mioIndirizzo() + ':' + porta; }

  // ---------- file mandati dal telefono ----------

  function pulisci(){
    var ora = Date.now();
    Object.keys(media).forEach(function(id){
      if (ora - media[id].at > GIORNO) {
        try { fs.unlinkSync(media[id].file); } catch (e) {}
        delete media[id];
      }
    });
  }
  setInterval(pulisci, 3600000).unref();

  function riceviFile(req){
    return new Promise(function(resolve){
      var id = crypto.randomBytes(8).toString('hex');
      var mime = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0];
      var nome = decodeURIComponent(String(req.headers['x-nome'] || 'file'));
      var file = path.join(cartella, id);
      var out = fs.createWriteStream(file);
      var totale = 0;
      var troppo = false;
      req.on('data', function(d){
        totale += d.length;
        if (totale > MAX_FILE && !troppo) { troppo = true; req.unpipe(out); out.destroy(); }
      });
      req.pipe(out);
      out.on('finish', function(){
        media[id] = { file: file, mime: mime, nome: nome, at: Date.now(), dimensione: totale };
        resolve({ ok: true, id: id });
      });
      out.on('close', function(){ if (troppo) resolve({ ok: false, errore: 'file troppo grande' }); });
      out.on('error', function(e){ resolve({ ok: false, errore: e.message }); });
    });
  }

  // La TV legge i file a pezzi e salta avanti e indietro nei video: per
  // questo serve rispondere alle richieste di un intervallo.
  function serviFile(req, res, m){
    var stat;
    try { stat = fs.statSync(m.file); } catch (e) { res.writeHead(404); res.end(); return; }
    var intestazioni = {
      'Content-Type': m.mime, 'Accept-Ranges': 'bytes',
      'transferMode.dlna.org': /^image\//.test(m.mime) ? 'Interactive' : 'Streaming',
      'contentFeatures.dlna.org': 'DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01700000000000000000000000000000'
    };
    var r = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    if (r) {
      var da = r[1] ? parseInt(r[1], 10) : 0;
      var a = r[2] ? parseInt(r[2], 10) : stat.size - 1;
      if (da >= stat.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + stat.size }); res.end(); return; }
      intestazioni['Content-Range'] = 'bytes ' + da + '-' + a + '/' + stat.size;
      intestazioni['Content-Length'] = a - da + 1;
      res.writeHead(206, intestazioni);
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(m.file, { start: da, end: a }).pipe(res);
      return;
    }
    intestazioni['Content-Length'] = stat.size;
    res.writeHead(200, intestazioni);
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(m.file).pipe(res);
  }

  // ---------- tramite per il browser della TV ----------
  //
  // Il browser della TV non apre i siti protetti di oggi: il ponte li apre
  // al posto suo e gli passa solo il risultato, in chiaro dentro casa.

  function prendi(indirizzo){
    return fetch(indirizzo, { headers: { 'User-Agent': 'PonteTV/1.0' }, signal: AbortSignal.timeout(10000) });
  }

  function meteo(){
    var p = conf.posizione || { lat: 41.9028, lon: 12.4964, luogo: 'Roma' };
    var u = 'https://api.open-meteo.com/v1/forecast?latitude=' + p.lat + '&longitude=' + p.lon +
      '&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=4';
    return prendi(u).then(function(r){ return r.json(); }).then(function(j){
      return {
        ok: true, luogo: p.luogo,
        temp: Math.round(j.current.temperature_2m), codice: j.current.weather_code,
        giorni: j.daily.time.map(function(t, i){
          return { data: t, max: Math.round(j.daily.temperature_2m_max[i]), min: Math.round(j.daily.temperature_2m_min[i]),
                   codice: j.daily.weather_code[i] };
        })
      };
    });
  }

  function cercaLuogo(nome){
    return prendi('https://geocoding-api.open-meteo.com/v1/search?count=1&language=it&name=' + encodeURIComponent(nome))
      .then(function(r){ return r.json(); })
      .then(function(j){
        var x = j && j.results && j.results[0];
        if (!x) return { ok: false, errore: 'luogo non trovato' };
        conf.posizione = { lat: x.latitude, lon: x.longitude, luogo: x.name };
        salvaConf();
        return { ok: true, luogo: x.name };
      });
  }

  function notizie(){
    return prendi('https://www.ansa.it/sito/notizie/topnews/topnews_rss.xml')
      .then(function(r){ return r.text(); })
      .then(function(x){
        var out = [];
        var re = /<item>([\s\S]*?)<\/item>/g, m;
        while ((m = re.exec(x)) && out.length < 15) {
          var t = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(m[1]);
          if (t) out.push(t[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;|&apos;/g, '\'').trim());
        }
        return { ok: true, titoli: out };
      });
  }

  var RADIO = ['https://de1.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://at1.api.radio-browser.info'];

  function radio(q){
    var percorso = '/json/stations/search?limit=40&hidebroken=true&order=clickcount&reverse=true&codec=MP3' +
      (q ? '&name=' + encodeURIComponent(q) : '&countrycode=IT');
    function prova(i){
      if (i >= RADIO.length) return Promise.resolve({ ok: false, errore: 'archivio delle radio non raggiungibile' });
      return prendi(RADIO[i] + percorso).then(function(r){ return r.json(); }).then(function(l){
        return { ok: true, stazioni: l.map(function(s){
          return { nome: String(s.name || '').trim(), url: s.url_resolved || s.url, paese: s.country || '' };
        }).filter(function(s){ return s.url; }) };
      }, function(){ return prova(i + 1); });
    }
    return prova(0);
  }

  // Ripete un flusso radio in chiaro, per la TV. Solo audio, e mai verso
  // indirizzi di casa: il ponte non deve diventare una porta verso la rete
  // interna.
  function flusso(req, res, indirizzo){
    var u;
    try { u = new URL(indirizzo); } catch (e) { res.writeHead(400); res.end(); return; }
    if (!/^https?:$/.test(u.protocol) || privato(u.hostname)) { res.writeHead(403); res.end(); return; }
    var ctrl = new AbortController();
    req.on('close', function(){ ctrl.abort(); });
    fetch(u, { headers: { 'User-Agent': 'PonteTV/1.0', 'Icy-MetaData': '0' }, signal: ctrl.signal }).then(function(r){
      var tipo = r.headers.get('content-type') || 'audio/mpeg';
      if (!r.ok || !/^audio\/|mpegurl|octet-stream/.test(tipo)) { res.writeHead(502); res.end(); ctrl.abort(); return; }
      res.writeHead(200, { 'Content-Type': /^audio\//.test(tipo) ? tipo : 'audio/mpeg', 'Cache-Control': 'no-store',
        'transferMode.dlna.org': 'Streaming', 'contentFeatures.dlna.org': 'DLNA.ORG_PN=MP3;DLNA.ORG_OP=00;DLNA.ORG_FLAGS=01700000000000000000000000000000' });
      var lettore = r.body.getReader();
      function pompa(){
        lettore.read().then(function(x){
          if (x.done) { res.end(); return; }
          if (res.write(Buffer.from(x.value))) pompa(); else res.once('drain', pompa);
        }, function(){ res.end(); });
      }
      pompa();
    }, function(){ if (!res.headersSent) res.writeHead(502); res.end(); });
  }

  // ---------- server ----------

  function json(res, stato, dati){
    var corpo = JSON.stringify(dati);
    res.writeHead(stato, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(corpo);
  }

  function leggiJson(req){
    return new Promise(function(resolve){
      var pezzi = [], tot = 0;
      req.on('data', function(d){ tot += d.length; if (tot < 100000) pezzi.push(d); });
      req.on('end', function(){
        try { resolve(JSON.parse(Buffer.concat(pezzi).toString('utf8') || '{}')); } catch (e) { resolve({}); }
      });
    });
  }

  function statico(res, radice, rel){
    var file = path.normalize(path.join(radice, rel || 'index.html'));
    if (file.indexOf(radice) !== 0) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, function(err, dati){
      if (err) { res.writeHead(404); res.end('non trovato'); return; }
      res.writeHead(200, { 'Content-Type': TIPI[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(dati);
    });
  }

  function stato(){
    return {
      tv: tv.stato(),
      dlna: renderer ? { nome: renderer.info.nome, modello: renderer.info.modello } : null,
      tasti: elencoTasti(tv.protocollo),
      ingressi: conf.ingressi || {},
      spegnimento: conf.spegnimento || 0,
      luogo: conf.posizione ? conf.posizione.luogo : 'Roma',
      indirizzo: base()
    };
  }

  // Manda alla TV un file gia ricevuto, o un indirizzo esterno.
  function mandaAllaTv(indirizzo, mime, titolo){
    return preparaRenderer().then(function(r){
      if (!r) return { ok: false, errore: 'TV non trovata: cercala prima dalla pagina Collega' };
      return r.manda(indirizzo, mime, titolo);
    });
  }

  var api = {
    'GET /api/stato': function(){ return Promise.resolve(stato()); },
    'POST /api/cerca': function(){
      return trovaTv().then(function(lista){
        if (lista.length === 1) scegli(lista[0]);
        return { ok: true, trovate: lista.map(function(d){ return { nome: d.nome, modello: d.modello, ip: d.ip, descrizione: d.descrizione }; }),
                 stato: stato() };
      });
    },
    'POST /api/scegli': function(b){
      return descrivi(String(b.descrizione || '')).then(function(d){
        if (!d) return { ok: false, errore: 'TV non raggiungibile' };
        scegli(d);
        return { ok: true, stato: stato() };
      });
    },
    // Senza DLNA si puo scrivere a mano l indirizzo della TV.
    'POST /api/indirizzo': function(b){
      var ip = String(b.ip || '').trim();
      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return Promise.resolve({ ok: false, errore: 'indirizzo non valido' });
      tv.imposta(ip);
      return Promise.resolve({ ok: true, stato: stato() });
    },
    'POST /api/codice': function(){ return tv.mostraCodice(); },
    'POST /api/collega': function(b){
      return tv.collega(b.codice).then(function(r){ r.stato = stato(); return r; });
    },
    'POST /api/tasto': function(b){ return tv.tasto(String(b.tasto || '')); },
    'POST /api/canale': function(b){ return tv.canale(b.numero); },
    'POST /api/ingressi': function(b){
      var nomi = {};
      for (var k in (b.ingressi || {})) {
        if (/^in[A-Za-z0-9]+$/.test(k) && TASTI[k]) nomi[k] = String(b.ingressi[k]).slice(0, 30);
      }
      conf.ingressi = nomi;
      salvaConf();
      return Promise.resolve({ ok: true });
    },
    'POST /api/spegnimento': function(b){
      var m = Math.max(0, Math.min(600, parseInt(b.minuti, 10) || 0));
      conf.spegnimento = m ? Date.now() + m * MINUTO : 0;
      salvaConf();
      programmaSpegnimento();
      return Promise.resolve({ ok: true, alle: conf.spegnimento });
    },
    'POST /api/luogo': function(b){ return cercaLuogo(String(b.nome || '').slice(0, 80)); },
    'POST /api/manda-url': function(b){
      var u = String(b.url || '');
      var mime = String(b.tipo || 'audio/mpeg');
      if (!/^https?:\/\//.test(u)) return Promise.resolve({ ok: false, errore: 'indirizzo non valido' });
      // La TV del 2011 non apre i flussi protetti: passano dal ponte.
      var perTv = /^audio\//.test(mime) ? base() + '/flusso?u=' + encodeURIComponent(u) : u;
      return mandaAllaTv(perTv, mime, b.titolo);
    },
    'POST /api/media': function(b){
      return preparaRenderer().then(function(r){
        if (!r) return { ok: false, errore: 'TV non trovata' };
        if (b.azione === 'play') return r.play();
        if (b.azione === 'pausa') return r.pausa();
        return r.stop();
      });
    },
    'POST /api/volume': function(b){
      return preparaRenderer().then(function(r){
        if (!r) return { ok: false, errore: 'TV non trovata' };
        return typeof b.valore === 'number' ? r.impostaVolume(b.valore) : r.volume();
      });
    },
    'GET /api/meteo': function(){ return meteo(); },
    'GET /api/notizie': function(){ return notizie(); },
    'GET /api/foto': function(){
      var foto = Object.keys(media).filter(function(id){ return /^image\//.test(media[id].mime); })
        .sort(function(a, b){ return media[b].at - media[a].at; })
        .map(function(id){ return { id: id, url: '/media/' + id, nome: media[id].nome }; });
      return Promise.resolve({ ok: true, foto: foto });
    }
  };

  var server = http.createServer(function(req, res){
    var u = new URL(req.url, 'http://ponte');
    var chiave = req.method + ' ' + u.pathname;

    if (chiave === 'POST /api/manda') {
      riceviFile(req).then(function(r){
        if (!r.ok) { json(res, 400, r); return; }
        var m = media[r.id];
        if (u.searchParams.get('solo') === '1') { json(res, 200, { ok: true, id: r.id }); return; }
        mandaAllaTv(base() + '/media/' + r.id, m.mime, m.nome).then(function(x){ x.id = r.id; json(res, 200, x); });
      });
      return;
    }
    if (chiave === 'GET /api/radio') {
      radio(u.searchParams.get('q') || '').then(function(r){ json(res, 200, r); }, function(e){ json(res, 200, { ok: false, errore: e.message }); });
      return;
    }
    if (api[chiave]) {
      var corpo = req.method === 'POST' ? leggiJson(req) : Promise.resolve({});
      corpo.then(function(b){ return api[chiave](b); })
        .then(function(r){ json(res, 200, r); }, function(e){ json(res, 200, { ok: false, errore: e && e.message ? e.message : 'errore' }); });
      return;
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && u.pathname.indexOf('/media/') === 0) {
      var m = media[u.pathname.slice(7)];
      if (!m) { res.writeHead(404); res.end(); return; }
      serviFile(req, res, m);
      return;
    }
    if (req.method === 'GET' && u.pathname === '/flusso') { flusso(req, res, u.searchParams.get('u') || ''); return; }
    if (req.method === 'GET' && (u.pathname === '/tv' || u.pathname.indexOf('/tv/') === 0)) {
      if (u.pathname === '/tv') { res.writeHead(302, { Location: '/tv/' }); res.end(); return; }
      statico(res, path.join(QUI, 'tv'), u.pathname.slice(4));
      return;
    }
    if (req.method === 'GET') { statico(res, path.join(QUI, 'web'), u.pathname.slice(1)); return; }
    res.writeHead(405); res.end();
  });

  return new Promise(function(resolve){
    server.listen(porta, opz.ascolta || '0.0.0.0', function(){
      // Con la porta 0 la sceglie il sistema: serve quella vera per gli
      // indirizzi che la TV deve aprire.
      porta = server.address().port;
      resolve({ server: server, porta: server.address().port,
                chiudi: function(){ if (timerSpegni) clearTimeout(timerSpegni); server.close(); } });
    });
  });
}

function leggiConf(file){
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return {}; }
}

function privato(host){
  return /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd])/i.test(host);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  avvia().then(function(s){
    var ind = [];
    var schede = os.networkInterfaces();
    for (var k in schede) (schede[k] || []).forEach(function(a){ if (a.family === 'IPv4' && !a.internal) ind.push(a.address); });
    console.log('Ponte TV acceso.');
    console.log('Dal telefono apri:    ' + ind.map(function(i){ return 'http://' + i + ':' + s.porta; }).join('  oppure  '));
    console.log('Dal browser della TV: ' + ind.map(function(i){ return 'http://' + i + ':' + s.porta + '/tv'; }).join('  oppure  '));
  });
}
