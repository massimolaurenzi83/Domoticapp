// Meteo, con piu fornitori in fila.
//
// Un solo fornitore e un punto di rottura: basta che la rete di casa non
// raggiunga quel server e il pannello resta senza meteo per sempre. E
// successo davvero con il tablet vecchio, che raggiungeva tutto tranne
// quell indirizzo.
//
// Qui ne proviamo tre in ordine finche uno risponde, e ricordiamo quale ha
// funzionato per non ripetere ogni volta i tentativi a vuoto. Ogni tanto si
// riparte dal primo, cosi se il problema era passeggero si torna al
// migliore.

import { settings } from './config.js';

var PREFERRED_KEY = 'domapp.weather.source.v1';
var RETRY_BEST_AFTER = 6 * 3600000;

// ---------- traduzioni ----------

var OPEN_METEO = {
  0:'sereno', 1:'poco nuvoloso', 2:'parzialmente nuvoloso', 3:'coperto',
  45:'nebbia', 48:'nebbia gelata', 51:'pioviggine leggera', 53:'pioviggine',
  55:'pioviggine intensa', 56:'pioviggine gelata', 57:'pioviggine gelata',
  61:'pioggia leggera', 63:'pioggia', 65:'pioggia forte',
  66:'pioggia gelata', 67:'pioggia gelata forte',
  71:'neve leggera', 73:'neve', 75:'neve abbondante', 77:'granelli di neve',
  80:'rovesci leggeri', 81:'rovesci', 82:'rovesci violenti',
  85:'rovesci di neve', 86:'rovesci di neve intensi',
  95:'temporale', 96:'temporale con grandine', 99:'temporale con grandine'
};

// I nomi usati dal servizio norvegese, ridotti all essenziale.
var MET_NO = {
  clearsky:'sereno', fair:'poco nuvoloso', partlycloudy:'parzialmente nuvoloso',
  cloudy:'coperto', fog:'nebbia',
  lightrain:'pioggia leggera', rain:'pioggia', heavyrain:'pioggia forte',
  lightrainshowers:'rovesci leggeri', rainshowers:'rovesci',
  heavyrainshowers:'rovesci violenti',
  lightsleet:'nevischio', sleet:'nevischio', heavysleet:'nevischio intenso',
  lightsnow:'neve leggera', snow:'neve', heavysnow:'neve abbondante',
  lightsnowshowers:'rovesci di neve', snowshowers:'rovesci di neve',
  rainandthunder:'temporale', rainshowersandthunder:'temporale',
  heavyrainandthunder:'temporale forte', snowandthunder:'temporale di neve'
};

function metDescription(symbol){
  if (!symbol) return 'condizioni incerte';
  // I nomi finiscono con _day, _night o _polartwilight: la parte utile e prima.
  var base = String(symbol).split('_')[0];
  return MET_NO[base] || base.replace(/([a-z])([A-Z])/g, '$1 $2');
}

// I codici del terzo fornitore seguono una tabella diffusa fra i servizi meteo.
function wwoDescription(code){
  var n = parseInt(code, 10);
  if (n === 113) return 'sereno';
  if (n === 116) return 'poco nuvoloso';
  if (n === 119 || n === 122) return 'coperto';
  if (n === 143 || n === 248 || n === 260) return 'nebbia';
  if (n >= 176 && n <= 200) return 'rovesci';
  if (n >= 293 && n <= 302) return 'pioggia';
  if (n >= 305 && n <= 314) return 'pioggia forte';
  if (n >= 323 && n <= 338) return 'neve';
  if (n >= 386 && n <= 395) return 'temporale';
  return 'condizioni incerte';
}

// ---------- i fornitori ----------

function openMeteo(lat, lon){
  var url = 'https://api.open-meteo.com/v1/forecast' +
    '?latitude=' + lat + '&longitude=' + lon +
    '&current=temperature_2m,weather_code' +
    '&daily=temperature_2m_max,temperature_2m_min' +
    '&forecast_days=1&timezone=auto';

  return ask(url).then(function(j){
    var cur = j.current || {};
    var day = j.daily || {};
    if (typeof cur.temperature_2m !== 'number') throw new Error('risposta senza temperatura');
    return {
      temp: Math.round(cur.temperature_2m),
      desc: OPEN_METEO[cur.weather_code] || 'condizioni incerte',
      min: day.temperature_2m_min ? Math.round(day.temperature_2m_min[0]) : null,
      max: day.temperature_2m_max ? Math.round(day.temperature_2m_max[0]) : null,
      source: 'open-meteo'
    };
  });
}

