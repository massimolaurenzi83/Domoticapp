// Meteo da Open-Meteo: gratuito, senza registrazione e senza chiave.

import { settings } from './config.js';

var CODES = {
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

export function fetchWeather(){
  var url = 'https://api.open-meteo.com/v1/forecast' +
    '?latitude=' + encodeURIComponent(settings.lat) +
    '&longitude=' + encodeURIComponent(settings.lon) +
    '&current=temperature_2m,weather_code' +
    '&daily=temperature_2m_max,temperature_2m_min' +
    '&forecast_days=1&timezone=auto';

  return fetch(url).then(function(r){
    if (!r.ok) throw new Error('meteo ' + r.status);
    return r.json();
  }).then(function(j){
    var cur = j.current || {};
    var day = j.daily || {};
    return {
      temp: Math.round(cur.temperature_2m),
      desc: CODES[cur.weather_code] || 'condizioni incerte',
      min: day.temperature_2m_min ? Math.round(day.temperature_2m_min[0]) : null,
      max: day.temperature_2m_max ? Math.round(day.temperature_2m_max[0]) : null
    };
  });
}
