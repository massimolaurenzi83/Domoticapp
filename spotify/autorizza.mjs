// Collegamento del pannello a Spotify, in un colpo solo.
//
// Prima segui spotify/GUIDA.md per creare l app sul sito sviluppatori di
// Spotify. Poi, dalla cartella del progetto:
//
//   node spotify/autorizza.mjs
//
// Lo script:
//   1. ti chiede il Client ID dell app (non e segreto);
//   2. apre la pagina di Spotify dove dai il permesso;
//   3. controlla che l account sia Premium ed elenca gli altoparlanti;
//   4. aggiorna il servizio di casa e gli consegna il permesso;
//   5. rifa la prova passando dal servizio, come fara il pannello.
//
// Il permesso resta solo nel servizio di casa: sul computer non si salva.

import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const QUI = dirname(fileURLToPath(import.meta.url));
const WORKER = join(QUI, '..', 'worker');
const CLIENT_FILE = join(QUI, 'client-id.txt');
const PORTA = 8888;
const REDIRECT = 'http://127.0.0.1:' + PORTA + '/callback';
const SCOPE = [
  'user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing',
  'playlist-read-private', 'playlist-read-collaborative'
].join(' ');

function dici(t) { process.stdout.write(t + '\n'); }
function fermati(t) { dici('\nFERMO: ' + t + '\n'); process.exit(1); }

function chiedi(domanda) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(domanda, (r) => { rl.close(); resolve(r.trim()); }));
}

function apriBrowser(url) {
  try {
    if (process.platform === 'win32') spawn('explorer.exe', [url], { detached: true, stdio: 'ignore' });
    else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' });
    else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
  } catch (e) {}
}

function leggiFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const r of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = r.match(/^([A-Z_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

// ---------- permesso ----------

function chiediPermesso(clientId) {
  return new Promise((resolve, reject) => {
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const stato = randomBytes(12).toString('hex');

    // Su PowerShell lo script si chiudeva da solo mentre aspettava il
    // browser. Questo orologio lo tiene acceso finche non arriva il
    // permesso, per dieci minuti al massimo.
    const vivo = setInterval(() => {}, 1000);
    const scadenza = setTimeout(() => {
      try { server.close(); } catch (e) {}
      reject(new Error('tempo scaduto: il permesso non e arrivato entro dieci minuti. Rilancia il comando.'));
    }, 10 * 60000);
    const fine = (fn) => (v) => { clearInterval(vivo); clearTimeout(scadenza); fn(v); };
    resolve = fine(resolve);
    reject = fine(reject);

    const server = createServer(async (req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
      const errore = u.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body style="font-family:sans-serif;font-size:22px;padding:40px">' +
        (errore ? 'Permesso non concesso. Puoi chiudere questa pagina.'
                : 'Fatto. Puoi chiudere questa pagina e tornare alla finestra nera.') + '</body></html>');
      server.close();
      if (errore) { reject(new Error('Spotify ha risposto: ' + errore)); return; }
      if (u.searchParams.get('state') !== stato) { reject(new Error('risposta di Spotify non riconosciuta')); return; }

      const r = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code', code: u.searchParams.get('code'),
          redirect_uri: REDIRECT, client_id: clientId, code_verifier: verifier
        })
      });
      const j = await r.json().catch(() => ({}));
      if (!j.refresh_token) { reject(new Error('Spotify non ha dato il permesso: ' + (j.error_description || j.error || r.status))); return; }
      resolve({ access: j.access_token, refresh: j.refresh_token });
    });

    server.on('error', (e) => reject(new Error(e.code === 'EADDRINUSE'
      ? 'la porta ' + PORTA + ' e occupata da un altro programma: chiudilo e riprova'
      : e.message)));

    server.listen(PORTA, '127.0.0.1', () => {
      const url = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
        client_id: clientId, response_type: 'code', redirect_uri: REDIRECT, scope: SCOPE,
        state: stato, code_challenge_method: 'S256', code_challenge: challenge
      });
      dici('   Si apre il browser sulla pagina di Spotify. Se non si apre, copia questo indirizzo:\n');
      dici('   ' + url + '\n');
      dici('   Entra con il tuo account Spotify Premium e premi Accetto.');
      dici('   Non chiudere questa finestra: sto aspettando la risposta di Spotify...\n');
      apriBrowser(url);
    });
  });
}

async function spotify(access, percorso) {
  const r = await fetch('https://api.spotify.com/v1' + percorso, { headers: { Authorization: 'Bearer ' + access } });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const motivo = j && j.error && (j.error.message || j.error.reason) || r.status;
    const e = new Error(String(motivo));
    e.status = r.status;
    throw e;
  }
  return j;
}