function metNo(lat, lon){
  var url = 'https://api.met.no/weatherapi/locationforecast/2.0/compact' +
    '?lat=' + lat + '&lon=' + lon;

  return ask(url).then(function(j){
    var serie = j.properties && j.properties.timeseries;
    if (!serie || !serie.length) throw new Error('risposta vuota');

    var ora = serie[0].data;
    var t = ora.instant && ora.instant.details ? ora.instant.details.air_temperature : null;
    if (typeof t !== 'number') throw new Error('risposta senza temperatura');

    var simbolo = (ora.next_1_hours && ora.next_1_hours.summary) ||
                  (ora.next_6_hours && ora.next_6_hours.summary) || {};

    // Minima e massima si ricavano dalle prossime ventiquattro letture.
    var min = t, max = t;
    for (var i = 0; i < serie.length && i < 24; i++) {
      var d = serie[i].data;
      var v = d.instant && d.instant.details ? d.instant.details.air_temperature : null;
      if (typeof v !== 'number') continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }

    return {
      temp: Math.round(t),
      desc: metDescription(simbolo.symbol_code),
      min: Math.round(min),
      max: Math.round(max),
      source: 'met.no'
    };
  });
}

function wttr(lat, lon){
  var url = 'https://wttr.in/' + lat + ',' + lon + '?format=j1';

  return ask(url).then(function(j){
    var cur = (j.current_condition || [])[0];
    if (!cur) throw new Error('risposta vuota');
    var oggi = (j.weather || [])[0] || {};

    return {
      temp: Math.round(parseFloat(cur.temp_C)),
      desc: wwoDescription(cur.weatherCode),
      min: oggi.mintempC !== undefined ? Math.round(parseFloat(oggi.mintempC)) : null,
      max: oggi.maxtempC !== undefined ? Math.round(parseFloat(oggi.maxtempC)) : null,
      source: 'wttr.in'
    };
  });
}

var SOURCES = [
  { id: 'open-meteo', fn: openMeteo },
  { id: 'met.no', fn: metNo },
  { id: 'wttr.in', fn: wttr }
];

// ---------- richiesta ----------

// Un fornitore che non risponde entro otto secondi va scartato, altrimenti
// il pannello resta appeso ad aspettarlo.
function ask(url){
  var controller = window.AbortController ? new AbortController() : null;
  var opzioni = { cache: 'no-store' };
  if (controller) opzioni.signal = controller.signal;

  var scaduto = setTimeout(function(){
    if (controller) controller.abort();
  }, 8000);

  return fetch(url, opzioni).then(function(r){
    clearTimeout(scaduto);
    if (!r.ok) throw new Error('stato ' + r.status);
    return r.json();
  }, function(e){
    clearTimeout(scaduto);
    throw e;
  });
}

function preferred(){
  try { return JSON.parse(localStorage.getItem(PREFERRED_KEY) || 'null'); } catch (e) { return null; }
}

function rememberPreferred(id){
  try { localStorage.setItem(PREFERRED_KEY, JSON.stringify({ id: id, at: Date.now() })); } catch (e) {}
}

// Mette in testa il fornitore che l ultima volta ha funzionato, a meno che
// non sia passato abbastanza tempo da valere la pena riprovare il migliore.
function order(){
  var saved = preferred();
  if (!saved || saved.id === SOURCES[0].id) return SOURCES.slice();
  if (Date.now() - (saved.at || 0) > RETRY_BEST_AFTER) return SOURCES.slice();

  var lista = SOURCES.filter(function(s){ return s.id === saved.id; });
  return lista.concat(SOURCES.filter(function(s){ return s.id !== saved.id; }));
}

var lastError = '';

export function fetchWeather(){
  var lat = encodeURIComponent(settings.lat);
  var lon = encodeURIComponent(settings.lon);
  var lista = order();
  var falliti = [];

  function prova(i){
    if (i >= lista.length) {
      lastError = falliti.join('; ');
      throw new Error('nessun fornitore raggiungibile');
    }
    return lista[i].fn(lat, lon).then(function(risultato){
      rememberPreferred(lista[i].id);
      lastError = falliti.length ? 'ripiegato dopo: ' + falliti.join('; ') : '';
      return risultato;
    }, function(e){
      falliti.push(lista[i].id + ' ' + (e && e.message ? e.message : 'errore'));
      return prova(i + 1);
    });
  }

  return prova(0);
}

export function weatherDiagnostics(){
  var saved = preferred();
  var riga = 'Meteo: ' + (saved ? 'fornitore in uso ' + saved.id : 'nessun fornitore ancora provato');
  if (lastError) riga += ', ' + lastError;
  return riga;
}
