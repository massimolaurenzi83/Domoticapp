// Invio delle notifiche ai telefoni.
//
// I browser accettano una notifica solo se firmata con la coppia di chiavi
// del servizio, secondo lo schema VAPID. La firma viene costruita qui con
// gli strumenti crittografici gia presenti in Cloudflare Workers, senza
// librerie esterne.
//
// Le notifiche partono senza contenuto. Il lavoratore in background, appena
// svegliato, chiede al servizio gli ultimi allarmi e costruisce il testo.
// Cosi evitiamo di cifrare il contenuto, che e la parte piu fragile, e le
// immagini non transitano dove non serve.

function b64urlToBytes(s){
  var pad = '='.repeat((4 - s.length % 4) % 4);
  var b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  var raw = atob(b64);
  var out = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes){
  var s = '';
  var arr = new Uint8Array(bytes);
  for (var i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function textToB64url(str){
  return bytesToB64url(new TextEncoder().encode(str));
}

// La chiave privata VAPID arriva come stringa; qui diventa una chiave
// utilizzabile per firmare.
async function importSigningKey(privateB64url, publicB64url){
  var d = b64urlToBytes(privateB64url);
  var pub = b64urlToBytes(publicB64url);
  // Il formato pubblico non compresso e 0x04 seguito da x e y.
  var x = bytesToB64url(pub.slice(1, 33));
  var y = bytesToB64url(pub.slice(33, 65));

  return crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: bytesToB64url(d), x: x, y: y, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
}

async function buildVapidHeader(endpoint, env){
  var origin = new URL(endpoint).origin;
  var header = textToB64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  var payload = textToB64url(JSON.stringify({
    aud: origin,
    exp: Math.floor(Date.now() / 1000) + 3600,
    sub: env.VAPID_SUBJECT || 'mailto:casa@example.org'
  }));

  var signingInput = header + '.' + payload;
  var key = await importSigningKey(env.VAPID_PRIVATE, env.VAPID_PUBLIC);
  var sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput)
  );

  return {
    Authorization: 'vapid t=' + signingInput + '.' + bytesToB64url(sig) +
                   ', k=' + env.VAPID_PUBLIC
  };
}

// Manda la notifica a un singolo telefono. Restituisce lo stato, cosi chi
// chiama puo scartare le registrazioni ormai morte.
export async function sendTo(subscription, env){
  var headers = await buildVapidHeader(subscription.endpoint, env);
  headers['TTL'] = '120';
  headers['Urgency'] = 'high';
  headers['Content-Length'] = '0';

  var res = await fetch(subscription.endpoint, { method: 'POST', headers: headers });
  return res.status;
}

// Invia a tutti i telefoni registrati e restituisce quelli da dimenticare.
export async function sendToAll(subs, env){
  var dead = [];
  for (var i = 0; i < subs.length; i++) {
    try {
      var status = await sendTo(subs[i].subscription, env);
      // 404 e 410 significano che quel telefono non esiste piu.
      if (status === 404 || status === 410) dead.push(subs[i].id);
    } catch (e) {
      // Un errore di rete non e motivo per cancellare una registrazione.
    }
  }
  return dead;
}
