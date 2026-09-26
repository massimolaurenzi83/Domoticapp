// Sfondo delle schermate meteo e controlli.
//
// Si sceglie fra quelli di esempio del progetto e quelli aggiunti dal
// tablet, presi dalla galleria. Il velo scuro sopra lo sfondo tiene
// leggibili orologio e riquadri.
//
// Gli sfondi della galleria si riconoscono dal prefisso g: nel nome
// salvato.

import { settings, save } from './config.js';
import { list as galleryList, urlFor, get as galleryGet } from './gallery.js';

var repo = [];
var mine = [];

export function loadWallpapers(){
  var dalProgetto = fetch('wallpapers/manifest.json', { cache: 'no-cache' })
    .then(function(r){ return r.ok ? r.json() : { wallpapers: [] }; })
    .then(function(j){ return (j && j.wallpapers) ? j.wallpapers : []; })
    .catch(function(){ return []; });

  return Promise.all([dalProgetto, galleryList('wallpaper')]).then(function(res){
    repo = res[0];
    mine = res[1];
    applyWallpaper();
    return repo.length + mine.length;
  });
}

// Ogni voce ha un valore da salvare e un indirizzo per l anteprima.
export function wallpaperList(){
  var out = [];
  for (var i = 0; i < mine.length; i++) {
    out.push({ value: 'g:' + mine[i].id, url: urlFor(mine[i]), own: true, id: mine[i].id });
  }
  for (var k = 0; k < repo.length; k++) {
    out.push({ value: repo[k], url: 'wallpapers/' + repo[k], own: false });
  }
  return out;
}

export function setWallpaper(value){
  settings.wallpaper = value || '';
  save();
  applyWallpaper();
}

export function applyWallpaper(){
  var value = settings.wallpaper || '';
  var el = document.getElementById('wallpaper');
  var shade = document.getElementById('wall-shade');

  function paint(url){
    if (el) el.style.backgroundImage = url ? 'url("' + url + '")' : '';
    if (shade) shade.style.opacity = url ? '1' : '0';
  }

  if (!value) { paint(''); return; }

  if (value.indexOf('g:') === 0) {
    var id = value.slice(2);
    for (var i = 0; i < mine.length; i++) {
      if (mine[i].id === id) { paint(urlFor(mine[i])); return; }
    }
    // Non ancora in memoria, per esempio subito dopo l avvio.
    galleryGet(id).then(function(rec){ paint(rec ? urlFor(rec) : ''); });
    return;
  }
  paint('wallpapers/' + value);
}
