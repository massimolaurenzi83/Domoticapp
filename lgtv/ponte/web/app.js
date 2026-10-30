// App per la TV LG, sul telefono o sul tablet.
//
// Parla solo con il ponte, sulla rete di casa: e il ponte che manda i tasti
// alla TV e le passa foto, musica e video. Scritta senza novita recenti di
// JavaScript, cosi funziona anche sul tablet vecchio con Chrome 95.

(function(){
  var stato = null;
  var corpo = document.getElementById('corpo');
  var FAV = 'tvlg.radio.preferite.v1';

  // ---------- comunicazione con il ponte ----------

  function api(percorso, dati){
    var opz = dati === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dati)
    };
    return fetch(percorso, opz).then(function(r){ return r.json(); })
      .catch(function(){ return { ok: false, errore: 'il ponte non risponde: è acceso?' }; });
  }

  var avvisoTimer = null;
  function avviso(testo, male){
    var el = document.getElementById('avviso');
    el.textContent = testo;
    el.className = male ? 'male' : '';
    el.hidden = false;
    if (avvisoTimer) clearTimeout(avvisoTimer);
    avvisoTimer = setTimeout(function(){ el.hidden = true; }, male ? 6000 : 2500);
  }

  function esito(r, bene){
    if (r && r.ok) { if (bene) avviso(bene); return true; }
    avviso((r && r.errore) || 'non riuscito', true);
    return false;
  }

  function tasto(nome){
    if (navigator.vibrate) navigator.vibrate(12);
    return api('/api/tasto', { tasto: nome }).then(function(r){ esito(r); return r; });
  }

  function aggiornaStato(){
    return api('/api/stato').then(function(s){
      if (!s || s.ok === false) { document.getElementById('stato').textContent = 'ponte non raggiungibile'; return s; }
      stato = s;
      var t = s.tv;
      document.getElementById('stato').textContent = !t.host ? 'TV da cercare'
        : (t.collegata ? (s.dlna ? s.dlna.nome.replace(/^\[TV\]/, '') : 'TV collegata') : 'TV da collegare');
      return s;
    });
  }

  // ---------- piccoli aiuti per disegnare ----------

  function el(tag, cls, testo){
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (testo !== undefined) e.textContent = testo;
    return e;
  }

  function bottone(testo, fn, cls, sotto){
    var b = el('button', 'b' + (cls ? ' ' + cls : ''), testo);
    b.type = 'button';
    if (sotto) b.appendChild(el('small', '', sotto));
    b.addEventListener('click', fn);
    return b;
  }

  function tastoB(nome, testo, cls){ return bottone(testo, function(){ tasto(nome); }, cls); }

  function griglia(cls, figli){
    var g = el('div', 'griglia' + (cls ? ' ' + cls : ''));
    figli.forEach(function(f){ if (f) g.appendChild(f); });
    return g;
  }

  function haTasto(nome){
    if (!stato) return true;
    return stato.tasti.some(function(t){ return t.nome === nome; });
  }

  // ---------- telecomando ----------

  function telecomando(){
    corpo.innerHTML = '';
    if (stato && !stato.tv.collegata) {
      corpo.appendChild(el('p', 'nota', 'La TV non è ancora collegata: apri la scheda Collega, ci vuole un minuto.'));
    }

    corpo.appendChild(griglia('', [
      tastoB('spegni', 'Spegni', 'spento'),
      tastoB('muto', 'Muto'),
      tastoB('volGiu', 'Vol −'),
      tastoB('volSu', 'Vol +')
    ]));

    // Ingressi, con i nomi che hai dato tu: HDMI 1 e la Fire Stick, e cosi via.
    corpo.appendChild(el('h2', '', 'Ingresso'));
    var nomi = (stato && stato.ingressi) || {};
    var ingressi = [['inTv', 'TV'], ['inHdmi1', 'HDMI 1'], ['inHdmi2', 'HDMI 2'], ['inHdmi3', 'HDMI 3'], ['inHdmi4', 'HDMI 4']]
      .filter(function(x){ return haTasto(x[0]); })
      .map(function(x){ return bottone(x[1], function(){ tasto(x[0]); }, '', nomi[x[0]] || ''); });
    ingressi.push(tastoB('ingresso', 'Altri'));
    corpo.appendChild(griglia('tre', ingressi));

    corpo.appendChild(el('h2', '', 'Muoversi'));
    corpo.appendChild(tavoletta());
    var croce = el('div', 'croce');
    croce.style.marginTop = '8px';
    [tastoB('indietro', 'Indietro'), tastoB('su', 'Su'), tastoB('home', 'Home'),
     tastoB('sinistra', 'Sinistra'), tastoB('ok', 'OK', 'ok'), tastoB('destra', 'Destra'),
     tastoB('esci', 'Esci'), tastoB('giu', 'Giù'), tastoB('info', 'Info')].forEach(function(b){ croce.appendChild(b); });
    corpo.appendChild(croce);

    corpo.appendChild(el('h2', '', 'Canali'));
    corpo.appendChild(tastierino());
    corpo.appendChild(griglia('', [
      tastoB('canaleGiu', 'CH −'), tastoB('canaleSu', 'CH +'),
      tastoB('precedente', 'Precedente'), tastoB('guida', 'Guida')
    ]));
    corpo.appendChild(griglia('', [
      tastoB('lista', 'Lista'), tastoB('preferiti', 'Preferiti'),
      tastoB('televideo', 'Televideo'), tastoB('sottotitoli', 'Sottotitoli')
    ]));

    corpo.appendChild(el('h2', '', 'Riproduzione'));
    corpo.appendChild(griglia('', [
      tastoB('indietroVeloce', '«'), tastoB('play', 'Play', 'forte'), tastoB('pausa', 'Pausa'), tastoB('avanti', '»')
    ]));
    corpo.appendChild(griglia('', [
      tastoB('stop', 'Stop'), tastoB('tre', '3D', 'forte'), null, null
    ]));

    corpo.appendChild(el('h2', '', 'Spegnimento programmato'));
    var alle = stato && stato.spegnimento;
    corpo.appendChild(el('p', 'nota', alle
      ? 'La TV si spegne alle ' + new Date(alle).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) + '. Lo fa il ponte: il telefono può restare spento.'
      : 'Nessuno spegnimento programmato.'));
    function spegniFra(m){
      api('/api/spegnimento', { minuti: m }).then(function(r){
        if (esito(r, m ? 'Spengo fra ' + m + ' minuti' : 'Annullato')) aggiornaStato().then(telecomando);
      });
    }
    corpo.appendChild(griglia('', [
      bottone('15 min', function(){ spegniFra(15); }), bottone('30 min', function(){ spegniFra(30); }),
      bottone('1 ora', function(){ spegniFra(60); }), bottone('2 ore', function(){ spegniFra(120); })
    ]));
    if (alle) corpo.appendChild(griglia('due', [bottone('Annulla', function(){ spegniFra(0); }), null]));

    corpo.appendChild(el('h2', '', 'Tasti colorati'));
    corpo.appendChild(griglia('', [
      tastoB('rosso', ' ', 'rosso'), tastoB('verde', ' ', 'verde'), tastoB('giallo', ' ', 'giallo'), tastoB('blu', ' ', 'blu')
    ]));

    // I menu della TV: da li si cambiano le impostazioni, come con il
    // telecomando vero. L app non lo fa mai da sola: restano nascosti.
    corpo.appendChild(el('h2', '', 'Menu della TV'));
    var menu = el('div');
    menu.appendChild(bottone('Mostra i tasti dei menu', function(){
      menu.innerHTML = '';
      menu.appendChild(el('p', 'nota', 'Dai menu si cambiano le impostazioni della TV. L’app non lo fa mai da sola: ' +
        'quello che cambi lì lo cambi tu, come con il telecomando vero.'));
      menu.appendChild(griglia('due', [haTasto('menu') ? tastoB('menu', 'Menu') : null, tastoB('qmenu', 'Q.Menu')]));
    }));
    corpo.appendChild(menu);
  }

  // Si scorre come su un trackpad: ogni passo e una freccia. Un tocco e OK.
  function tavoletta(){
    var t = el('div', 'tavoletta', 'Scorri per muoverti nei menu della TV, tocca per OK');
    var x0 = 0, y0 = 0, mosso = false;
    var PASSO = 45;
    t.addEventListener('touchstart', function(ev){
      var p = ev.touches[0]; x0 = p.clientX; y0 = p.clientY; mosso = false;
      t.className = 'tavoletta tocco';
    }, { passive: true });
    t.addEventListener('touchmove', function(ev){
      var p = ev.touches[0];
      var dx = p.clientX - x0, dy = p.clientY - y0;
      if (Math.abs(dx) < PASSO && Math.abs(dy) < PASSO) return;
      mosso = true;
      if (Math.abs(dx) > Math.abs(dy)) tasto(dx > 0 ? 'destra' : 'sinistra');
      else tasto(dy > 0 ? 'giu' : 'su');
      x0 = p.clientX; y0 = p.clientY;
    }, { passive: true });
    t.addEventListener('touchend', function(){
      t.className = 'tavoletta';
      if (!mosso) tasto('ok');
    });
    return t;
  }

  function tastierino(){
    var box = el('div');
    var riga = el('div', 'riga');
    var campo = el('input', 'campo');
    campo.type = 'tel';
    campo.placeholder = 'Numero del canale, per esempio 21';
    function vai(){
      var n = campo.value.replace(/\D/g, '');
      if (!n) return;
      api('/api/canale', { numero: n }).then(function(r){ esito(r, 'Canale ' + n); });
      campo.value = '';
    }
    campo.addEventListener('keydown', function(ev){ if (ev.key === 'Enter') vai(); });
    riga.appendChild(campo);
    riga.appendChild(bottone('Vai', vai, 'forte'));
    box.appendChild(riga);

    // I canali che si guardano di piu, a un tocco.
    var rapidi = [['1', 'Rai 1'], ['2', 'Rai 2'], ['3', 'Rai 3'], ['4', 'Rete 4'], ['5', 'Canale 5'], ['6', 'Italia 1'],
                  ['7', 'La7'], ['8', 'TV8'], ['9', 'Nove']];
    var g = griglia('tre', rapidi.map(function(c){
      return bottone(c[1], function(){ api('/api/canale', { numero: c[0] }).then(function(r){ esito(r); }); }, '', c[0]);
    }));
    g.style.marginTop = '8px';
    box.appendChild(g);
    return box;
  }

  // ---------- manda alla TV ----------

  // Riduce una foto alla misura della TV: 1920 per 1080. Piu grande non si
  // vede meglio, e la TV del 2011 la apre piu lentamente.
  function riduci(file, lato){
    return new Promise(function(resolve, reject){
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function(){
        var s = Math.min(1, (lato || 1920) / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * s);
        c.height = Math.round(img.naturalHeight * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function(b){ b ? resolve(b) : reject(new Error('foto non leggibile')); }, 'image/jpeg', 0.88);
      };
      img.onerror = function(){ URL.revokeObjectURL(url); reject(new Error('foto non leggibile')); };
      img.src = url;
    });
  }

  // Invio con l avanzamento, perche un video pesa e ci mette un po.
  function invia(blob, nome, barra, solo){
    return new Promise(function(resolve){
      var x = new XMLHttpRequest();
      x.open('POST', '/api/manda' + (solo ? '?solo=1' : ''));
      x.setRequestHeader('Content-Type', blob.type || 'application/octet-stream');
      x.setRequestHeader('X-Nome', encodeURIComponent(nome || 'file'));
      if (barra) x.upload.onprogress = function(e){ if (e.lengthComputable) barra.style.width = Math.round(e.loaded / e.total * 100) + '%'; };
      x.onload = function(){ try { resolve(JSON.parse(x.responseText)); } catch (e) { resolve({ ok: false, errore: 'risposta strana dal ponte' }); } };
      x.onerror = function(){ resolve({ ok: false, errore: 'il ponte non risponde' }); };
      x.send(blob);
    });
  }

  var presentazione = null;

  function manda(){
    corpo.innerHTML = '';
    corpo.appendChild(el('p', 'nota', 'Foto, musica e video passano dal telefono alla TV attraverso la rete di casa, ' +
      'senza Chromecast. La TV del 2011 legge foto JPEG, musica MP3 e video MP4, MKV e AVI.'));

    var barra = el('div', 'barra'); var riempi = el('div'); barra.appendChild(riempi);

    corpo.appendChild(el('h2', '', 'Foto'));
    var secondi = 8;
    corpo.appendChild(griglia('due', [
      scegliFile('Una foto', 'image/*', false, function(files){
        fermaPresentazione();
        riduci(files[0]).then(function(b){ return invia(b, files[0].name, riempi); })
          .then(function(r){ esito(r, 'Foto sulla TV'); }, function(e){ avviso(e.message, true); });
      }),
      scegliFile('Presentazione', 'image/*', true, function(files){
        fermaPresentazione();
        var lista = Array.prototype.slice.call(files);
        var i = 0;
        avviso('Presentazione di ' + lista.length + ' foto, una ogni ' + secondi + ' secondi. Tieni aperta questa pagina.');
        function prossima(){
          var f = lista[i++ % lista.length];
          riduci(f).then(function(b){ return invia(b, f.name, riempi); }).then(function(r){
            if (!r.ok) { esito(r); fermaPresentazione(); }
          });
        }
        prossima();
        presentazione = setInterval(prossima, secondi * 1000);
      })
    ]));

    corpo.appendChild(el('h2', '', 'Video e musica'));
    corpo.appendChild(griglia('due', [
      scegliFile('Un video', 'video/*', false, function(files){
        fermaPresentazione();
        avviso('Invio il video, ci vuole un po’...');
        invia(files[0], files[0].name, riempi).then(function(r){ esito(r, 'Video sulla TV'); });
      }),
      scegliFile('Musica', 'audio/*', false, function(files){
        fermaPresentazione();
        invia(files[0], files[0].name, riempi).then(function(r){ esito(r, 'Musica sulla TV'); });
      })
    ]));
    corpo.appendChild(barra);

    corpo.appendChild(el('h2', '', 'Comandi'));
    corpo.appendChild(griglia('tre', [
      bottone('Play', function(){ api('/api/media', { azione: 'play' }).then(function(r){ esito(r); }); }, 'forte'),
      bottone('Pausa', function(){ api('/api/media', { azione: 'pausa' }).then(function(r){ esito(r); }); }),
      bottone('Stop', function(){ fermaPresentazione(); api('/api/media', { azione: 'stop' }).then(function(r){ esito(r); }); })
    ]));
  }

  function fermaPresentazione(){
    if (presentazione) { clearInterval(presentazione); presentazione = null; }
  }

  function scegliFile(testo, accetta, multipli, fn){
    return bottone(testo, function(){
      var i = document.createElement('input');
      i.type = 'file';
      i.accept = accetta;
      i.multiple = !!multipli;
      i.addEventListener('change', function(){ if (i.files && i.files.length) fn(i.files); });
      i.click();
    });
  }

  // ---------- radio ----------

  function preferite(){
    try { return JSON.parse(localStorage.getItem(FAV) || '[]'); } catch (e) { return []; }
  }

  function radio(){
    corpo.innerHTML = '';
    corpo.appendChild(el('p', 'nota', 'La radio suona dalle casse della TV. Il ponte la riceve da internet e la passa alla TV, ' +
      'che da sola non apre più i siti protetti di oggi. Tieni premuto su una stazione per metterla fra le preferite.'));
    var riga = el('div', 'riga');
    var campo = el('input', 'campo');
    campo.placeholder = 'Cerca una stazione';
    riga.appendChild(campo);
    riga.appendChild(bottone('Cerca', function(){ carica(campo.value.trim()); }, 'forte'));
    campo.addEventListener('keydown', function(ev){ if (ev.key === 'Enter') carica(campo.value.trim()); });
    corpo.appendChild(riga);
    corpo.appendChild(griglia('due', [
      bottone('Ferma', function(){ api('/api/media', { azione: 'stop' }).then(function(r){ esito(r, 'Radio ferma'); }); }),
      bottone('Preferite', function(){ mostra(preferite(), 'Nessuna preferita: tieni premuto su una stazione.'); })
    ]));
    var lista = el('div', 'elenco');
    lista.style.marginTop = '10px';
    corpo.appendChild(lista);

    function mostra(stazioni, vuoto){
      lista.innerHTML = '';
      if (!stazioni.length) { lista.appendChild(el('p', 'nota', vuoto)); return; }
      var pref = preferite();
      stazioni.forEach(function(s){
        var v = el('div', 'voce');
        v.appendChild(el('div', 'nome', s.nome));
        if (pref.some(function(p){ return p.url === s.url; })) v.appendChild(el('div', 'dim', '★'));
        v.addEventListener('click', function(){
          api('/api/manda-url', { url: s.url, tipo: 'audio/mpeg', titolo: s.nome }).then(function(r){ esito(r, s.nome + ' sulla TV'); });
        });
        var premuto = null;
        v.addEventListener('touchstart', function(){ premuto = setTimeout(function(){ preferisci(s); mostra(stazioni, vuoto); }, 650); }, { passive: true });
        v.addEventListener('touchend', function(){ clearTimeout(premuto); });
        v.addEventListener('contextmenu', function(ev){ ev.preventDefault(); preferisci(s); mostra(stazioni, vuoto); });
        lista.appendChild(v);
      });
    }

    function carica(q){
      lista.innerHTML = '';
      lista.appendChild(el('p', 'nota', 'Cerco...'));
      api('/api/radio?q=' + encodeURIComponent(q || '')).then(function(r){
        if (!r.ok) { lista.innerHTML = ''; lista.appendChild(el('p', 'nota', r.errore)); return; }
        mostra(r.stazioni, 'Nessuna stazione con questo nome.');
      });
    }

    var pref = preferite();
    if (pref.length) mostra(pref, ''); else carica('');
  }

  function preferisci(s){
    var l = preferite();
    var i = -1;
    l.forEach(function(p, k){ if (p.url === s.url) i = k; });
    if (i === -1) { l.push({ nome: s.nome, url: s.url }); avviso('Aggiunta alle preferite'); }
    else { l.splice(i, 1); avviso('Tolta dalle preferite'); }
    try { localStorage.setItem(FAV, JSON.stringify(l)); } catch (e) {}
  }

  // ---------- 3D ----------
  //
  // La TV e una LG Cinema 3D: con gli occhiali passivi mostra in 3D le
  // immagini "lato a lato", due fotografie affiancate, una per occhio. Il
  // telefono le prepara e le manda; sulla TV si preme 3D e si sceglie lato
  // a lato. E un modo di visione: lo stesso tasto lo toglie.

  function tre(){
    corpo.innerHTML = '';
    corpo.appendChild(el('p', 'nota', 'Dopo l’invio premi 3D qui sotto o sul telecomando LG, scegli Lato a lato e metti gli ' +
      'occhiali. Per tornare normale premi di nuovo 3D.'));
    corpo.appendChild(griglia('due', [tastoB('tre', 'Tasto 3D', 'forte'), tastoB('ok', 'OK')]));

    corpo.appendChild(el('h2', '', 'Prova del 3D'));
    corpo.appendChild(el('p', 'nota', 'Un’immagine fatta apposta: scritte e cerchi a profondità diverse, alcuni dentro lo schermo e uno che ne esce.'));
    var tela = el('canvas', 'anteprima');
    tela.width = 1920; tela.height = 1080;
    disegnaProva(tela);
    corpo.appendChild(tela);
    corpo.appendChild(griglia('due', [bottone('Manda la prova alla TV', function(){
      tela.toBlob(function(b){ invia(b, 'Prova 3D.jpg').then(function(r){ esito(r, 'Ora premi 3D e scegli Lato a lato'); }); }, 'image/jpeg', 0.92);
    }, 'forte'), null]));

    corpo.appendChild(el('h2', '', 'Le tue foto in 3D'));
    corpo.appendChild(el('p', 'nota', 'Fai due foto dello stesso soggetto fermo: la prima, poi sposta il telefono di 6 o 7 ' +
      'centimetri verso destra, senza girarlo, e fai la seconda. Scegli qui sotto prima la sinistra, poi la destra.'));
    var coppia = [null, null];
    var anteprima = el('canvas', 'anteprima');
    anteprima.width = 1920; anteprima.height = 1080;
    anteprima.hidden = true;
    var mandaCoppia = bottone('Manda alla TV', function(){
      anteprima.toBlob(function(b){ invia(b, 'Foto 3D.jpg').then(function(r){ esito(r, 'Ora premi 3D e scegli Lato a lato'); }); }, 'image/jpeg', 0.92);
    }, 'forte');
    mandaCoppia.disabled = true;
    function aggiorna(){
      if (!coppia[0] || !coppia[1]) return;
      affianca(anteprima, coppia[0], coppia[1]);
      anteprima.hidden = false;
      mandaCoppia.disabled = false;
    }
    corpo.appendChild(griglia('due', [
      scegliFile('Foto sinistra', 'image/*', false, function(f){ carica(f[0], function(img){ coppia[0] = img; aggiorna(); }); }),
      scegliFile('Foto destra', 'image/*', false, function(f){ carica(f[0], function(img){ coppia[1] = img; aggiorna(); }); })
    ]));
    corpo.appendChild(anteprima);
    corpo.appendChild(griglia('due', [mandaCoppia, null]));

    corpo.appendChild(el('h2', '', 'Qualsiasi foto o video in 3D'));
    corpo.appendChild(el('p', 'nota', 'La TV sa anche trasformare da sola un’immagine normale in 3D: manda una foto o un ' +
      'video dalla scheda Manda alla TV, poi premi 3D e scegli 2D→3D. L’effetto è più leggero di una vera foto 3D, ma funziona con tutto.'));
  }

  function carica(file, fn){
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function(){ fn(img); };
    img.onerror = function(){ avviso('Foto non leggibile', true); };
    img.src = url;
  }

  // Ogni foto occupa meta larghezza, schiacciata: la TV la riallarga.
  function affianca(tela, sx, dx){
    var g = tela.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 1920, 1080);
    [sx, dx].forEach(function(img, i){
      var s = Math.max(1920 / img.naturalWidth, 1080 / img.naturalHeight);
      var w = img.naturalWidth * s, h = img.naturalHeight * s;
      g.save();
      g.beginPath(); g.rect(i * 960, 0, 960, 1080); g.clip();
      g.drawImage(img, i * 960 + (960 - w / 2) / 2, (1080 - h) / 2, w / 2, h);
      g.restore();
    });
  }

  // La prova: ogni oggetto e disegnato due volte, spostato di poco fra un
  // occhio e l altro. Lo spostamento decide la profondita: verso l esterno
  // va dentro lo schermo, verso l interno ne esce.
  function disegnaProva(tela){
    var g = tela.getContext('2d');
    var oggetti = [
      { tipo: 'stelle' },
      { tipo: 'testo', testo: 'LG 3D', x: 480, y: 330, size: 150, sposta: -12, colore: '#5aa0ff' },
      { tipo: 'cerchio', x: 200, y: 700, r: 90, sposta: -6, colore: '#3fa45b' },
      { tipo: 'cerchio', x: 760, y: 720, r: 70, sposta: 4, colore: '#f0b429' },
      { tipo: 'testo', testo: 'dentro lo schermo', x: 480, y: 540, size: 56, sposta: -8, colore: '#cfd6df' },
      { tipo: 'testo', testo: 'fuori!', x: 480, y: 900, size: 110, sposta: 14, colore: '#ff6b5e' }
    ];
    var semi = [];
    for (var i = 0; i < 160; i++) semi.push([Math.random() * 960, Math.random() * 1080, Math.random() * 2 + 0.5]);
    [0, 1].forEach(function(occhio){
      var ox = occhio * 960;
      g.save();
      g.beginPath(); g.rect(ox, 0, 960, 1080); g.clip();
      g.fillStyle = '#05070b'; g.fillRect(ox, 0, 960, 1080);
      oggetti.forEach(function(o){
        // L occhio sinistro vede l oggetto spostato a destra quando esce
        // dallo schermo, a sinistra quando sta dietro.
        var d = o.sposta ? (occhio === 0 ? o.sposta : -o.sposta) / 2 : 0;
        if (o.tipo === 'stelle') {
          g.fillStyle = '#ffffff';
          semi.forEach(function(s){ g.globalAlpha = 0.5; g.fillRect(ox + s[0] + (occhio ? 9 : -9) / 2, s[1], s[2], s[2]); });
          g.globalAlpha = 1;
        }
        if (o.tipo === 'cerchio') {
          // Schiacciato come il resto: la TV lo riallarga e torna tondo.
          g.save(); g.translate(ox + o.x + d, o.y); g.scale(0.5, 1);
          g.fillStyle = o.colore; g.beginPath(); g.arc(0, 0, o.r, 0, Math.PI * 2); g.fill();
          g.restore();
        }
        if (o.tipo === 'testo') {
          g.fillStyle = o.colore; g.textAlign = 'center';
          g.font = '600 ' + o.size + 'px sans-serif';
          // Il testo va schiacciato come tutta l immagine.
          g.save(); g.translate(ox + o.x + d, o.y); g.scale(0.5, 1); g.fillText(o.testo, 0, 0); g.restore();
        }
      });
      g.restore();
    });
  }

  // ---------- collega ----------

  function collega(){
    corpo.innerHTML = '';
    var s = stato || { tv: {} };

    corpo.appendChild(el('h2', '', '1. Trova la TV'));
    corpo.appendChild(el('p', 'nota', s.tv.host
      ? 'TV trovata all’indirizzo ' + s.tv.host + (s.dlna ? ', ' + s.dlna.nome : '') + '.'
      : 'Accendi la TV, collegata alla stessa rete Wi-Fi o al cavo, e cercala.'));
    var risultati = el('div', 'elenco');
    corpo.appendChild(griglia('due', [bottone('Cerca la TV', function(){
      avviso('Cerco nella rete di casa...');
      api('/api/cerca', {}).then(function(r){
        risultati.innerHTML = '';
        if (!r.ok) { esito(r); return; }
        if (!r.trovate.length) { risultati.appendChild(el('p', 'nota', 'Nessuna LG trovata. Controlla che sia accesa, oppure scrivi l’indirizzo qui sotto: lo trovi nel menu Rete della TV.')); return; }
        stato = r.stato;
        r.trovate.forEach(function(t){
          var v = el('div', 'voce');
          v.appendChild(el('div', 'nome', t.nome + ' · ' + t.ip));
          v.addEventListener('click', function(){ api('/api/scegli', { descrizione: t.descrizione }).then(function(x){ if (esito(x, 'TV scelta')) { stato = x.stato; collega(); } }); });
          risultati.appendChild(v);
        });
        if (r.trovate.length === 1) { avviso('TV trovata'); collega(); }
      });
    }, 'forte'), null]));
    corpo.appendChild(risultati);
    var rigaIp = el('div', 'riga');
    rigaIp.style.marginTop = '8px';
    var ip = el('input', 'campo');
    ip.placeholder = 'Oppure l’indirizzo, per esempio 192.168.1.40';
    ip.inputMode = 'decimal';
    rigaIp.appendChild(ip);
    rigaIp.appendChild(bottone('Usa', function(){
      api('/api/indirizzo', { ip: ip.value }).then(function(r){ if (esito(r, 'Indirizzo salvato')) { stato = r.stato; collega(); } });
    }));
    corpo.appendChild(rigaIp);

    corpo.appendChild(el('h2', '', '2. Collega il telecomando'));
    corpo.appendChild(el('p', 'nota', s.tv.collegata ? 'Collegato. Il codice è salvato: non serve più.'
      : 'Tocca il primo tasto: sulla TV compare un codice di sei cifre. Scrivilo qui. Serve solo questa volta.'));
    var rigaCodice = el('div', 'riga');
    var codice = el('input', 'campo');
    codice.placeholder = 'Codice mostrato dalla TV';
    codice.type = 'tel';
    rigaCodice.appendChild(codice);
    rigaCodice.appendChild(bottone('Collega', function(){
      api('/api/collega', { codice: codice.value }).then(function(r){ if (esito(r, 'TV collegata')) { stato = r.stato; aggiornaStato(); collega(); } });
    }, 'forte'));
    corpo.appendChild(griglia('due', [bottone('Mostra il codice sulla TV', function(){
      api('/api/codice', {}).then(function(r){ esito(r, 'Guarda la TV: c’è il codice'); });
    }), null]));
    rigaCodice.style.marginTop = '8px';
    corpo.appendChild(rigaCodice);

    corpo.appendChild(el('h2', '', '3. Cosa c’è su ogni ingresso'));
    corpo.appendChild(el('p', 'nota', 'Per esempio Fire Stick e proiettore su HDMI 1, Chromecast su HDMI 2. Compaiono sotto i tasti degli ingressi.'));
    var campi = {};
    ['inHdmi1', 'inHdmi2', 'inHdmi3', 'inHdmi4'].forEach(function(k, i){
      var c = el('input', 'campo');
      c.placeholder = 'HDMI ' + (i + 1);
      c.value = (s.ingressi && s.ingressi[k]) || '';
      c.style.marginBottom = '6px';
      c.style.width = '100%';
      campi[k] = c;
      corpo.appendChild(c);
    });
    corpo.appendChild(griglia('due', [bottone('Salva i nomi', function(){
      var nomi = {};
      for (var k in campi) if (campi[k].value.trim()) nomi[k] = campi[k].value.trim();
      api('/api/ingressi', { ingressi: nomi }).then(function(r){ if (esito(r, 'Salvati')) aggiornaStato(); });
    }), null]));

    corpo.appendChild(el('h2', '', '4. Lo schermo sulla TV'));
    corpo.appendChild(el('p', 'nota', 'Nel browser della TV apri questo indirizzo e salvalo fra i preferiti: ora, meteo, ' +
      'notizie, radio e foto, da usare con il telecomando LG.'));
    corpo.appendChild(el('div', 'voce', (s.indirizzo || location.origin) + '/tv'));
    var rigaLuogo = el('div', 'riga');
    rigaLuogo.style.marginTop = '8px';
    var luogo = el('input', 'campo');
    luogo.placeholder = 'Città per il meteo, ora ' + (s.luogo || 'Roma');
    rigaLuogo.appendChild(luogo);
    rigaLuogo.appendChild(bottone('Salva', function(){
      api('/api/luogo', { nome: luogo.value }).then(function(r){ if (esito(r, 'Meteo di ' + r.luogo)) aggiornaStato(); });
    }));
    corpo.appendChild(rigaLuogo);
  }

  // ---------- schede ----------

  var SCHEDE = { telecomando: telecomando, manda: manda, radio: radio, tre: tre, collega: collega };
  var bottoni = document.getElementById('schede').getElementsByTagName('button');

  function apri(nome){
    for (var i = 0; i < bottoni.length; i++) {
      bottoni[i].className = bottoni[i].getAttribute('data-scheda') === nome ? 'attiva' : '';
    }
    SCHEDE[nome]();
    window.scrollTo(0, 0);
  }

  for (var i = 0; i < bottoni.length; i++) {
    (function(b){ b.addEventListener('click', function(){ apri(b.getAttribute('data-scheda')); }); })(bottoni[i]);
  }

  aggiornaStato().then(function(s){
    apri(s && s.tv && s.tv.collegata ? 'telecomando' : 'collega');
  });
})();
