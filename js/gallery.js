// Foto e sfondi presi dalla galleria del tablet.
//
// Si scelgono con il tasto Aggiungi foto: il tablet apre la sua galleria,
// le immagini vengono ridotte a una misura adatta allo schermo e salvate
// dentro il tablet. Niente computer, niente GitHub.
//
// Restano su questo tablet: sono pesanti, e farle viaggiare fino all altro
// consumerebbe rete e spazio senza motivo.

var DB = 'domapp-gallery';
var STORE = 'images';
var MAX_SIDE = 1920;

var db = null;
var urls = {};

function open(){
  if (db) return Promise.resolve(db);
  return new Promise(function(resolve, reject){
    var req = indexedDB.open(DB, 1);
    req.onupgradeneeded = function(){
      var d = req.result;
      if (!d.objectStoreNames.contains(STORE)) {
        var st = d.createObjectStore(STORE, { keyPath: 'id' });
        st.createIndex('kind', 'kind');
      }
    };
    req.onsuccess = function(){ db = req.result; resolve(db); };
    req.onerror = function(){ reject(req.error); };
  });
}

function store(mode){
  return open().then(function(d){ return d.transaction(STORE, mode).objectStore(STORE); });
}

// Riduce un immagine alla misura dello schermo. Una foto del telefono pesa
// anche dieci volte piu del necessario, e il tablet vecchio fatica a
// sfogliarle a piena risoluzione.
function shrink(file){
  return new Promise(function(resolve, reject){
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function(){
      var w = img.naturalWidth, h = img.naturalHeight;
      var scala = Math.min(1, MAX_SIDE / Math.max(w, h));
      var c = document.createElement('canvas');
      c.width = Math.round(w * scala);
      c.height = Math.round(h * scala);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(function(blob){
        if (blob) resolve(blob); else reject(new Error('conversione non riuscita'));
      }, 'image/jpeg', 0.84);
    };
    img.onerror = function(){
      URL.revokeObjectURL(url);
      reject(new Error('immagine non leggibile'));
    };
    img.src = url;
  });
}

// Aggiunge le immagini scelte. kind vale photo oppure wallpaper.
// Restituisce quante ne ha salvate e quante ha dovuto scartare.
export function addFiles(files, kind){
  var lista = [];
  for (var i = 0; i < files.length; i++) lista.push(files[i]);

  var salvate = 0, scartate = 0;

  function prossima(){
    if (!lista.length) return Promise.resolve({ salvate: salvate, scartate: scartate });
    var f = lista.shift();
    if (!/^image\//.test(f.type)) { scartate++; return prossima(); }

    return shrink(f).then(function(blob){
      return store('readwrite').then(function(st){
        return new Promise(function(res){
          var r = st.add({
            id: 'g' + Date.now().toString(36) + Math.floor(Math.random() * 100000).toString(36),
            kind: kind,
            name: f.name || '',
            at: Date.now(),
            blob: blob
          });
          r.onsuccess = function(){ salvate++; res(); };
          r.onerror = function(){ scartate++; res(); };
        });
      });
    }, function(){ scartate++; }).then(prossima);
  }

  return prossima();
}

export function list(kind){
  return store('readonly').then(function(st){
    return new Promise(function(resolve){
      var out = [];
      var req = st.index('kind').openCursor(IDBKeyRange.only(kind));
      req.onsuccess = function(){
        var c = req.result;
        if (!c) { resolve(out); return; }
        out.push(c.value);
        c.continue();
      };
      req.onerror = function(){ resolve(out); };
    });
  }).catch(function(){ return []; });
}

export function remove(id){
  if (urls[id]) { URL.revokeObjectURL(urls[id]); delete urls[id]; }
  return store('readwrite').then(function(st){
    return new Promise(function(resolve){
      var r = st.delete(id);
      r.onsuccess = function(){ resolve(true); };
      r.onerror = function(){ resolve(false); };
    });
  });
}

// Indirizzo da usare in un immagine o come sfondo. Viene creato una volta
// sola per ogni foto, per non riempire la memoria del tablet.
export function urlFor(record){
  if (!urls[record.id]) urls[record.id] = URL.createObjectURL(record.blob);
  return urls[record.id];
}

export function get(id){
  return store('readonly').then(function(st){
    return new Promise(function(resolve){
      var r = st.get(id);
      r.onsuccess = function(){ resolve(r.result || null); };
      r.onerror = function(){ resolve(null); };
    });
  }).catch(function(){ return null; });
}

// Apre la galleria del tablet e aggiunge cio che viene scelto.
export function pickAndAdd(kind, multiple){
  return new Promise(function(resolve){
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (multiple) input.multiple = true;
    input.style.display = 'none';
    input.addEventListener('change', function(){
      var files = input.files;
      document.body.removeChild(input);
      if (!files || !files.length) { resolve({ salvate: 0, scartate: 0 }); return; }
      addFiles(files, kind).then(resolve);
    });
    document.body.appendChild(input);
    input.click();
  });
}
