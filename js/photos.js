// Cornice fotografica. Le immagini stanno nella cartella photos/ del
// repository e sono elencate in photos/manifest.json. Nessuna chiave,
// nessuna scadenza, caricamento immediato perche vengono dalla stessa
// origine della pagina.

var list = [];
var order = [];
var cursor = 0;

export function loadPhotos(){
  return fetch('photos/manifest.json', { cache: 'no-cache' })
    .then(function(r){ return r.ok ? r.json() : { photos: [] }; })
    .then(function(j){
      list = (j && j.photos) ? j.photos : [];
      reshuffle();
      return list.length;
    })
    .catch(function(){ list = []; return 0; });
}

function reshuffle(){
  order = [];
  for (var i = 0; i < list.length; i++) order.push(i);
  for (var j = order.length - 1; j > 0; j--) {
    var k = Math.floor(Math.random() * (j + 1));
    var t = order[j]; order[j] = order[k]; order[k] = t;
  }
  cursor = 0;
}

export function nextPhoto(){
  if (!list.length) return null;
  if (cursor >= order.length) reshuffle();
  var item = list[order[cursor++]];
  if (typeof item === 'string') return { src: 'photos/' + item, caption: '' };
  return { src: 'photos/' + item.file, caption: item.caption || '' };
}

export function photoCount(){ return list.length; }