// ---------- programma principale ----------

async function main() {
  dici('Collegamento del pannello a Spotify\n');

  const casa = leggiFile(join(WORKER, 'credenziali.txt'));
  if (!casa.URL || !casa.CASA_TOKEN) {
    fermati('il servizio di collegamento non e ancora installato. Esegui prima node worker/installa.mjs.');
  }

  dici('1. Client ID dell app Spotify...');
  let clientId = existsSync(CLIENT_FILE) ? readFileSync(CLIENT_FILE, 'utf8').trim() : '';
  if (clientId && !process.argv.includes('--nuovo')) {
    dici('   uso quello gia inserito: ' + clientId.slice(0, 6) + '...\n');
  } else {
    clientId = await chiedi('   Incolla qui il Client ID e premi Invio: ');
  }
  if (!/^[0-9a-f]{32}$/i.test(clientId)) {
    fermati('questo non sembra un Client ID: sono 32 caratteri fra numeri e lettere da a a f.\n' +
      'Lo trovi su developer.spotify.com, nella tua app, alla voce Settings.');
  }
  writeFileSync(CLIENT_FILE, clientId + '\n');

  dici('2. Permesso di Spotify...');
  let perm;
  try { perm = await chiediPermesso(clientId); }
  catch (e) {
    if (/INVALID_CLIENT|redirect/i.test(e.message)) {
      fermati(e.message + '\nControlla che nell app Spotify, in Redirect URIs, ci sia esattamente:\n   ' + REDIRECT);
    }
    fermati(e.message);
  }
  dici('   permesso ricevuto.\n');

  dici('3. Controllo dell account...');
  try {
    const io = await spotify(perm.access, '/me');
    dici('   account: ' + (io.display_name || io.id) + (io.product ? ', abbonamento ' + io.product : ''));
    if (io.product && io.product !== 'premium') {
      dici('   ATTENZIONE: senza Premium Spotify non permette di comandare la musica da fuori.');
    }
    const dev = await spotify(perm.access, '/me/player/devices');
    const lista = (dev && dev.devices) || [];
    if (lista.length) {
      dici('   altoparlanti che Spotify vede adesso:');
      for (const d of lista) dici('     - ' + d.name + (d.is_active ? ' (sta suonando)' : ''));
    } else {
      dici('   Spotify non vede altoparlanti accesi in questo momento. E normale se non');
      dici('   suona niente: fai partire la musica su un Nest dall app Spotify e compariranno.');
    }
    dici('');
  } catch (e) {
    if (e.status === 403) {
      fermati('Spotify rifiuta l accesso: ' + e.message + '.\n' +
        'Nell app su developer.spotify.com apri User Management e aggiungi il tuo nome\n' +
        'e l email del tuo account Spotify, poi rilancia.');
    }
    fermati('Spotify non risponde come dovrebbe: ' + e.message);
  }

  dici('4. Aggiornamento del servizio di casa...');
  const dep = spawnSync('npx', ['--yes', 'wrangler@4', 'deploy'], { cwd: WORKER, encoding: 'utf8', shell: true });
  if (dep.status !== 0) fermati('non riesco ad aggiornare il servizio:\n' + (dep.stdout || '') + (dep.stderr || ''));
  let consegnato = false;
  for (let i = 0; i < 6 && !consegnato; i++) {
    try {
      const r = await fetch(casa.URL + '/spotify/collega', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Casa-Token': casa.CASA_TOKEN },
        body: JSON.stringify({ clientId, refresh: perm.refresh })
      });
      if (r.ok) consegnato = true;
      else await new Promise((f) => setTimeout(f, 5000));
    } catch (e) { await new Promise((f) => setTimeout(f, 5000)); }
  }
  if (!consegnato) fermati('il servizio non accetta il permesso. Riprova fra un paio di minuti.');
  dici('   fatto.\n');

  dici('5. Prova completa, come fara il pannello...');
  const r = await fetch(casa.URL + '/spotify/stato', { headers: { 'X-Casa-Token': casa.CASA_TOKEN } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.collegato) fermati('il servizio non riesce a parlare con Spotify: ' + (j.error || r.status));
  dici('   il servizio parla con Spotify' + (j.titolo ? ', adesso suona: ' + j.titolo : '') + '.\n');

  dici('============================================================');
  dici('Fatto. Nella scheda Musica del pannello e del telefono ora trovi');
  dici('cosa suona, gli altoparlanti e le tue playlist.');
  dici('============================================================');
}

main().catch((e) => fermati(e && e.message ? e.message : String(e)));
