// Notifiche sul telefono.
//
// Android e iPhone si comportano in modo diverso e vanno trattati
// diversamente.
//
// Android: basta concedere il permesso dal browser e le notifiche
// arrivano, anche a pagina chiusa.
//
// iPhone: Apple consente le notifiche web solo se la pagina e stata
// aggiunta alla schermata Home e aperta da li. Finche resta una scheda
// dentro Safari il permesso non viene nemmeno offerto. Serve iOS 16.4 o
// piu recente.

import { settings } from './config.js';

var reg = null;

export function isIOS(){
  var ua = navigator.userAgent || '';
  var iOSClassic = /iPad|iPhone|iPod/.test(ua);
  // Dall iPad con iPadOS il browser si dichiara come un Mac, ma il Mac
  // non ha il tocco: la combinazione lo smaschera.
  var iPadModern = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  return iOSClassic || iPadModern;
}

export function isStandalone(){
  if (window.navigator.standalone === true) return true;
  return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}

export function pushSupported(){
  return !!('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
}

// Spiega in italiano cosa manca, invece di limitarsi a fallire.
export function pushBlockedReason(){
  if (!window.isSecureContext) return 'Le notifiche richiedono una connessione protetta.';
  if (!pushSupported()) {
    if (isIOS()) return 'Su iPhone serve iOS 16.4 o più recente.';
    return 'Questo browser non supporta le notifiche.';
  }
  if (isIOS() && !isStandalone()) {
    return 'Su iPhone aggiungi prima questa pagina alla schermata Home, ' +
           'con il tasto Condividi e poi Aggiungi a Home. Aprila da li e ' +
           'le notifiche diventeranno disponibili.';
  }
  if (Notification.permission === 'denied') {
    return 'Le notifiche sono state rifiutate. Vanno riabilitate dalle ' +
           'impostazioni del browser per questo sito.';
  }
  return null;
}

// Il lavoratore in background gira anche a pagina chiusa e non puo
// leggere le impostazioni del pannello, quindi gliele lasciamo qui.
export function shareConfigWithWorker(){
  if (!('caches' in window)) return Promise.resolve();
  var conf = { url: settings.syncUrl || '', token: settings.syncToken || '' };
  return caches.open('casa-config').then(function(c){
    return c.put('config', new Response(JSON.stringify(conf), {
      headers: { 'Content-Type': 'application/json' }
    }));
  }).catch(function(){});
}

export function registerWorker(){
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.register('./sw.js')
    .then(function(r){ reg = r; return shareConfigWithWorker().then(function(){ return r; }); })
    .catch(function(){ return null; });
}

// Chiede il permesso e registra il telefono presso il servizio.
// Va chiamata da un tocco dell utente, altrimenti i browser la rifiutano.
export function enableNotifications(){
  var why = pushBlockedReason();
  if (why) return Promise.resolve({ ok: false, message: why });

  return Notification.requestPermission().then(function(perm){
    if (perm !== 'granted') {
      return { ok: false, message: 'Permesso non concesso.' };
    }
    return registerWorker().then(subscribe);
  });
}

function subscribe(r){
  if (!r) return { ok: false, message: 'Lavoratore in background non installato.' };
  if (!settings.syncUrl) {
    return { ok: false, message: 'Prima va impostato l’indirizzo del servizio, nel gruppo Sincronizzazione.' };
  }

  var base = String(settings.syncUrl).replace(/\/+$/, '');

  return fetch(base + '/push/key', { headers: { 'X-Casa-Token': settings.syncToken } })
    .then(function(res){
      if (!res.ok) throw new Error('chiave non disponibile');
      return res.text();
    })
    .then(function(key){
      return r.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key.trim())
      });
    })
    .then(function(sub){
      return fetch(base + '/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Casa-Token': settings.syncToken },
        body: JSON.stringify({
          subscription: sub,
          device: isIOS() ? 'iphone' : 'android',
          label: settings.profile1Name || 'telefono'
        })
      });
    })
    .then(function(res){
      if (!res.ok) throw new Error(res.status === 401 ? 'parola condivisa rifiutata dal servizio' : 'il servizio ha risposto ' + res.status);
      return { ok: true, message: 'Notifiche attive su questo dispositivo.' };
    })
    .catch(function(e){ return { ok: false, message: 'Registrazione non riuscita: ' + e.message }; });
}

export function notificationsActive(){
  return ('Notification' in window) && Notification.permission === 'granted';
}

// La chiave del servizio arriva in forma testuale e va convertita in byte.
function urlBase64ToUint8Array(base64String){
  var padding = '='.repeat((4 - base64String.length % 4) % 4);
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var raw = window.atob(base64);
  var out = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
