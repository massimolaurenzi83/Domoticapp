// Lo schermo di casa nel browser della TV LG del 2011.
//
// Quel browser e un WebKit del 2010: niente funzioni recenti, niente siti
// protetti. Per questo tutto arriva dal ponte, in chiaro dentro casa, e il
// codice usa solo cio che c era allora. Pagina leggera apposta: un immagine
// alla volta, nessuna animazione continua, per non affaticare la TV.

(function(){
  var GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  var CORTI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
  var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
              'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

  // Tasti del telecomando LG nel browser della TV, piu quelli di una
  // tastiera, per provarla anche dal computer.
  var K = { su: 38, giu: 40, sx: 37, dx: 39, ok: 13, rosso: 403, verde: 404, giallo: 405, blu: 406,
            play: 415, pausa: 19, stop: 413 };

  var contenuto = document.getElementById('contenuto');
  var audio = document.getElementById('audio');
  var sezione = '';
  var scelta = 0;
  var dati = { meteo: null, notizie: [], radio: [], foto: [] };
  var inOnda = -1;
  var fotoIndice = 0;
  var fotoTimer = null;

  function $(id){ return document.getElementById(id); }
  function due(n){ return n < 10 ? '0' + n : String(n); }

  function esc(t){
    return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function prendi(indirizzo, fn){
    var x = new XMLHttpRequest();
    x.open('GET', indirizzo, true);
    x.onreadystatechange = function(){
      if (x.readyState !== 4) return;
      var r = null;
      try { r = JSON.parse(x.responseText); } catch (e) {}
      fn(r && r.ok ? r : null);
    };
    x.send(null);
  }

  // ---------- orologio ----------

  function orologio(){
    var d = new Date();
    $('ora').innerHTML = due(d.getHours()) + ':' + due(d.getMinutes());
    $('data').innerHTML = GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()];
  }

  // ---------- meteo ----------

  function descrivi(c){
    if (c === 0) return 'sereno';
    if (c <= 2) return 'poco nuvoloso';
    if (c === 3) return 'nuvoloso';
    if (c <= 48) return 'nebbia';
    if (c <= 57) return 'pioviggine';
    if (c <= 67) return 'pioggia';
    if (c <= 77) return 'neve';
    if (c <= 82) return 'rovesci';
    if (c <= 86) return 'neve a tratti';
    return 'temporale';
  }

  function carica(){
    prendi('/api/meteo', function(r){ if (r) { dati.meteo = r; if (sezione === 'home') home(); } });
    prendi('/api/notizie', function(r){ if (r) { dati.notizie = r.titoli; if (sezione === 'home' || sezione === 'notizie') ridisegna(); } });
  }

  // ---------- sezioni ----------

  function home(){
    var m = dati.meteo;
    var h = '';
    if (m) {
      h += '<div class="meteo-ora">' + m.temp + '°</div>';
      h += '<div class="meteo-desc">' + esc(descrivi(m.codice)) + ' · ' + esc(m.luogo) + '</div>';
      h += '<div class="giorni">';
      for (var i = 1; i < m.giorni.length; i++) {
        var g = m.giorni[i];
        // Il browser del 2011 non legge le date scritte all internazionale.
        var pz = String(g.data).split('-');
        var d = new Date(+pz[0], +pz[1] - 1, +pz[2]);
        h += '<div class="giorno"><div class="nome">' + CORTI[d.getDay()] + ' ' + d.getDate() + '</div>' +
             '<div class="temp">' + g.min + '° / ' + g.max + '°</div><div class="desc">' + esc(descrivi(g.codice)) + '</div></div>';
      }
      h += '</div>';
    } else {
      h += '<div class="vuoto">Meteo in arrivo...</div>';
    }
    if (dati.notizie.length) {
      h += '<div class="titoli">';
      for (var k = 0; k < Math.min(4, dati.notizie.length); k++) h += '<div class="t">' + esc(dati.notizie[k]) + '</div>';
      h += '</div>';
    }
    contenuto.innerHTML = h;
  }

  // Un elenco che si scorre con le frecce: si vedono al massimo otto righe.
  function elenco(righe, classe, aiuto){
    var VISIBILI = classe === 'notizia' ? 5 : 8;
    var da = Math.max(0, Math.min(scelta - 3, righe.length - VISIBILI));
    var h = '<div class="elenco">';
    for (var i = da; i < Math.min(righe.length, da + VISIBILI); i++) {
      h += '<div class="riga ' + (classe || '') + (i === scelta ? ' scelta' : '') + '">' + righe[i] + '</div>';
    }
    h += '</div><div class="aiuto">' + aiuto + '</div>';
    contenuto.innerHTML = h;
  }

  function radio(){
    if (!dati.radio.length) {
      contenuto.innerHTML = '<div class="vuoto">Cerco le radio...</div>';
      prendi('/api/radio', function(r){
        if (r) { dati.radio = r.stazioni; if (sezione === 'radio') radio(); }
        else if (sezione === 'radio') contenuto.innerHTML = '<div class="vuoto">Archivio delle radio non raggiungibile.</div>';
      });
      return;
    }
    var righe = [];
    for (var i = 0; i < dati.radio.length; i++) {
      righe.push((i === inOnda ? '<span class="suona">♪ </span>' : '') + esc(dati.radio[i].nome));
    }
    elenco(righe, '', 'Frecce per scegliere, OK per ascoltare, Stop per fermare');
  }

  function suona(i){
    var s = dati.radio[i];
    if (!s) return;
    if (inOnda === i) { ferma(); return; }
    inOnda = i;
    audio.src = '/flusso?u=' + encodeURIComponent(s.url);
    try { audio.play(); } catch (e) {}
    radio();
  }

  function ferma(){
    inOnda = -1;
    try { audio.pause(); } catch (e) {}
    audio.src = '';
    if (sezione === 'radio') radio();
  }

  function notizie(){
    if (!dati.notizie.length) { contenuto.innerHTML = '<div class="vuoto">Notizie in arrivo...</div>'; return; }
    var righe = [];
    for (var i = 0; i < dati.notizie.length; i++) righe.push(esc(dati.notizie[i]));
    elenco(righe, 'notizia', 'Notizie ANSA · frecce per scorrere');
  }

  // Le foto mandate dal telefono, una alla volta.
  function foto(){
    prendi('/api/foto', function(r){
      dati.foto = r ? r.foto : [];
      if (sezione !== 'foto') return;
      if (!dati.foto.length) {
        contenuto.innerHTML = '<div class="vuoto">Nessuna foto. Mandale dal telefono, scheda Manda alla TV:<br>' +
          'restano qui per un giorno.</div>';
        return;
      }
      fotoIndice = fotoIndice % dati.foto.length;
      contenuto.innerHTML = '<div id="foto"><img id="foto-img" src="' + dati.foto[fotoIndice].url + '"></div>' +
        '<div class="aiuto">Frecce per sfogliare · cambiano da sole ogni 12 secondi</div>';
    });
  }

  function sfoglia(passo){
    if (!dati.foto.length) return;
    fotoIndice = (fotoIndice + passo + dati.foto.length) % dati.foto.length;
    var img = $('foto-img');
    if (img) img.src = dati.foto[fotoIndice].url;
  }

  // Il 3D: la pagina diventa un immagine "lato a lato". Sulla TV si preme
  // 3D e si sceglie lato a lato; un tasto colorato riporta alla pagina.
  function tre(){
    var tela = document.createElement('canvas');
    tela.width = 1280; tela.height = 720;
    tela.style.cssText = 'position:absolute;left:0;top:0;z-index:5;background:#000;';
    tela.id = 'tela3d';
    document.body.appendChild(tela);
    var g = tela.getContext('2d');
    var stelle = [];
    for (var s = 0; s < 120; s++) stelle.push([Math.random() * 640, Math.random() * 720, Math.random() * 2 + 1]);
    var cose = [
      { t: 'LG 3D', y: 250, size: 110, p: -8, c: '#5aa0ff' },
      { t: 'premi 3D, poi lato a lato', y: 380, size: 34, p: -4, c: '#cfd6df' },
      { t: 'fuori dallo schermo!', y: 540, size: 70, p: 10, c: '#ff6b5e' },
      { t: 'tasto colorato per uscire', y: 660, size: 22, p: 0, c: '#7d858f' }
    ];
    for (var occhio = 0; occhio < 2; occhio++) {
      var ox = occhio * 640;
      g.save();
      g.beginPath(); g.rect(ox, 0, 640, 720); g.clip();
      g.fillStyle = '#04060a'; g.fillRect(ox, 0, 640, 720);
      g.fillStyle = '#ffffff';
      for (var k = 0; k < stelle.length; k++) g.fillRect(ox + stelle[k][0] + (occhio ? 3 : -3), stelle[k][1], stelle[k][2], stelle[k][2]);
      for (var i = 0; i < cose.length; i++) {
        var o = cose[i];
        var d = (occhio === 0 ? o.p : -o.p) / 2;
        g.save();
        g.translate(ox + 320 + d, o.y);
        g.scale(0.5, 1);
        g.fillStyle = o.c;
        g.font = o.size + 'px sans-serif';
        g.textAlign = 'center';
        g.fillText(o.t, 0, 0);
        g.restore();
      }
      g.restore();
    }
  }

  function togliTre(){
    var t = $('tela3d');
    if (t) t.parentNode.removeChild(t);
  }

  var SEZIONI = { home: home, radio: radio, notizie: notizie, foto: foto, tre: tre };

  function vai(nome){
    togliTre();
    if (fotoTimer) { clearInterval(fotoTimer); fotoTimer = null; }
    sezione = nome;
    scelta = 0;
    var voci = document.getElementById('piede').getElementsByTagName('span');
    for (var i = 0; i < voci.length; i++) {
      voci[i].className = 'voce-menu' + (voci[i].getAttribute('data-sezione') === nome ? ' attiva' : '');
    }
    SEZIONI[nome]();
    if (nome === 'foto') fotoTimer = setInterval(function(){ sfoglia(1); }, 12000);
  }

  function ridisegna(){ if (SEZIONI[sezione] && sezione !== 'tre' && sezione !== 'foto') SEZIONI[sezione](); }

  // ---------- telecomando ----------

  document.addEventListener('keydown', function(ev){
    var c = ev.keyCode;
    var gestito = true;
    if (c === K.rosso || c === 49) vai('radio');
    else if (c === K.verde || c === 50) vai('notizie');
    else if (c === K.giallo || c === 51) vai('foto');
    else if (c === K.blu || c === 52) vai('tre');
    else if (c === 48) vai('home');
    else if (c === K.stop) ferma();
    else if (sezione === 'radio' || sezione === 'notizie') {
      var n = sezione === 'radio' ? dati.radio.length : dati.notizie.length;
      if (c === K.giu && scelta < n - 1) { scelta++; ridisegna(); }
      else if (c === K.su && scelta > 0) { scelta--; ridisegna(); }
      else if (c === K.ok && sezione === 'radio') suona(scelta);
      else gestito = false;
    }
    else if (sezione === 'foto' && (c === K.dx || c === K.sx)) sfoglia(c === K.dx ? 1 : -1);
    else gestito = false;
    if (gestito && ev.preventDefault) ev.preventDefault();
  }, false);

  // Con il puntatore del telecomando Magic Motion si tocca il menu in basso.
  var voci = document.getElementById('piede').getElementsByTagName('span');
  for (var v = 0; v < voci.length; v++) {
    (function(el){ el.onclick = function(){ vai(el.getAttribute('data-sezione')); }; })(voci[v]);
  }

  orologio();
  setInterval(orologio, 10000);
  carica();
  setInterval(carica, 15 * 60000);
  vai('home');
})();
