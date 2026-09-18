// Profili delle persone di casa.
//
// Il pannello resta aperto a tutti per luci, musica e citofono, che sono
// di casa e non di una persona. Il profilo serve solo a decidere su quale
// calendario finisce un promemoria. Le impostazioni tecniche si possono
// proteggere con un codice numerico.

import { settings } from './config.js';

export function profiles(){
  var out = [];
  if (settings.profile1Name) out.push({ id:'p1', name: settings.profile1Name, color:'#4a8fe0' });
  if (settings.profile2Name) out.push({ id:'p2', name: settings.profile2Name, color:'#d4537e' });
  out.push({ id:'casa', name:'Casa', color:'#1d9e75' });
  return out;
}

export function profileName(id){
  var all = profiles();
  for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i].name;
  return 'Casa';
}

// Restituisce true quando il codice non e impostato oppure corrisponde.
export function pinOk(entered){
  var pin = String(settings.settingsPin || '').trim();
  if (!pin) return true;
  return String(entered || '').trim() === pin;
}

export function pinRequired(){
  return !!String(settings.settingsPin || '').trim();
}
