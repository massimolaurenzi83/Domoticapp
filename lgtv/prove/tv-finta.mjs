// Una LG del 2011 finta, per provare il ponte senza la TV vera.
//
// Risponde come una NetCast 2.0: protocollo "hdcp" per i tasti (e non
// "roap"), codice di collegamento 123456, renderer DLNA con AVTransport e
// RenderingControl. Ricorda tutto quello che riceve, e quando le si dice di
// riprodurre un file va davvero a prenderlo, come farebbe la TV.

import http from 'node:http';

export function avviaTvFinta(){
  var registro = { tasti: [], soap: [], scaricati: [], codiceMostrato: 0 };
  var sessione = '';

  var server = http.createServer(function(req, res){
    var pezzi = [];
    req.on('data', function(d){ pezzi.push(d); });
    req.on('end', function(){
      var corpo = Buffer.concat(pezzi).toString('utf8');
      var p = req.url;

      if (p === '/hdcp/api/auth') {
        if (/AuthKeyReq/.test(corpo)) { registro.codiceMostrato++; res.writeHead(200); res.end('<envelope><HDCPError>200</HDCPError></envelope>'); return; }
        if (/<value>123456<\/value>/.test(corpo)) {
          sessione = String(10000000 + Math.floor(Math.random() * 89999999));
          res.writeHead(200); res.end('<envelope><HDCPError>200</HDCPError><session>' + sessione + '</session></envelope>');
          return;
        }
        res.writeHead(401); res.end('<envelope><HDCPError>401</HDCPError></envelope>');
        return;
      }
      if (p === '/hdcp/api/dtv_wifirc') {
        var s = /<session>(\d+)<\/session>/.exec(corpo);
        if (!s || s[1] !== sessione) { res.writeHead(401); res.end(); return; }
        registro.tasti.push(parseInt(/<value>(\d+)<\/value>/.exec(corpo)[1], 10));
        res.writeHead(200); res.end('<envelope><HDCPError>200</HDCPError></envelope>');
        return;
      }
      if (p.indexOf('/roap/') === 0) { res.writeHead(404); res.end(); return; }

      if (p === '/dmr.xml') {
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end('<?xml version="1.0"?><root xmlns="urn:schemas-upnp-org:device-1-0"><device>' +
          '<deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType>' +
          '<friendlyName>[TV]47LW650S-ZA</friendlyName><manufacturer>LG Electronics</manufacturer>' +
          '<modelName>LG TV</modelName><serviceList>' +
          '<service><serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType>' +
          '<controlURL>/upnp/control/AVTransport1</controlURL></service>' +
          '<service><serviceType>urn:schemas-upnp-org:service:RenderingControl:1</serviceType>' +
          '<controlURL>/upnp/control/RenderingControl1</controlURL></service>' +
          '</serviceList></device></root>');
        return;
      }
      if (p.indexOf('/upnp/control/') === 0) {
        var azione = String(req.headers.soapaction || '').replace(/"/g, '').split('#')[1];
        registro.soap.push({ azione: azione, corpo: corpo });
        var risposta = '';
        if (azione === 'GetVolume') risposta = '<CurrentVolume>17</CurrentVolume>';
        if (azione === 'GetTransportInfo') risposta = '<CurrentTransportState>PLAYING</CurrentTransportState>';
        if (azione === 'Play') {
          // Come la TV vera: va a prendere il file che le e stato indicato.
          var ultimo = registro.soap.filter(function(x){ return x.azione === 'SetAVTransportURI'; }).pop();
          var uri = ultimo && /<CurrentURI>([^<]+)<\/CurrentURI>/.exec(ultimo.corpo);
          if (uri) {
            var indirizzo = uri[1].replace(/&amp;/g, '&');
            http.get(indirizzo, { headers: { Range: 'bytes=0-' } }, function(r){
              var n = 0;
              r.on('data', function(d){ n += d.length; });
              r.on('end', function(){ registro.scaricati.push({ url: indirizzo, stato: r.statusCode, byte: n, tipo: r.headers['content-type'] }); });
            }).on('error', function(){ registro.scaricati.push({ url: indirizzo, stato: 0 }); });
          }
        }
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end('<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:' + azione +
          'Response xmlns:u="urn:schemas-upnp-org:service:x:1">' + risposta + '</u:' + azione + 'Response></s:Body></s:Envelope>');
        return;
      }
      res.writeHead(404); res.end();
    });
  });

  return new Promise(function(resolve){
    server.listen(0, '127.0.0.1', function(){
      resolve({
        porta: server.address().port,
        registro: registro,
        // Come quando la TV si spegne e si riaccende: la sessione non vale piu.
        dimenticaSessione: function(){ sessione = ''; },
        chiudi: function(){ server.close(); }
      });
    });
  });
}
