// Collegamento del pannello a Google Home, in un colpo solo.
//
// Prima segui google/GUIDA.md per creare il progetto su Google Cloud e
// scaricare il file del client. Poi, dalla cartella del progetto:
//
//   npx vercel login          una volta sola, anche entrando con GitHub
//   node google/autorizza.mjs
//
// Lo script:
//   1. apre la pagina di Google dove dai il permesso al pannello;
//   2. prova subito un comando innocuo, "che ore sono";
//   3. pubblica su Vercel il piccolo programma che parla con Google;
//   4. lo collega al servizio di casa su Cloudflare;
//   5. rifa la prova passando da tutta la catena, come fara il pannello.
//
// Il permesso resta nel file google/credenziali.txt, solo su questo
// computer. Si puo rilanciare quando vuoi: con l opzione --nuovo chiede di
// nuovo il permesso a Google.

import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assist } from './relay/lib/assistant.js';

const QUI = dirname(fileURLToPath(import.meta.url));
const RELAY = join(QUI, 'relay');
const WORKER = join(QUI, '..', 'worker');
const CREDENZIALI = join(QUI, 'credenziali.txt');
const SCOPE = 'https://www.googleapis.com/auth/assistant-sdk-prototype';

function dici(t) { process.stdout.write(t + '\n'); }
function fermati(t) { dici('\nFERMO: ' + t + '\n'); process.exit(1); }

function leggiFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const r of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = r.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function scriviCredenziali(c) {
  writeFileSync(CREDENZIALI,
    '# Permesso Google del pannello. Resta solo su questo computer: non condividerlo.\n' +
    Object.entries(c).map(([k, v]) => k + '=' + v).join('\n') + '\n');
}

function comando(prog, args, cwd, input) {
  const r = spawnSync(prog, args, { cwd, encoding: 'utf8', input, shell: true, maxBuffer: 20 * 1024 * 1024 });
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') };
}

function comandoVisibile(prog, args, cwd) {
  return new Promise((resolve) => {
    const p = spawn(prog, args, { cwd, shell: true, stdio: ['inherit', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
    p.stderr.on('data', (d) => { out += d; process.stderr.write(d); });
    p.on('close', (code) => resolve({ ok: code === 0, out }));
  });
}

const vercel = (args, input) => comando('npx', ['--yes', 'vercel@latest'].concat(args), RELAY, input);
const wrangler = (args, input) => comando('npx', ['--yes', 'wrangler@4'].concat(args), WORKER, input);

function apriBrowser(url) {
  try {
    if (process.platform === 'win32') spawn('explorer.exe', [url], { detached: true, stdio: 'ignore' });
    else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' });
    else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
  } catch (e) {}
}

// ---------- 1. permesso di Google ----------

function clientGoogle() {
  const file = readdirSync(QUI).find((f) => /^client_secret.*\.json$/i.test(f));
  if (!file) {
    fermati('non trovo il file del client Google.\n' +
      'Scaricalo da Google Cloud come spiegato in google/GUIDA.md e mettilo nella cartella google,\n' +
      'con un nome che comincia per client_secret.');
  }
  const j = JSON.parse(readFileSync(join(QUI, file), 'utf8'));
  if (!j.installed) {
    fermati('il file ' + file + ' e di un client di tipo sbagliato.\n' +
      'In Google Cloud il client va creato come "App desktop", non come applicazione web.');
  }
  return { id: j.installed.client_id, secret: j.installed.client_secret };
}

function chiediPermesso(client) {
  return new Promise((resolve, reject) => {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const stato = randomBytes(12).toString('hex');

    const server = createServer(async (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (!u.searchParams.has('code') && !u.searchParams.has('error')) { res.end(); return; }
      const errore = u.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body style="font-family:sans-serif;font-size:22px;padding:40px">' +
        (errore ? 'Permesso non concesso. Puoi chiudere questa pagina.'
                : 'Fatto. Puoi chiudere questa pagina e tornare alla finestra nera.') + '</body></html>');
      server.close();
      if (errore) { reject(new Error('Google ha risposto: ' + errore)); return; }
      if (u.searchParams.get('state') !== stato) { reject(new Error('risposta di Google non riconosciuta')); return; }

      const redirect = 'http://127.0.0.1:' + server.address().port;
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: u.searchParams.get('code'), client_id: client.id, client_secret: client.secret,
          redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier
        })
      });
      const j = await r.json();
      if (!j.refresh_token) { reject(new Error('Google non ha dato il permesso permanente: ' + JSON.stringify(j))); return; }
      resolve(j.refresh_token);
    });

    server.listen(0, '127.0.0.1', () => {
      const redirect = 'http://127.0.0.1:' + server.address().port;
      const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: client.id, redirect_uri: redirect, response_type: 'code', scope: SCOPE,
        access_type: 'offline', prompt: 'consent', state: stato,
        code_challenge: challenge, code_challenge_method: 'S256'
      });
      dici('   Si apre il browser sulla pagina di Google. Se non si apre, copia questo indirizzo:\n');
      dici('   ' + url + '\n');
      dici('   Entra con l account Google che usi per Google Home.');
      dici('   Google avvisera che l app non e verificata: tocca Avanzate, poi Vai a Casa.');
      dici('   E normale per un app che hai creato tu e usi solo tu.\n');
      apriBrowser(url);
    });
  });
}

