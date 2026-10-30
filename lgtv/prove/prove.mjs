// Prove del ponte TV, con la TV finta.
//
//   node lgtv/prove/prove.mjs
//
// Non serve la TV vera e non tocca niente in rete: tutto gira su questo
// computer.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { avvia } from '../ponte/ponte.mjs';
import { avviaTvFinta } from './tv-finta.mjs';
import { TASTI, VIETATI, codiceDi } from '../ponte/lg.mjs';

var passate = 0, fallite = 0;
function prova(cosa, ok, dettaglio){
  if (ok) passate++; else fallite++;
  console.log((ok ? 'ok      ' : 'FALLITA ') + cosa + (dettaglio && !ok ? '  ->  ' + dettaglio : ''));
}

var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponte-prova-'));
var tvf = await avviaTvFinta();
var fileConf = path.join(dir, 'conf.json');
fs.writeFileSync(fileConf, JSON.stringify({ tv: { porta: tvf.porta } }));

var ponte = await avvia({
  porta: 0, msMinuto: 200, ascolta: '127.0.0.1', conf: fileConf, media: path.join(dir, 'media'), indirizzo: '127.0.0.1',
  cercaFinta: function(){ return [{ descrizione: 'http://127.0.0.1:' + tvf.porta + '/dmr.xml' }]; }
});
var B = 'http://127.0.0.1:' + ponte.porta;

