// Cornice fotografica.
//
// Le foto arrivano da due posti: quelle aggiunte dal tablet con il tasto
// Aggiungi foto, che sono le tue, e quelle eventualmente messe nella
// cartella photos del progetto. Si sfogliano tutte insieme in ordine
// casuale, senza ripetizioni finche non sono state viste tutte.

import { list as galleryList, urlFor } from './gallery.js';

var items = [];
var order = [];
var cursor = 0;

function repoPhotos(){
  return fetch('photos/manifest.json', { cache: 'no-cache' })
    .then(function(r){ return r.ok ? r.json() : { photos: [] }; })
    .then(function(j){
      var out = [];
      var src = (j && j.photos) ? j.photos : [];
      for (var i = 0; i < src.length; i++) {
        var it = src[i];
        if (typeof it === 'string') out.push({ src: 'photos/' + it, caption: '' });
        else out.push({ src: 'photos/' + it.file, caption: it.caption || '' });
      }
      return out;
    })
    .catch(function(){ return []; });
}

export function loadPhotos(){
  return Promise.all([repoPhotos(), galleryList('photo')]).then(function(res){
    items = res[0].slice();
    for (var i = 0; i < res[1].length; i++) items.push({ src: urlFor(res[1][i]), caption: '' });
    reshuffle();
    return items.length;
  });
}

function reshuffle(){
  order = [];
  for (var i = 0; i < items.length; i++) order.push(i);
  for (var j = order.length - 1; j > 0; j--) {
    var k = Math.floor(Math.random() * (j + 1));
    var t = order[j]; order[j] = order[k]; order[k] = t;
  }
  cursor = 0;
}

export function nextPhoto(){
  if (!items.length) return null;
  if (cursor >= order.length) reshuffle();
  return items[order[cursor++]];
}

export function photoCount(){ return items.length; }
