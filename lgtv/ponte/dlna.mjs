// Mandare foto, musica e video alla TV, senza Chromecast.
//
// Le LG della serie LW sono "renderer DLNA": accettano dalla rete di casa
// l indirizzo di un file e lo riproducono, come il "Play To" di Windows.
// Il ponte mette il file a disposizione su un indirizzo locale e dice alla
// TV di aprirlo. Niente di questo cambia le impostazioni della TV.

import dgram from 'node:dgram';
import http from 'node:http';

var SSDP = '239.255.255.250';
var RENDERER = 'urn:schemas-upnp-org:device:MediaRenderer:1';
var AVT = 'urn:schemas-upnp-org:service:AVTransport:1';
var RC = 'urn:schemas-upnp-org:service:RenderingControl:1';

function scarica(indirizzo, attesa){
  return new Promise(function(resolve){
    var req = http.get(indirizzo, { timeout: attesa || 4000 }, function(res){
      var pezzi = [];
      res.on('data', function(d){ pezzi.push(d); });
      res.on('end', function(){ resolve({ stato: res.statusCode, testo: Buffer.concat(pezzi).toString('utf8') }); });
    });
    req.on('timeout', function(){ req.destroy(new Error('timeout')); });
    req.on('error', function(e){ resolve({ stato: 0, testo: '', errore: e.message }); });
  });
}

function tag(testo, nome){
  var m = new RegExp('<(?:[a-zA-Z]+:)?' + nome + '[^>]*>([\\s\\S]*?)</(?:[a-zA-Z]+:)?' + nome + '>').exec(testo || '');
  return m ? m[1].trim() : '';
}

export function esc(t){
  return String(t == null ? '' : t).replace(/[&<>"']/g, function(c){
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c];
  });
}

// Cerca nella rete i renderer DLNA. Restituisce gli indirizzi delle loro
// descrizioni, senza doppioni.
export function cerca(attesa){
  return new Promise(function(resolve){
    var trovati = {};
    var sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    var msg = Buffer.from('M-SEARCH * HTTP/1.1\r\nHOST: ' + SSDP + ':1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: ' +
      RENDERER + '\r\n\r\n');
    sock.on('message', function(buf, da){
      var m = /^location:\s*(\S+)/im.exec(buf.toString());
      if (m) trovati[m[1]] = da.address;
    });
    sock.on('error', function(){ try { sock.close(); } catch (e) {} resolve([]); });
    sock.bind(0, function(){
      try { sock.send(msg, 1900, SSDP); setTimeout(function(){ try { sock.send(msg, 1900, SSDP); } catch (e) {} }, 600); } catch (e) {}
    });
    setTimeout(function(){
      try { sock.close(); } catch (e) {}
      resolve(Object.keys(trovati).map(function(l){ return { descrizione: l, ip: trovati[l] }; }));
    }, attesa || 3000);
  });
}

// Legge la descrizione di un renderer: nome, marca e dove mandare i comandi.
export function descrivi(indirizzo){
  return scarica(indirizzo).then(function(r){
    if (r.stato !== 200) return null;
    var base = tag(r.testo, 'URLBase') || indirizzo;
    var servizi = {};
    var re = /<service>([\s\S]*?)<\/service>/g, m;
    while ((m = re.exec(r.testo))) {
      var tipo = tag(m[1], 'serviceType');
      var ctrl = tag(m[1], 'controlURL');
      if (tipo && ctrl) servizi[tipo] = new URL(ctrl, base).toString();
    }
    return {
      descrizione: indirizzo,
      ip: new URL(indirizzo).hostname,
      nome: tag(r.testo, 'friendlyName'),
      marca: tag(r.testo, 'manufacturer'),
      modello: tag(r.testo, 'modelName'),
      avt: servizi[AVT] || '',
      rc: servizi[RC] || ''
    };
  });
}