function post(p, corpo){
  return fetch(B + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo || {}) })
    .then(function(r){ return r.json(); });
}
function attendi(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

try {
  // ---------- sicurezza dei tasti ----------
  var codici2011 = Object.keys(TASTI).map(function(k){ return TASTI[k][0]; });
  prova('nessun tasto dell elenco usa un codice dei menu di servizio',
    VIETATI.every(function(v){ return codici2011.indexOf(v) === -1; }));
  prova('un nome che non e nell elenco non ha codice', codiceDi('255', 'hdcp') === null && codiceDi('toString', 'hdcp') === null);

  // ---------- ricerca e collegamento ----------
  var c = await post('/api/cerca');
  prova('il ponte trova la LG in rete', c.ok && c.trovate.length === 1 && /47LW650S/.test(c.trovate[0].nome), JSON.stringify(c));
  prova('scelta la TV, il ponte ne conosce l indirizzo', c.stato.tv.host === '127.0.0.1');

  var k = await post('/api/codice');
  prova('la TV mostra il codice e il protocollo del 2011 viene riconosciuto', k.ok && k.protocollo === 'hdcp' && tvf.registro.codiceMostrato >= 1, JSON.stringify(k));

  var no = await post('/api/collega', { codice: '000000' });
  prova('un codice sbagliato viene rifiutato', !no.ok);
  var si = await post('/api/collega', { codice: '123 456' });
  prova('il codice giusto collega la TV', si.ok && si.stato.tv.collegata, JSON.stringify(si));
  prova('il codice resta salvato per le volte dopo', JSON.parse(fs.readFileSync(fileConf, 'utf8')).tv.chiave === '123456');

  // ---------- tasti ----------
  var t = await post('/api/tasto', { tasto: 'volSu' });
  prova('Volume + arriva alla TV con il codice del 2011', t.ok && tvf.registro.tasti.pop() === 2, JSON.stringify(t));
  await post('/api/tasto', { tasto: 'tre' });
  prova('il tasto 3D arriva alla TV', tvf.registro.tasti.pop() === 220);
  await post('/api/tasto', { tasto: 'inHdmi1' });
  prova('l ingresso HDMI 1 si sceglie direttamente', tvf.registro.tasti.pop() === 206);

  var prima = tvf.registro.tasti.length;
  var v1 = await post('/api/tasto', { tasto: '255' });
  var v2 = await post('/api/tasto', { tasto: 'ezadjust' });
  var v3 = await post('/api/tasto', { tasto: '__proto__' });
  prova('i codici dei menu di servizio non partono mai', !v1.ok && !v2.ok && !v3.ok && tvf.registro.tasti.length === prima);

  await post('/api/canale', { numero: '21' });
  prova('il canale 21 si compone con le cifre 2 e 1', tvf.registro.tasti.slice(-2).join(',') === '18,17', tvf.registro.tasti.slice(-2).join(','));

  tvf.dimenticaSessione();
  var dopo = await post('/api/tasto', { tasto: 'muto' });
  prova('se la TV si e riavviata, il ponte si ricollega da solo', dopo.ok && tvf.registro.tasti.pop() === 9, JSON.stringify(dopo));

  // ---------- spegnimento programmato ----------
  var sp = await post('/api/spegnimento', { minuti: 1 });
  var st = await fetch(B + '/api/stato').then(function(r){ return r.json(); });
  prova('lo spegnimento programmato si vede nello stato', sp.ok && st.spegnimento === sp.alle && sp.alle > Date.now());
  await attendi(450);
  prova('all ora giusta la TV riceve Spegni', tvf.registro.tasti.pop() === 8);
  await post('/api/spegnimento', { minuti: 1 });
  await post('/api/spegnimento', { minuti: 0 });
  var prima2 = tvf.registro.tasti.length;
  await attendi(450);
  prova('uno spegnimento annullato non spegne', tvf.registro.tasti.length === prima2);

  // ---------- DLNA ----------
  var jpeg = Buffer.alloc(5000, 7);
  var m = await fetch(B + '/api/manda', { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'X-Nome': encodeURIComponent('Mare 2023.jpg') }, body: jpeg })
    .then(function(r){ return r.json(); });
  await attendi(300);
  var azioni = tvf.registro.soap.map(function(x){ return x.azione; });
  prova('una foto dal telefono arriva alla TV con DLNA', m.ok && azioni.indexOf('SetAVTransportURI') !== -1 && azioni.indexOf('Play') !== -1, JSON.stringify(m));
  var set = tvf.registro.soap.filter(function(x){ return x.azione === 'SetAVTransportURI'; }).pop();
  prova('la TV riceve anche la descrizione della foto', /imageItem\.photo/.test(set.corpo) && /JPEG_LRG/.test(set.corpo));
  var preso = tvf.registro.scaricati.pop() || {};
  prova('la TV riesce a scaricare la foto dal ponte', preso.stato === 206 && preso.byte === 5000 && preso.tipo === 'image/jpeg', JSON.stringify(preso));

  var vol = await post('/api/volume', {});
  prova('il volume della TV si legge', vol.ok && vol.volume === 17, JSON.stringify(vol));

  var foto = await fetch(B + '/api/foto').then(function(r){ return r.json(); });
  prova('le foto mandate restano per lo schermo della TV', foto.ok && foto.foto.length === 1 && foto.foto[0].nome === 'Mare 2023.jpg');

  var r = await post('/api/manda-url', { url: 'https://esempio.it/radio.mp3', tipo: 'audio/mpeg', titolo: 'Radio' });
  set = tvf.registro.soap.filter(function(x){ return x.azione === 'SetAVTransportURI'; }).pop();
  prova('una radio protetta passa dal ponte, in chiaro per la TV', r.ok && /\/flusso\?u=https%3A/.test(set.corpo), set.corpo.slice(0, 200));

  // ---------- protezioni del server ----------
  var interno = await fetch(B + '/flusso?u=' + encodeURIComponent('http://192.168.1.1/admin'));
  prova('il ponte non apre indirizzi della rete di casa per conto d altri', interno.status === 403);
  var fuori = await fetch(B + '/..%2f..%2fponte.mjs');
  prova('non si leggono file fuori dalle pagine', fuori.status === 403 || fuori.status === 404);
  var pagina = await fetch(B + '/');
  var tvPagina = await fetch(B + '/tv/');
  prova('le pagine del telefono e della TV ci sono', pagina.status === 200 && tvPagina.status === 200);
} finally {
  ponte.chiudi();
  tvf.chiudi();
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log('\n' + passate + ' passate, ' + fallite + ' fallite');
process.exit(fallite ? 1 : 0);
