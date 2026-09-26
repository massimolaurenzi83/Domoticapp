// Installazione del servizio di collegamento, in un colpo solo.
//
// Uso, dalla cartella del progetto sul computer:
//
//   npx wrangler login        una volta sola: apre il browser per entrare
//                             nel tuo account Cloudflare gratuito
//   node worker/installa.mjs  fa tutto il resto
//
// Alla fine stampa un link da aprire su ogni tablet e telefono: il pannello
// si collega da solo, senza copiare niente a mano. Lo stesso link finisce
// nel file worker/credenziali.txt, che resta solo sul tuo computer e non
// viene mai pubblicato.
//
// Si puo rilanciare quando vuoi: riusa il deposito e le chiavi gia creati.

import { spawn, spawnSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const TOML = join(QUI, 'wrangler.toml');
const CREDENZIALI = join(QUI, 'credenziali.txt');
const SITO = 'https://massimolaurenzi83.github.io/Domoticapp/';
const WRANGLER = ['--yes', 'wrangler@4'];

function dici(testo) { process.stdout.write(testo + '\n'); }
function fermati(testo) { dici('\nFERMO: ' + testo + '\n'); process.exit(1); }

// Comando breve, di cui serve solo il risultato.
function wrangler(args, input) {
  const r = spawnSync('npx', WRANGLER.concat(args), {
    cwd: QUI, encoding: 'utf8', input, shell: true, maxBuffer: 20 * 1024 * 1024
  });
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
}

// Comando lungo: mostra a video quello che succede e intanto lo conserva.
function wranglerVisibile(args) {
  return new Promise((resolve) => {
    const p = spawn('npx', WRANGLER.concat(args), { cwd: QUI, shell: true, stdio: ['inherit', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
    p.stderr.on('data', (d) => { out += d; process.stderr.write(d); });
    p.on('close', (code) => resolve({ ok: code === 0, out }));
  });
}

// ---------- credenziali ----------
//
// La parola condivisa e le chiavi delle notifiche si generano una volta
// sola e poi si riusano, altrimenti ogni nuova installazione staccherebbe i
// tablet gia collegati.

function leggiCredenziali() {
  if (!existsSync(CREDENZIALI)) return {};
  const out = {};
  for (const riga of readFileSync(CREDENZIALI, 'utf8').split(/\r?\n/)) {
    const m = riga.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Parola condivisa leggibile: quattro gruppi da quattro, senza lettere che
// si confondono fra loro come l e 1, o e 0.
function nuovaParola() {
  const alfabeto = 'abcdefghijkmnpqrstuvwxyz23456789';
  const b = randomBytes(16);
  let s = '';
  for (let i = 0; i < 16; i++) {
    if (i && i % 4 === 0) s += '-';
    s += alfabeto[b[i] % alfabeto.length];
  }
  return s;
}

// Chiavi per firmare le notifiche verso i telefoni, nel formato che i
// browser si aspettano.
function nuoveChiaviNotifiche() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const priv = privateKey.export({ format: 'jwk' });
  const pub = publicKey.export({ format: 'jwk' });
  const x = Buffer.from(pub.x, 'base64url');
  const y = Buffer.from(pub.y, 'base64url');
  return {
    VAPID_PUBLIC: b64url(Buffer.concat([Buffer.from([4]), x, y])),
    VAPID_PRIVATE: priv.d
  };
}

// ---------- passi ----------

async function main() {
  dici('Installazione del servizio di collegamento\n');

  dici('1. Controllo di essere entrato in Cloudflare...');
  const chi = wrangler(['whoami']);
  if (!chi.ok || /not authenticated|You are not logged in/i.test(chi.out)) {
    fermati('non sei ancora entrato. Esegui prima:\n\n   npx wrangler login\n\npoi rilancia questo comando.');
  }
  dici('   fatto.\n');

  dici('2. Deposito dei dati...');
  let toml = readFileSync(TOML, 'utf8');
  if (/id = "DA_CREARE"/.test(toml)) {
    let r = wrangler(['kv', 'namespace', 'create', 'CASA']);
    let id = (r.out.match(/"?id"?\s*[:=]\s*"([0-9a-f]{32})"/) || [])[1];
    if (!id) {
      // Esiste gia da un tentativo precedente: lo si ritrova nell elenco.
      const elenco = wrangler(['kv', 'namespace', 'list']);
      try {
        const lista = JSON.parse(elenco.out.slice(elenco.out.indexOf('[')));
        const trovato = lista.find((n) => /CASA/.test(n.title));
        if (trovato) id = trovato.id;
      } catch (e) {}
    }
    if (!id) fermati('non riesco a creare il deposito dei dati. Risposta di Cloudflare:\n' + r.out);
    toml = toml.replace('id = "DA_CREARE"', 'id = "' + id + '"');
    writeFileSync(TOML, toml);
    dici('   creato.\n');
  } else {
    dici('   gia presente.\n');
  }

  dici('3. Chiavi...');
  const cred = leggiCredenziali();
  if (!cred.CASA_TOKEN) cred.CASA_TOKEN = nuovaParola();
  if (!cred.VAPID_PUBLIC || !cred.VAPID_PRIVATE) Object.assign(cred, nuoveChiaviNotifiche());
  dici('   pronte.\n');

  dici('4. Pubblicazione del servizio...\n');
  const dep = await wranglerVisibile(['deploy']);
  if (!dep.ok) {
    if (/workers\.dev subdomain/i.test(dep.out)) {
      fermati('il tuo account Cloudflare non ha ancora un nome per i servizi.\n' +
        'Apri https://dash.cloudflare.com, entra in Workers, scegli un nome quando te lo chiede,\n' +
        'poi rilancia questo comando.');
    }
    fermati('la pubblicazione non e riuscita. Leggi il messaggio qui sopra.');
  }
  const url = (dep.out.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/i) || [])[0];
  if (!url) fermati('pubblicato, ma non trovo l indirizzo nella risposta. Cercalo qui sopra: finisce con workers.dev');
  dici('');

  dici('5. Consegna delle chiavi al servizio...');
  for (const nome of ['CASA_TOKEN', 'VAPID_PUBLIC', 'VAPID_PRIVATE']) {
    const r = wrangler(['secret', 'put', nome], cred[nome]);
    if (!r.ok) fermati('non riesco a consegnare ' + nome + ':\n' + r.out);
  }
  dici('   fatto.\n');

  dici('6. Prova del collegamento...');
  let prova = null;
  for (let tentativo = 0; tentativo < 6 && !prova; tentativo++) {
    try {
      const r = await fetch(url + '/state', { headers: { 'X-Casa-Token': cred.CASA_TOKEN } });
      if (r.ok) prova = true;
      else await new Promise((f) => setTimeout(f, 5000));
    } catch (e) { await new Promise((f) => setTimeout(f, 5000)); }
  }
  dici(prova ? '   il servizio risponde.\n' : '   il servizio non risponde ancora: a volte servono un paio di minuti.\n');

  const link = SITO + '#collega=' + encodeURIComponent(url + '|' + cred.CASA_TOKEN);
  cred.URL = url;
  cred.LINK = link;
  writeFileSync(CREDENZIALI,
    '# Credenziali del servizio di collegamento. Restano solo su questo computer.\n' +
    '# Il link in fondo collega un dispositivo in un tocco: trattalo come una password.\n' +
    Object.entries(cred).map(([k, v]) => k + '=' + v).join('\n') + '\n');

  dici('============================================================');
  dici('Fatto. Apri questo link su ogni tablet e telefono di casa:\n');
  dici(link);
  dici('\nIl pannello si collega da solo. Mandatelo per email o WhatsApp,');
  dici('ma non condividerlo con altri: chi ha il link entra nel pannello.');
  dici('Lo trovi anche nel file worker/credenziali.txt.');
  dici('============================================================');
}

main().catch((e) => fermati(e && e.message ? e.message : String(e)));
