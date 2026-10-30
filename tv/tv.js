// Schermo di casa sulla TV.
//
// Gira sul Chromecast, dentro la presa HDMI del televisore, quando dal
// pannello si tocca Porta sulla TV. Non comanda niente e non cambia niente
// della TV: mostra soltanto quello che il tablet gli manda.
//
// Scritto alla vecchia maniera, senza moduli, perche i Chromecast piu
// vecchi hanno un browser datato.
//
// La TV di casa e una LG LCD della serie LW, che con le immagini ferme
// non si segna come un plasma. Restano lo stesso tre accortezze, che non
// costano niente:
//   - ora e meteo si spostano di poco ogni minuto;
//   - la pagina si chiude da sola dopo le ore scelte nelle impostazioni;
//   - si chiude all inizio delle ore di riposo e quando il tablet sparisce
//     da dieci minuti, cosi la TV non resta accesa per niente.
// Chiusa la pagina, il Chromecast torna alla sua schermata di sempre.

(function(){
  var NS = 'urn:x-cast:casa.tv';
  var SDK = 'https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js';
  var GIORNI = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];
  var MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio',
              'agosto','settembre','ottobre','novembre','dicembre'];

  var suChromecast = /CrKey/.test(navigator.userAgent);
  var prova = /[?&]prova=1/.test(location.search) || !suChromecast;

  var conf = { luogo: '', fuso: null, riposoDa: '00:30', riposoA: '06:30', secondiFoto: 25, oreMassime: 8 };
  var avviatoAlle = Date.now();
  var context = null;
  var chiusuraTimer = null;
  var avvisoTimer = null;
  var pezzi = {};
  var strato = 'a';
  var conFoto = false;
  var timer = [];
  var promemoria = [];
  var ultimoSpostamento = 0;
  var datiVeri = false;

  function $(id){ return document.getElementById(id); }
  function two(n){ return n < 10 ? '0' + n : String(n); }

  // L ora di casa, quella del tablet, anche se il Chromecast avesse un
  // fuso orario diverso.
  function adesso(){
    if (conf.fuso === null) return new Date();
    var qui = new Date().getTimezoneOffset();
    return new Date(Date.now() + (qui - conf.fuso) * 60000);
  }

  function minuti(hhmm){
    var p = String(hhmm || '00:00').split(':');
    return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
  }

  function inRiposo(d){
    var m = d.getHours() * 60 + d.getMinutes();
    var a = minuti(conf.riposoDa), b = minuti(conf.riposoA);
    if (a === b) return false;
    if (a < b) return m >= a && m < b;
    return m >= a || m < b;
  }

  // ---------- chiusura ----------

  function chiudi(perche){
    if (prova) { targhetta('Qui la pagina si chiuderebbe: ' + perche + '.'); return; }
    try { if (context) context.stop(); } catch (e) {}
  }

  function targhetta(testo){
    var t = $('targhetta');
    t.textContent = testo;
    t.hidden = !testo;
  }

  // ---------- battito ----------

  function battito(){
    var d = adesso();
    var ora = two(d.getHours()) + ':' + two(d.getMinutes());
    if ($('ora').textContent !== ora) $('ora').textContent = ora;
    var data = GIORNI[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()];
    if ($('data').textContent !== data) $('data').textContent = data;

    var riposo = inRiposo(d);
    if (riposo && !prova) { chiudi('ore di riposo'); return; }
    var classe = (conFoto ? '' : 'senza-foto') + (riposo ? ' riposo' : '');
    if (document.body.className !== classe) document.body.className = classe;
    if (Date.now() - avviatoAlle > conf.oreMassime * 3600000) { chiudi('raggiunte le ore massime'); return; }

    if (Date.now() - ultimoSpostamento > 60000) sposta();
    disegnaLato();
  }

  // Ogni minuto ora e meteo cambiano posto di poco. Senza foto vagano per
  // tutto lo schermo, come un salvaschermo.
  function sposta(){
    ultimoSpostamento = Date.now();
    var info = $('info');
    if (conFoto) {
      info.style.left = (6 + Math.random() * 5).toFixed(1) + '%';
      info.style.bottom = (8 + Math.random() * 4).toFixed(1) + '%';
    } else {
      // Con il riquadro di destra acceso, l ora resta nella meta sinistra.
      var spazio = $('lato').hidden ? 38 : 12;
      info.style.left = (8 + Math.random() * spazio).toFixed(1) + '%';
      info.style.bottom = (12 + Math.random() * 24).toFixed(1) + '%';
    }
  }

  // ---------- promemoria e timer, nel riquadro a destra ----------

  function disegnaLato(){
    var lato = $('lato');
    var html = [];
    var ora = Date.now();
    var attivi = timer.filter(function(t){ return t.fine > ora - 5000; });
    if (attivi.length) {
      html.push('<div class="titolo">Timer</div>');
      attivi.forEach(function(t){
        var s = Math.max(0, Math.round((t.fine - ora) / 1000));
        var testo = Math.floor(s / 60) + ':' + two(s % 60);
        html.push('<div class="voce">' + esc(t.nome) + ' <span class="quando">' + testo + '</span></div>');
      });
    }
    if (promemoria.length) {
      html.push('<div class="titolo">Prossimi promemoria</div>');
      promemoria.forEach(function(p){
        var d = new Date(p.quando + (conf.fuso === null ? 0 : (new Date().getTimezoneOffset() - conf.fuso) * 60000));
        html.push('<div class="voce">' + esc(p.testo) + '<div class="quando">' +
          two(d.getHours()) + ':' + two(d.getMinutes()) + '</div></div>');
      });
    }
    var nuovo = html.join('');
    if (lato.getAttribute('data-html') !== nuovo) {
      lato.setAttribute('data-html', nuovo);
      lato.innerHTML = nuovo;
    }
    var eraNascosto = lato.hidden;
    lato.hidden = !nuovo;
    if (eraNascosto !== lato.hidden) sposta();
  }

  function esc(t){
    return String(t || '').replace(/[&<>"]/g, function(c){
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---------- messaggi dal tablet ----------

  function ricevi(m, mittente){
    if (!m || typeof m !== 'object') return;
    try {
      if (m.tipo === 'impostazioni') impostazioni(m);
      else if (m.tipo === 'stato') stato(m);
      else if (m.tipo === 'foto') foto(m);
      else if (m.tipo === 'avviso') avviso(m.titolo, m.testo, m.secondi);
      else if (m.tipo === 'radio') radio(m, mittente);
      else if (m.tipo === 'radio-ferma') fermaRadio();
    } catch (e) {}
  }

  function impostazioni(m){
    if (typeof m.fuso === 'number') conf.fuso = m.fuso;
    if (m.riposoDa) conf.riposoDa = m.riposoDa;
    if (m.riposoA) conf.riposoA = m.riposoA;
    if (m.oreMassime) conf.oreMassime = Math.max(1, Math.min(24, m.oreMassime));
    if (m.secondiFoto) conf.secondiFoto = m.secondiFoto;
    conf.luogo = m.luogo || '';
  }

  function stato(m){
    var w = m.meteo;
    if (w) {
      var riga = w.temp + '° ' + (w.desc || '');
      if (w.min !== null && w.max !== null && w.min !== undefined) riga += '  ·  ' + w.min + '° / ' + w.max + '°';
      if (conf.luogo) riga += '  ·  ' + conf.luogo;
      $('meteo').textContent = riga;
    }
    promemoria = (m.promemoria || []).slice(0, 3);
    var ora = Date.now();
    timer = (m.timer || []).map(function(t){ return { nome: t.nome, fine: ora + t.restano * 1000 }; });
    disegnaLato();
  }

  // Le foto arrivano a pezzi: un messaggio non puo superare i 64 kilobyte.
  function foto(m){
    var p = pezzi[m.id];
    if (!p) {
      // Pezzi rimasti da una foto interrotta: si buttano.
      pezzi = {};
      p = pezzi[m.id] = { parti: m.parti, dati: [], arrivati: 0 };
    }
    if (p.dati[m.parte] === undefined) { p.dati[m.parte] = m.dati; p.arrivati++; }
    if (p.arrivati < p.parti) return;
    var url = p.dati.join('');
    delete pezzi[m.id];
    mostraFoto(url);
  }

  function mostraFoto(url){
    var entra = strato === 'a' ? 'b' : 'a';
    var elIn = $('foto-' + entra), elOut = $('foto-' + strato);
    var img = new Image();
    img.onload = function(){
      elIn.style.backgroundImage = 'url("' + url + '")';
      elIn.className = 'foto is-on';
      elOut.className = 'foto';
      strato = entra;
      if (!conFoto) { conFoto = true; sposta(); battito(); }
      // La foto vecchia si libera dopo la dissolvenza: la memoria del
      // Chromecast e poca.
      setTimeout(function(){ if (elOut.className === 'foto') elOut.style.backgroundImage = 'none'; }, 2500);
    };
    img.src = url;
  }

  // ---------- avvisi ----------

  function avviso(titolo, testo, secondi){
    $('avviso-titolo').textContent = titolo || '';
    $('avviso-testo').textContent = testo || '';
    $('avviso').hidden = false;
    $('stanza').className = 'con-avviso';
    suono();
    if (avvisoTimer) clearTimeout(avvisoTimer);
    avvisoTimer = setTimeout(function(){
      $('avviso').hidden = true;
      $('stanza').className = '';
    }, Math.max(5, secondi || 20) * 1000);
  }

  // Due note leggere, a volume basso: richiamano l attenzione senza
  // spaventare chi sta guardando un film.
  var ctxAudio = null;
  function suono(){
    // Nell anteprima sul tablet non suona: il tablet ha gia i suoi avvisi.
    if (prova) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!ctxAudio) ctxAudio = new AC();
      [0, 0.22].forEach(function(dopo, i){
        var o = ctxAudio.createOscillator(), g = ctxAudio.createGain();
        o.frequency.value = i ? 988 : 784;
        o.connect(g); g.connect(ctxAudio.destination);
        var t0 = ctxAudio.currentTime + dopo;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
        o.start(t0); o.stop(t0 + 0.55);
      });
    } catch (e) {}
  }

  // ---------- radio ----------

  function rispondi(mittente, msg){
    if (!context || !mittente) return;
    try { context.sendCustomMessage(NS, mittente, msg); } catch (e) {}
  }

  function radio(m, mittente){
    var a = $('audio');
    a.onplaying = function(){ rispondi(mittente, { tipo: 'radio-stato', stato: 'in onda sulla TV' }); };
    a.onerror = function(){ rispondi(mittente, { tipo: 'radio-stato', stato: 'la TV non riesce a suonare questa stazione' }); };
    a.src = m.url;
    var p = a.play();
    if (p && p.catch) p.catch(function(){ rispondi(mittente, { tipo: 'radio-stato', stato: 'la TV non riesce a suonare questa stazione' }); });
    $('radio').textContent = '♪ ' + (m.nome || 'Radio');
    $('radio').hidden = false;
  }

  function fermaRadio(){
    var a = $('audio');
    a.pause();
    a.removeAttribute('src');
    try { a.load(); } catch (e) {}
    $('radio').hidden = true;
  }

  // ---------- avvio ----------

  function avviaCast(){
    var s = document.createElement('script');
    s.src = SDK;
    s.onload = function(){
      try {
        var fw = cast.framework;
        context = fw.CastReceiverContext.getInstance();
        context.addCustomMessageListener(NS, function(ev){ ricevi(ev.data, ev.senderId); });
        context.addEventListener(fw.system.EventType.SENDER_CONNECTED, function(){
          if (chiusuraTimer) { clearTimeout(chiusuraTimer); chiusuraTimer = null; }
        });
        // Se il tablet sparisce, dopo dieci minuti si chiude: nessuna
        // immagine resta sulla TV per una notte intera.
        context.addEventListener(fw.system.EventType.SENDER_DISCONNECTED, function(){
          if (context.getSenders().length) return;
          if (chiusuraTimer) clearTimeout(chiusuraTimer);
          chiusuraTimer = setTimeout(function(){ chiudi('tablet scollegato'); }, 10 * 60000);
        });
        var opz = new fw.CastReceiverOptions();
        opz.disableIdleTimeout = true;
        opz.skipPlayersLoad = true;
        opz.statusText = 'Casa';
        opz.customNamespaces = {};
        opz.customNamespaces[NS] = fw.system.MessageType.JSON;
        context.start(opz);
      } catch (e) {
        targhetta('Avvio non riuscito: ' + (e && e.message ? e.message : 'errore'));
      }
    };
    s.onerror = function(){ targhetta('Non riesco a caricare il programma del Chromecast.'); };
    document.head.appendChild(s);
  }

  // Nell anteprima i dati sono finti finche il pannello non manda i suoi:
  // dentro la scheda TV arrivano gli stessi messaggi che riceve il
  // Chromecast.
  function avviaProva(){
    window.addEventListener('message', function(ev){
      if (ev.origin !== location.origin || !ev.data || !ev.data.casaTv) return;
      if (!datiVeri) {
        datiVeri = true;
        targhetta('Anteprima con i dati del pannello');
        promemoria = []; timer = [];
        $('meteo').textContent = '';
      }
      ricevi(ev.data.casaTv, null);
    });
    targhetta('Anteprima: così appare sulla TV');
    stato({ meteo: { temp: 18, desc: 'poco nuvoloso', min: 12, max: 21 },
            promemoria: [{ testo: 'Comprare il pane', quando: Date.now() + 3 * 3600000 }],
            timer: [{ nome: 'pasta', restano: 540 }] });
    fetch('../photos/manifest.json', { cache: 'no-cache' })
      .then(function(r){ return r.ok ? r.json() : { photos: [] }; })
      .then(function(j){
        var lista = (j && j.photos) || [];
        if (!lista.length) return;
        var i = 0;
        function prossima(){
          if (datiVeri) return;
          var it = lista[i++ % lista.length];
          mostraFoto('../photos/' + (typeof it === 'string' ? it : it.file));
        }
        prossima();
        setInterval(prossima, 8000);
      })
      .catch(function(){});
    setTimeout(function(){
      if (!datiVeri) avviso('Messaggio da Francesco', 'Torno alle otto, comincia pure a cenare.', 8);
    }, 4000);
  }

  document.body.className = 'senza-foto';
  sposta();
  battito();
  setInterval(battito, 1000);
  if (prova) avviaProva(); else avviaCast();
})();
