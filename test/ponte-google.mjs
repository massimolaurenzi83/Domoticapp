// Prove del programma per Vercel che parla con Google, senza rete vera:
//   node test/ponte-google.mjs
// L ultima prova parla davvero con Google con un permesso finto, per
// verificare che il messaggio arrivi e che il rifiuto venga spiegato.

const H = (await import(new URL('../google/relay/api/comando.js', import.meta.url).href)).default;
const A = await import(new URL('../google/relay/lib/assistant.js', import.meta.url).href);

let passate = 0, fallite = 0;
function prova(nome, ok, dett) {
  if (ok) passate++; else fallite++;
  console.log((ok ? 'OK   ' : 'KO   ') + nome + (dett ? '  (' + dett + ')' : ''));
}

function chiama(method, headers, body) {
  return new Promise((resolve) => {
    const res = {
      code: 0, headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.code = c; return this; },
      json(j) { resolve({ code: this.code, body: j }); }
    };
    H({ method, headers, body }, res);
  });
}

delete process.env.RELAY_TOKEN;
let r = await chiama('GET', {});
prova('senza configurazione il ponte resta chiuso', r.code === 500);

process.env.RELAY_TOKEN = 'parola-ponte';
process.env.GOOGLE_REFRESH_TOKEN = 'finto';
process.env.GOOGLE_CLIENT_ID = 'finto';
process.env.GOOGLE_CLIENT_SECRET = 'finto';

r = await chiama('GET', { 'x-relay-token': 'sbagliata' });
prova('parola sbagliata rifiutata', r.code === 401);
r = await chiama('GET', { 'x-relay-token': 'parola-ponte' });
prova('controllo di salute senza disturbare Google', r.code === 200 && r.body.ok);
r = await chiama('POST', { 'x-relay-token': 'parola-ponte' }, { testo: '' });
prova('frase vuota rifiutata', r.code === 400);
r = await chiama('POST', { 'x-relay-token': 'parola-ponte' }, { testo: 'x'.repeat(201) });
prova('frase troppo lunga rifiutata', r.code === 400);

// messaggio per Google: la frase e la lingua ci sono, nel posto giusto
const msg = A.buildRequest('accendi la luce', 'it-IT');
const cfg = A.decode(A.decode(msg)[0].value);
const testo = cfg.find((f) => f.field === 6);
const dialog = A.decode(cfg.find((f) => f.field === 3).value);
prova('la frase sta nel campo giusto del messaggio', testo && testo.value.toString() === 'accendi la luce');
prova('la lingua e l italiano', dialog.find((f) => f.field === 2).value.toString() === 'it-IT');

// Google vero, permesso finto: deve rifiutare e il rifiuto va spiegato
try {
  await A.assist('che ore sono', { accessToken: 'permesso-finto' }, { timeoutMs: 15000 });
  prova('Google rifiuta un permesso finto', false, 'ha accettato');
} catch (e) {
  prova('Google rifiuta un permesso finto con una spiegazione chiara', e.code === 'auth' && /autorizzazione/.test(e.message), e.message);
}

console.log('\n' + passate + ' passate, ' + fallite + ' fallite');
process.exit(fallite ? 1 : 0);