// ---------- programma principale ----------

async function main() {
  dici('Collegamento del pannello a Google Home\n');
  const nuovo = process.argv.includes('--nuovo');
  const cred = leggiFile(CREDENZIALI);
  const client = clientGoogle();

  dici('1. Permesso di Google...');
  if (!cred.REFRESH_TOKEN || nuovo || cred.CLIENT_ID !== client.id) {
    try { cred.REFRESH_TOKEN = await chiediPermesso(client); }
    catch (e) { fermati(e.message); }
    cred.CLIENT_ID = client.id;
    scriviCredenziali(cred);
    dici('   permesso ricevuto.\n');
  } else {
    dici('   gia presente.\n');
  }
  const creds = { clientId: client.id, clientSecret: client.secret, refreshToken: cred.REFRESH_TOKEN };

  dici('2. Prova diretta con Google: "che ore sono"...');
  try {
    const r = await assist('che ore sono', creds);
    dici('   Google ha risposto' + (r.text ? ': ' + r.text : ', a voce') + '.\n');
  } catch (e) {
    if (e.grpcStatus === 7) fermati(e.message + '.\nIn Google Cloud apri API e servizi, Libreria, cerca Google Assistant API e premi Abilita.');
    fermati(e.message);
  }

  dici('3. Pubblicazione del programma su Vercel...');
  const chi = vercel(['whoami']);
  if (!chi.ok) fermati('non sei ancora entrato in Vercel. Esegui prima:\n\n   npx vercel login\n\npoi rilancia questo comando.');
  if (!cred.RELAY_TOKEN) { cred.RELAY_TOKEN = randomBytes(24).toString('base64url'); scriviCredenziali(cred); }

  if (!existsSync(join(RELAY, '.vercel'))) {
    // Il progetto si chiama casa-google, cosi lo riconosci su vercel.com.
    vercel(['link', '--yes', '--project', 'casa-google']);
  }
  if (!existsSync(join(RELAY, '.vercel'))) {
    const primo = await comandoVisibile('npx', ['--yes', 'vercel@latest', 'deploy', '--yes'], RELAY);
    if (!primo.ok) fermati('la prima pubblicazione su Vercel non e riuscita. Leggi il messaggio qui sopra.');
  }
  const variabili = {
    GOOGLE_CLIENT_ID: client.id, GOOGLE_CLIENT_SECRET: client.secret,
    GOOGLE_REFRESH_TOKEN: cred.REFRESH_TOKEN, RELAY_TOKEN: cred.RELAY_TOKEN
  };
  for (const [nome, valore] of Object.entries(variabili)) {
    vercel(['env', 'rm', nome, 'production', '--yes']);
    const r = vercel(['env', 'add', nome, 'production'], valore);
    if (!r.ok) fermati('non riesco a impostare ' + nome + ' su Vercel:\n' + r.out);
  }
  const dep = await comandoVisibile('npx', ['--yes', 'vercel@latest', 'deploy', '--prod', '--yes'], RELAY);
  if (!dep.ok) fermati('la pubblicazione su Vercel non e riuscita. Leggi il messaggio qui sopra.');

  // L indirizzo stabile e quello del progetto, senza la parte casuale.
  const indirizzi = (dep.out.match(/https:\/\/[a-z0-9-]+\.vercel\.app/gi) || []);
  const stabile = indirizzi.find((u) => /Aliased/i.test(dep.out.slice(Math.max(0, dep.out.indexOf(u) - 40), dep.out.indexOf(u))))
    || indirizzi.slice().sort((a, b) => a.length - b.length)[0];
  if (!stabile) fermati('pubblicato, ma non trovo l indirizzo. Cercalo qui sopra: finisce con vercel.app');
  cred.RELAY_URL = stabile;
  scriviCredenziali(cred);

  const salute = await fetch(stabile + '/api/comando', { headers: { 'X-Relay-Token': cred.RELAY_TOKEN } })
    .then((r) => r.status).catch(() => 0);
  if (salute === 401) {
    fermati('Vercel protegge l indirizzo con un accesso. Apri il progetto casa-google su vercel.com,\n' +
      'Settings, Deployment Protection, e disattiva Vercel Authentication. Poi rilancia.');
  }
  if (salute !== 200) fermati('il programma su Vercel non risponde come dovrebbe (stato ' + salute + ').');
  dici('   pubblicato su ' + stabile + '.\n');

  dici('4. Collegamento al servizio di casa...');
  const casa = leggiFile(join(WORKER, 'credenziali.txt'));
  if (!casa.URL || !casa.CASA_TOKEN) {
    fermati('il servizio di collegamento non e ancora installato.\n' +
      'Esegui prima node worker/installa.mjs, poi rilancia questo comando.');
  }
  const pub = wrangler(['deploy']);
  if (!pub.ok) fermati('non riesco ad aggiornare il servizio di casa:\n' + pub.out);
  for (const [nome, valore] of [['GOOGLE_RELAY_URL', stabile], ['GOOGLE_RELAY_TOKEN', cred.RELAY_TOKEN]]) {
    const r = wrangler(['secret', 'put', nome], valore);
    if (!r.ok) fermati('non riesco a consegnare ' + nome + ' al servizio di casa:\n' + r.out);
  }
  dici('   fatto.\n');

  dici('5. Prova completa, come fara il pannello...');
  let finale = null;
  for (let i = 0; i < 6 && !finale; i++) {
    try {
      const r = await fetch(casa.URL + '/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Casa-Token': casa.CASA_TOKEN },
        body: JSON.stringify({ testo: 'che ore sono' })
      });
      const j = await r.json();
      if (r.ok && j.ok) finale = j;
      else if (i === 5) fermati('la catena completa non risponde: ' + (j.error || r.status));
      else await new Promise((f) => setTimeout(f, 5000));
    } catch (e) {
      if (i === 5) fermati('il servizio di casa non risponde: ' + e.message);
      await new Promise((f) => setTimeout(f, 5000));
    }
  }

  dici('   Google ha risposto' + (finale.risposta ? ': ' + finale.risposta : ', a voce') + '.\n');
  dici('============================================================');
  dici('Fatto. Il pannello ora puo comandare quello che hai in Google Home.');
  dici('Sui tablet chiudi e riapri il pannello: le caselle smettono di dire');
  dici('da collegare. Nella scheda Casa, con Modifica, controlla che il nome');
  dici('in Google Home di ogni dispositivo sia scritto come nell app Google Home.');
  dici('============================================================');
}

main().catch((e) => fermati(e && e.message ? e.message : String(e)));