function soap(controllo, servizio, azione, argomenti){
  return new Promise(function(resolve){
    var corpo = '<?xml version="1.0" encoding="utf-8"?>' +
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">' +
      '<s:Body><u:' + azione + ' xmlns:u="' + servizio + '">' + argomenti + '</u:' + azione + '></s:Body></s:Envelope>';
    var u = new URL(controllo);
    var req = http.request({
      host: u.hostname, port: u.port || 80, path: u.pathname + u.search, method: 'POST', timeout: 6000,
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        'SOAPAction': '"' + servizio + '#' + azione + '"',
        'Content-Length': Buffer.byteLength(corpo)
      }
    }, function(res){
      var pezzi = [];
      res.on('data', function(d){ pezzi.push(d); });
      res.on('end', function(){
        var testo = Buffer.concat(pezzi).toString('utf8');
        resolve({ ok: res.statusCode === 200, testo: testo,
                  errore: res.statusCode === 200 ? '' : (tag(testo, 'errorDescription') || 'errore ' + res.statusCode) });
      });
    });
    req.on('timeout', function(){ req.destroy(new Error('la TV non risponde')); });
    req.on('error', function(e){ resolve({ ok: false, testo: '', errore: e.message }); });
    req.write(corpo);
    req.end();
  });
}

// Le TV LG del 2011 sono esigenti: vogliono la descrizione del file
// insieme al suo indirizzo, con il tipo giusto.
var CLASSI = { foto: 'object.item.imageItem.photo', musica: 'object.item.audioItem.musicTrack', video: 'object.item.videoItem' };
var PROFILI = { 'image/jpeg': 'DLNA.ORG_PN=JPEG_LRG', 'audio/mpeg': 'DLNA.ORG_PN=MP3' };

export function tipoDa(mime){
  if (/^image\//.test(mime)) return 'foto';
  if (/^audio\//.test(mime)) return 'musica';
  return 'video';
}

export function didl(indirizzo, mime, titolo){
  var tipo = tipoDa(mime);
  var info = 'http-get:*:' + mime + ':' + (PROFILI[mime] ? PROFILI[mime] + ';' : '') + 'DLNA.ORG_OP=01;DLNA.ORG_FLAGS=01700000000000000000000000000000';
  return '<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
    'xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/">' +
    '<item id="1" parentID="0" restricted="1"><dc:title>' + esc(titolo || 'Dal telefono') + '</dc:title>' +
    '<upnp:class>' + CLASSI[tipo] + '</upnp:class>' +
    '<res protocolInfo="' + esc(info) + '">' + esc(indirizzo) + '</res></item></DIDL-Lite>';
}

// Un renderer gia descritto. Tutti i comandi risolvono con { ok, errore }.
export function creaRenderer(d){
  var r = { info: d };

  r.manda = function(indirizzo, mime, titolo){
    if (!d.avt) return Promise.resolve({ ok: false, errore: 'la TV non accetta file dalla rete' });
    return soap(d.avt, AVT, 'SetAVTransportURI', '<InstanceID>0</InstanceID><CurrentURI>' + esc(indirizzo) +
      '</CurrentURI><CurrentURIMetaData>' + esc(didl(indirizzo, mime, titolo)) + '</CurrentURIMetaData>')
      .then(function(x){
        if (!x.ok) return x;
        return soap(d.avt, AVT, 'Play', '<InstanceID>0</InstanceID><Speed>1</Speed>');
      });
  };
  r.play = function(){ return soap(d.avt, AVT, 'Play', '<InstanceID>0</InstanceID><Speed>1</Speed>'); };
  r.pausa = function(){ return soap(d.avt, AVT, 'Pause', '<InstanceID>0</InstanceID>'); };
  r.stop = function(){ return soap(d.avt, AVT, 'Stop', '<InstanceID>0</InstanceID>'); };

  r.volume = function(){
    if (!d.rc) return Promise.resolve({ ok: false, errore: 'volume non disponibile' });
    return soap(d.rc, RC, 'GetVolume', '<InstanceID>0</InstanceID><Channel>Master</Channel>').then(function(x){
      if (!x.ok) return x;
      return { ok: true, volume: parseInt(tag(x.testo, 'CurrentVolume'), 10) };
    });
  };
  r.impostaVolume = function(v){
    if (!d.rc) return Promise.resolve({ ok: false, errore: 'volume non disponibile' });
    var n = Math.max(0, Math.min(100, Math.round(v)));
    return soap(d.rc, RC, 'SetVolume', '<InstanceID>0</InstanceID><Channel>Master</Channel><DesiredVolume>' + n + '</DesiredVolume>');
  };
  r.statoRiproduzione = function(){
    return soap(d.avt, AVT, 'GetTransportInfo', '<InstanceID>0</InstanceID>').then(function(x){
      if (!x.ok) return x;
      return { ok: true, stato: tag(x.testo, 'CurrentTransportState') };
    });
  };
  return r;
}
