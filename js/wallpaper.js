// Sfondo delle schermate meteo e controlli.
// Le immagini stanno in wallpapers/ ed e elencate in wallpapers/manifest.json.
// Il velo scuro sopra lo sfondo tiene leggibili orologio e riquadri.

import { settings, save } from './config.js';

var list = [];

export function loadWallpapers(){
  return fetch('wallpapers/manifest.json', { cache: 'no-cache' })
    .then(function(r){ return r.ok ? r.json() : { wallpapers: [] }; })
    .then(function(j){
      list = (j && j.wallpapers) ? j.wallpapers : [];
      applyWallpaper();
      return list.length;
    })
    .catch(function(){ list = []; return 0; });
}

export function wallpaperList(){ return list.slice(); }

export function setWallpaper(file){
  settings.wallpaper = file || '';
  save();
  applyWallpaper();
}

export function applyWallpaper(){
  var file = settings.wallpaper;
  var url = file ? 'url("wallpapers/' + file + '")' : '';
  var el = document.getElementById('wallpaper');
  if (el) el.style.backgroundImage = url;
  var shade = document.getElementById('wall-shade');
  if (shade) shade.style.opacity = file ? '1' : '0';
}
