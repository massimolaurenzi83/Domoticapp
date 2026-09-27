// Lavoratore in background.
//
// Serve a due cose. Tiene in memoria i file essenziali, cosi il pannello
// si apre anche se la rete manca. E riceve le notifiche di allarme quando
// la pagina e chiusa, che e l unico modo per farle arrivare sul telefono.
//
// Su iPhone le notifiche funzionano solo se la pagina e stata aggiunta
// alla schermata Home: e una regola di Apple, non una nostra scelta.

var CACHE = 'casa-v7';

var CORE = [
  './',
  './index.html',
  './css/style.css',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/alarm-clock.js',
  './js/app.js',
  './js/backup.js',
  './js/bridge.js',
  './js/cameras.js',
  './js/config.js',
  './js/devices.js',
  './js/doorbell-log.js',
  './js/extra-views.js',
  './js/gallery.js',
  './js/google.js',
  './js/home-editor.js',
  './js/intents.js',
  './js/intercom.js',
  './js/motion.js',
  './js/music-view.js',
  './js/photos.js',
  './js/presence-sim.js',
  './js/presence.js',
  './js/privacy.js',
  './js/profiles.js',
  './js/push.js',
  './js/radio-view.js',
  './js/radio.js',
  './js/reminders.js',
  './js/screen.js',
  './js/security-view.js',
  './js/sentinel.js',
  './js/setup.js',
  './js/shopping.js',
  './js/spotify.js',
  './js/sync.js',
  './js/timers.js',
  './js/ui.js',
  './js/voice.js',
  './js/wallpaper.js',
  './js/weather.js',
  './js/widgets.js'
];

self.addEventListener('install', function(ev){
  self.skipWaiting();
  ev.waitUntil(
    caches.open(CACHE).then(function(c){
      // Se un file manca non deve far fallire tutta l installazione.
      return Promise.all(CORE.map(function(u){
        return c.add(u).catch(function(){ return null; });
      }));
    })
  );
});

self.addEventListener('activate', function(ev){
  ev.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

// Prima la rete, con la copia in memoria come rete di salvataggio. Cosi
// il pannello e sempre aggiornato ma non muore se il collegamento cade.
self.addEventListener('fetch', function(ev){
  var req = ev.request;
  if (req.method !== 'GET') return;
  if (req.url.indexOf('http') !== 0) return;

  // Le chiamate verso altri siti, come i servizi meteo, non ci riguardano:
  // vanno lasciate passare intatte. Intercettarle significava restituire la
  // pagina del pannello al posto dei dati, e ogni fornitore falliva senza
  // che si capisse perche.
  if (req.url.indexOf(self.registration.scope) !== 0) return;

  // Per il codice del pannello chiediamo sempre conferma al server, cosi
  // un aggiornamento pubblicato arriva al tablet senza dover svuotare
  // niente a mano. Per il resto vale la cache normale.
  var isCode = /\.(js|css|html|webmanifest)(\?|$)/.test(req.url) ||
               req.url.replace(/\?.*$/, '').slice(-1) === '/';
  var hit = isCode ? new Request(req, { cache: 'no-cache' }) : req;

  ev.respondWith(
    fetch(hit).then(function(res){
      if (res && res.status === 200 && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); });
      }
      return res;
    }).catch(function(){
      return caches.match(req).then(function(hit){
        if (hit) return hit;
        // Per uno script o un foglio di stile mancante non si restituisce la
        // pagina principale: il browser la scambierebbe per codice e il
        // pannello resterebbe bianco. Meglio un errore chiaro.
        if (/\.(js|css)(\?|$)/.test(req.url)) return Response.error();
        return caches.match('./index.html');
      });
    })
  );
});

// ---------- notifiche ----------

// Il servizio non manda contenuto insieme alla notifica, quindi appena
// svegliati andiamo a chiedere cosa e successo. Se la rete non risponde
// mostriamo comunque un avviso generico: meglio un avviso vago che nessun
// avviso.
function latestAlarm(){
  return caches.open('casa-config')
    .then(function(c){ return c.match('config'); })
    .then(function(res){ return res ? res.json() : null; })
    .then(function(conf){
      if (!conf || !conf.url) return null;
      return fetch(conf.url.replace(/\/+$/, '') + '/alarms', {
        headers: { 'X-Casa-Token': conf.token || '' },
        cache: 'no-store'
      }).then(function(r){ return r.ok ? r.json() : null; });
    })
    .then(function(list){ return (list && list.length) ? list[0] : null; })
    .catch(function(){ return null; });
}

self.addEventListener('push', function(ev){
  ev.waitUntil(
    latestAlarm().then(function(alarm){
      var quando = alarm ? new Date(alarm.at).toLocaleTimeString('it-IT') : null;
      var title = 'Movimento in casa';
      var options = {
        body: quando
          ? 'Rilevato un passaggio alle ' + quando + '.'
          : 'La sentinella ha rilevato un passaggio.',
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        tag: 'sentinella',
        renotify: true,
        requireInteraction: true,
        timestamp: alarm ? alarm.at : Date.now(),
        data: { url: './index.html?vista=sicurezza' }
      };
      if (alarm && alarm.thumb) options.image = alarm.thumb;
      return self.registration.showNotification(title, options);
    })
  );
});

self.addEventListener('pushsubscriptionchange', function(ev){
  // Il telefono ha rigenerato la registrazione: la pagina la rifara al
  // prossimo avvio, qui evitiamo solo che l evento resti senza risposta.
  ev.waitUntil(Promise.resolve());
});

self.addEventListener('notificationclick', function(ev){
  ev.notification.close();
  var target = (ev.notification.data && ev.notification.data.url) || './index.html';

  ev.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list){
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(self.registration.scope) === 0 && 'focus' in list[i]) {
          list[i].navigate(target);
          return list[i].focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
