// Interruttori di microfono e fotocamera.
//
// Sono deliberatamente fuori dalle impostazioni e raggiungibili con un
// tocco, perche spegnere microfono e fotocamera non deve mai richiedere
// un codice o una ricerca dentro i menu. Lo stato e sempre visibile.

import { settings, save } from './config.js';

var listeners = [];

export function onPrivacyChange(fn){ listeners.push(fn); }

function fire(){
  for (var i = 0; i < listeners.length; i++) listeners[i]();
}

export function micOn(){ return !settings.privacyMicOff; }
export function camOn(){ return !settings.privacyCamOff; }

export function setMic(on){
  settings.privacyMicOff = !on;
  save(); fire();
}

export function setCam(on){
  settings.privacyCamOff = !on;
  save(); fire();
}

// Spegne entrambi in un colpo solo.
export function silenceAll(){
  settings.privacyMicOff = true;
  settings.privacyCamOff = true;
  save(); fire();
}

export function privacySummary(){
  if (!micOn() && !camOn()) return 'microfono e fotocamera spenti';
  if (!micOn()) return 'microfono spento';
  if (!camOn()) return 'fotocamera spenta';
  return 'microfono e fotocamera attivi';
}
