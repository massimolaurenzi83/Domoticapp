# Casa

Pannello di domotica per un Samsung Galaxy Note 10.1 appeso al muro,
con Android 5.1 e Chrome 95.

## I due punti di controllo

La stessa pagina gira su entrambi i tablet.

| Dispositivo | Ruolo |
|---|---|
| Galaxy Note 10.1, Android 5.1, Chrome 95 | pannello fisso a muro |
| Xiaomi Pad 5 Pro, Android 11 | secondo punto, staccabile e usabile per altro |

Il codice e scritto per Chrome 95, che e il piu vecchio dei due, cosi
funziona su entrambi senza varianti. In pixel CSS i due schermi sono
identici, 1280 per 800, quindi il disegno non cambia.

## Cosa fa oggi

Tre schermate che si alternano da sole.

| Schermata | Quando compare |
|---|---|
| Cornice fotografica | nella finestra diurna, se ci sono foto |
| Stazione meteo | fuori dalla finestra diurna, e al passaggio di una persona |
| Plancia di controllo | al tocco dello schermo |

Dentro la plancia ci sono quattro schede: Casa, Musica, Clima e Agenda.

Il meteo arriva davvero da Open-Meteo, senza chiave e senza registrazione.
I comandi dei dispositivi sono ancora simulati e finiscono nel registro
visibile in fondo al pannello Impostazioni.

## Voce

Il tablet resta in ascolto e risponde quando lo chiami per nome. Il nome
si cambia dalle impostazioni, nel gruppo Voce, e vale da subito.

    Ambrogio accendi la luce in cucina
    Ambrogio metti Spotify in camera
    Ambrogio che tempo fa
    Ambrogio ricordami di comprare il pane domani alle otto

Chrome su Android chiude il microfono dopo pochi secondi di silenzio, per
cui il riconoscimento viene riavviato a ogni chiusura. Il microfono resta
chiuso mentre il tablet parla, cosi non si sente da solo. Il riconoscimento
di Chrome passa dai server di Google e richiede quindi la rete.

## Agenda e profili

I promemoria si dettano col tasto in Agenda oppure chiamando il tablet per
nome. La frase viene interpretata per ricavarne la data, e il risultato si
puo correggere. Ogni promemoria e assegnato a un profilo, che decide su
quale calendario finira.

Il pannello resta aperto a tutti per luci, musica e citofono, perche sono
di casa e non di una persona. Le impostazioni si possono proteggere con un
codice numerico.

## Come provarlo

```bash
python -m http.server 4173
```

Poi apri `http://localhost:4173`.

La fotocamera per il rilevamento presenza funziona solo in HTTPS oppure su
localhost. Sul tablet significa che va usata la versione pubblicata su
GitHub Pages, non un indirizzo locale.

## Le tue immagini

Foto della cornice e sfondi si aggiungono dal tablet stesso, nelle
impostazioni: il tasto apre la galleria, le immagini vengono ridotte alla
misura dello schermo e salvate dentro il tablet. Restano su quel tablet e
non viaggiano verso gli altri dispositivi.

Si possono ancora mettere immagini nelle cartelle `photos/` e `wallpapers/`
del progetto, elencandole nel rispettivo `manifest.json`, ma non serve.

## Microfono e fotocamera

Il tasto con il cerchio nella barra apre un pannello con due interruttori e
un tasto che spegne tutto in un colpo. Sta fuori dalle impostazioni e non
chiede il codice, perche spegnere i sensori non deve mai richiedere di
cercare dentro un menu. Quando uno dei due e spento compare una targhetta
in alto che lo dice, e resta li finche non lo riaccendi.

## Interfono

Dalla casella in Agenda mandi un messaggio a chi e in casa. Il pannello di
la lo legge ad alta voce e lo mostra a schermo, svegliandosi da solo.

Non serve registrare la voce: il tablet legge il testo con la stessa
sintesi che usa per rispondere ai comandi. Un messaggio scritto pesa pochi
byte, arriva sempre, e si puo leggere anche in una stanza rumorosa.

Nelle ore di silenzio, impostabili, il messaggio compare a schermo ma non
viene letto. I messaggi durano un giorno e poi spariscono da soli: sentirsi
dire "torno alle otto" il mattino dopo non serve a nessuno.

## Sentinella

Due modi distinti per la stessa fotocamera.

**Casa abitata.** Il rilevamento sveglia la plancia quando qualcuno si
avvicina. La targhetta in alto dice sempre se la fotocamera e accesa.

**Sentinella armata.** Si arma con un gesto esplicito prima di partire. Da
quel momento la ripresa e silente: nessuna spia, nessun avviso a schermo.
Una telecamera di sicurezza che segnala la propria presenza a chi entra non
serve a niente.

Gli scatti restano dentro il tablet, in IndexedDB, e non su un servizio
esterno. Escono solo una miniatura e l orario, allegati alla notifica, cosi
se il tablet sparisce resta comunque l immagine del momento.

I file vecchi si cancellano da soli dopo i giorni impostati, e comunque
quando lo spazio concesso al browser arriva all ottanta per cento: in quel
caso vengono buttati i piu vecchi, perche e meglio perdere il passato che
smettere di registrare il presente.

### Luce contro persone

Il riconoscimento e costruito per non scattare quando cambia la luce.

| Situazione di prova | Esito |
|---|---|
| luce accesa, scena piu chiara ovunque | ignorata |
| nuvola, scena piu scura ovunque | ignorata |
| rumore del sensore | ignorato |
| persona che attraversa | allarme |

Tre difese in fila: la luminosita media di ogni fotogramma viene sottratta
prima del confronto, cosi uno schiarimento uniforme sparisce; l immagine e
divisa in celle e un cambiamento che le tocca quasi tutte viene riconosciuto
come luce; il movimento deve ripetersi su due fotogrammi di fila.

## Telecamere fisse

Nessun browser sa riprodurre RTSP, quindi i flussi passano da go2rtc sul
Raspberry Pi, che traduce in un formato mostrabile. Il tablet chiede i
flussi al ponte, non alle telecamere, quindi non conserva nessuna password.

Nella scheda Sicurezza aggiungi le telecamere scegliendo la famiglia, cioe
l app con cui le hai configurate. Poi il tasto in fondo genera il file di
configurazione del ponte, chiedendo le password al momento.

| Famiglia | Flusso principale |
|---|---|
| iCSee, XMEye, Xiongmai | `/onvif1` sulla porta 554 |
| XMEye variante | `user=&password=&channel=1&stream=0.sdp` |
| CamHi, CamHiPro | `/livestream/11` |
| V380 | `/live/ch00_0`, spesso da abilitare prima |
| Yoosee | `/onvif1` |
| YCC365 | `/stream1`, spesso da abilitare prima |
| Non lo so | il ponte la interroga e ricava da solo l indirizzo |
| Scritto a mano | indirizzo completo inserito da te |

## Notifiche sui telefoni

Predisposte per entrambi i telefoni, che si comportano diversamente.

| Telefono | Cosa serve |
|---|---|
| Android | concedere il permesso dal tasto nelle impostazioni |
| iPhone | iOS 16.4 o piu recente, e la pagina va aggiunta alla schermata Home e aperta da li |

Su iPhone, finche la pagina resta una scheda dentro Safari, il permesso non
viene nemmeno offerto: e una regola di Apple. Il pannello se ne accorge da
solo e lo spiega invece di fallire in silenzio.

La notifica parte senza contenuto e il lavoratore in background, appena
svegliato, chiede al servizio cosa e successo. Cosi evitiamo di cifrare il
contenuto, che e la parte piu fragile del meccanismo. Insieme all allarme
viaggia una miniatura, mentre gli scatti pieni restano dentro il tablet.

## Dispositivi collegati

Tablet e telefoni si collegano tutti allo stesso servizio. Promemoria,
spesa, messaggi, stanze, impostazioni e stato della sentinella si allineano
fra tutti. Ogni dispositivo funziona anche senza rete e si riallinea quando
torna.

Regole che evitano i guai trovati in collaudo:

- si invia solo quando qualcosa cambia su quel dispositivo, mai come
  conseguenza di un dato appena ricevuto, altrimenti due tablet si
  rimbalzerebbero gli stessi dati all infinito;
- un valore di fabbrica non ha marcatura e non puo sovrascrivere una scelta
  fatta da una persona su un altro dispositivo;
- la sentinella segue l ordine di arrivo al servizio, non l orologio dei
  dispositivi, che si sfasa;
- dimensione dei testi, sfondo, ruolo e credenziali restano propri di ogni
  schermo.

Ogni dispositivo ha un ruolo, scelto in automatico dalla larghezza dello
schermo e modificabile nelle impostazioni. Il pannello usa fotocamera, voce
e sentinella. Il telefono serve a comandare da fuori casa e non accende ne
fotocamera ne microfono.

## Meteo con tre fornitori

Un solo fornitore e un punto di rottura: basta che la rete di casa non
raggiunga quel server e il pannello resta senza meteo per sempre. E
successo davvero, con una rete che raggiungeva tutto tranne quell indirizzo.

Il pannello ne prova tre in ordine finche uno risponde, e ricorda quale ha
funzionato per non ripetere tentativi a vuoto. Ogni sei ore riparte dal
primo, cosi se il problema era passeggero si torna al migliore. Un
fornitore che non risponde entro otto secondi viene scartato.

| Ordine | Fornitore | Note |
|---|---|---|
| 1 | Open-Meteo | il piu completo |
| 2 | met.no | servizio meteorologico norvegese |
| 3 | wttr.in | ultima spiaggia |

Anche la ricerca della citta ha un servizio di scorta, l archivio di
OpenStreetMap.

## Tablet vecchi e certificati

Android 5.1 ha un elenco di enti di certificazione fermo al 2015 e non
riconosce ISRG Root X1, che oggi firma buona parte del web. Il sintomo e
l errore `NET::ERR_CERT_AUTHORITY_INVALID` su quasi tutti i siti.

Il rimedio sta in `certificato/`, pubblicato insieme al pannello: si apre
quella pagina dal tablet e si installa il certificato. Serve un blocco
schermo, perche Android lo pretende, e va tenuto: togliendolo Android
cancella i certificati installati.

## Prima configurazione

Alla prima apertura parte una procedura guidata. Sul tablet principale sono
quattro domande: dove sei, chi vive in casa, come si chiama il tablet e
quali permessi concedere. La citta si cerca per nome e le coordinate le
trova la procedura, non vanno sapute.

Alla fine c'e un bivio. Puoi chiudere subito e usare il pannello cosi
com'e, oppure proseguire con la parte tecnica, che richiede un computer e
una decina di minuti: il servizio di collegamento e le chiavi delle luci.
Ogni passo spiega dove reperire i valori che chiede.

Il secondo tablet fa un percorso di due soli campi, indirizzo del servizio
e parola condivisa, che il principale mostra alla fine. Tutto il resto
arriva da solo.

La procedura si rilancia quando vuoi dal tasto in fondo alle impostazioni.

## Radio

Le stazioni arrivano da Radio Browser, un archivio aperto mantenuto dalla
comunita: nessuna registrazione, nessuna chiave. Si cerca per nome, si
tiene premuto su una stazione per metterla fra le preferite.

L'audio esce dal tablet, non dai Nest: per mandarlo sugli altoparlanti di
casa serve Spotify, che ha la sua scheda.

## Spesa, timer e sveglia

- **Spesa.** Si detta a voce o si scrive. Si allinea fra i due pannelli, e
  una cosa tolta non ricompare dall'altro lato mentre sei alla cassa.
- **Timer.** Da voce o dalla scheda. Le scadenze sono orari assoluti, per
  cui un timer sopravvive al riavvio della pagina senza perdere secondi.
- **Sveglia.** Spenta di fabbrica. Una volta accesa, la luce della camera
  si accende prima dell'orario e la musica parte all'ora esatta.

## Presenza simulata

Spenta di fabbrica. Una volta accesa parte insieme alla sentinella, cioe
quando parti, e si ferma al disarmo spegnendo quello che aveva acceso.

Le accensioni si spostano di qualche decina di minuti ogni giorno, perche
uno schema fisso si riconosce dopo due sere. Gli orari vengono imparati
osservando quando accendete le luci davvero, e finche non ci sono
abbastanza osservazioni si parte da orari plausibili.

## Chi ha suonato

Ogni squillo del citofono lascia l'orario e, quando la fotocamera e
disponibile, uno scatto. Restano distinti gli squilli a cui nessuno ha
risposto.

## Collaudo

Il file `test/qa.js` contiene piu di novanta prove funzionali che coprono tutte le aree
del pannello, da eseguire solo su un pannello di prova. Il file `test/servizio.mjs` prova il
servizio di collegamento sul computer. Le istruzioni per eseguirlo sono scritte in cima al file.

| Area | Prove |
|---|---|
| Impostazioni | 3 |
| Dispositivi | 3 |
| Comandi vocali | 1 su dieci frasi |
| Promemoria | 3 |
| Spesa | 3 |
| Timer | 3 |
| Sveglia | 3 |
| Presenza simulata | 4 |
| Riconoscimento del movimento | 3 |
| Sentinella | 2 |
| Interfono | 4 |
| Telecamere | 2 |
| Citofono | 2 |
| Radio | 2 |
| Meteo | 1 |
| Microfono e fotocamera | 3 |
| Notifiche | 2 |
| Ponte | 1 |
| Configurazione guidata | 1 |
| Interfaccia | 2 |

## Le luci HeySmart

Le luci sono registrate nell app HeySmart, del marchio italiano Konelco.
Quasi tutti i marchi italiani appoggiano i propri apparecchi sulla
infrastruttura Tuya mettendoci sopra la propria veste grafica, ma va
verificato.

La prova dura due minuti: installa l app Smart Life ed entra con le stesse
credenziali di HeySmart. Se le luci compaiono, sono Tuya e si collegano.
Se non compaiono, restano fuori dal pannello insieme al Broadlink e alla
presa, finche non ci sara un ponte in casa.

## Usarlo da fuori casa

Non c e una applicazione da installare e comandare a distanza. C e un solo
indirizzo, e lo apri da dove vuoi: dal tablet al muro, dal secondo tablet,
dal telefono in aeroporto. Ogni dispositivo tiene la sua copia e le copie
si allineano attraverso il servizio.

Questo vuol dire che **senza il servizio configurato ogni dispositivo resta
isolato**. Il pannello funziona lo stesso, ma quello che scrivi sul telefono
non arriva al tablet di casa. Il servizio non e un dettaglio rimandabile: e
esattamente cio che rende possibile il remoto.

Con il servizio attivo, da fuori casa puoi:

| Cosa | Come |
|---|---|
| Vedere e aggiungere promemoria | scheda Agenda |
| Aggiungere cose alla spesa | scheda Spesa |
| Mandare un messaggio a chi e in casa | casella in Agenda, il pannello lo legge ad alta voce |
| Armare o disarmare la sentinella | scheda Sicurezza, anche se sei gia partito |
| Ricevere gli allarmi | notifiche sul telefono |
| Comandare luci e citofono | schede Casa e Musica, quando Tuya sara collegato |

Restano fuori le telecamere fisse, il Broadlink e la presa: quelli parlano
solo dentro casa e aspettano il ponte.

### Chi comanda quando i comandi si accavallano

La sentinella puo essere armata dal telefono e disarmata dal tablet quasi
nello stesso momento. Vince sempre la decisione piu recente, e l ordine lo
stabilisce il servizio con il proprio orologio.

Il motivo e pratico: gli orologi di tablet e telefoni si sfasano di minuti.
Se il confronto usasse l ora dei dispositivi, un tablet avanti di dieci
minuti scarterebbe per sempre i comandi che arrivano dal telefono.

## Sicurezza

### Come e protetto

Il sito e pubblico ma vuoto. Chiunque apra l indirizzo vede un pannello
scollegato: senza la parola condivisa non raggiunge nulla di casa tua, non
vede promemoria ne foto ne comanda luci.

La parola condivisa non si inventa a mano. La procedura ne genera una di
ventiquattro caratteri casuali presi dal generatore crittografico del
browser, perche una parola scelta da una persona si indovina.

Il servizio conta i tentativi sbagliati e blocca chi ne fa dieci di fila
per un quarto d ora. Il confronto della parola scorre sempre tutti i
caratteri, cosi il tempo di risposta non rivela quanti erano giusti.

Le chiavi delle luci entrano nel servizio e non escono piu: nessuna
richiesta puo rileggerle, e sul tablet non vengono mai scritte. Per questo
il campo resta vuoto anche dopo averle inserite.

Le foto della sorveglianza restano dentro il tablet. Esce solo una
miniatura allegata alla notifica.

### Cosa resta scoperto

Onesta su questo, perche nessun sistema e sicuro in assoluto.

**Il tablet e vecchio.** Android 5.1 non riceve correzioni di sicurezza da
anni e Chrome 95 e fermo al 2021. Un dispositivo cosi non va esposto a
internet in entrata e non va usato per la banca. Come pannello di casa va
bene, ma e il punto piu fragile della catena.

**Chi entra in casa comanda il pannello.** E una scelta voluta: un pannello
al muro che chiede la password a ogni luce sarebbe inservibile. Il codice
protegge solo le impostazioni.

**La voce passa dai server di Google.** Il riconoscimento non avviene sul
tablet. Quando il microfono e acceso, cio che viene detto dopo il nome del
pannello viene trascritto da Google. Il tasto tondo in alto lo spegne.

**Le telecamere cinesi vanno isolate.** I loro firmware hanno una storia di
falle note. Vanno bloccate in uscita verso internet dal router: continuano
a funzionare con il ponte dentro casa.

**Chi ruba il tablet ha tutto.** Non c e cifratura locale. Vale la pena
tenere un blocco schermo sul dispositivo.

### Cosa fare in pratica

1. Tieni la parola condivisa quella generata, non accorciarla.
2. Nel router, togli internet in uscita alle telecamere.
3. Non aprire porte del router verso il tablet: non serve, il ponte esce
   da solo verso il servizio.
4. Se un giorno pensi che la parola sia finita in giro, cambiala nel
   servizio e nei due tablet: tutto il resto resta com e.

## Il ponte di casa

Predisposto ma non obbligatorio. Alcuni dispositivi parlano soltanto dentro
la rete di casa e nessuna pagina web puo raggiungerli. Finche non c e un
piccolo computer sempre acceso che faccia da tramite, le loro caselle nel
pannello restano attenuate e dicono "serve il ponte" invece di fingere di
funzionare.

Il giorno che il ponte arriva, basta scriverne l indirizzo nelle
impostazioni e quelle caselle si accendono da sole. Non c e altro da
cambiare.

Il ponte non viene chiamato dal browser: e lui ad aprire una connessione
verso il servizio. Cosi non serve aprire porte sul router.

### Perche le app proprietarie non bastano

| Ecosistema | Interfaccia per altri programmi |
|---|---|
| Tuya | aperta e gratuita, va bene |
| Broadlink | esiste ma richiede una licenza da richiedere, pensata per aziende |
| D-Link mydlink | nessuna interfaccia pubblica |
| iCSee, XMEye | nessuna interfaccia pubblica |
| Google Home | esiste dal 2024 ma solo per app Android e iPhone, non per pagine web |

Le librerie non ufficiali che imitano quelle app esistono, ma si rompono a
ogni aggiornamento del produttore e violano le condizioni d uso. Non sono
una base su cui costruire qualcosa che deve durare.

## Installare il servizio di collegamento

Dal computer, nella cartella del progetto:

```bash
npx wrangler login
node worker/installa.mjs
```

Il primo comando apre il browser per entrare in un account Cloudflare
gratuito. Il secondo crea il deposito dei dati, genera la parola condivisa e
le chiavi delle notifiche, pubblica il servizio e stampa un link. Aperto su
un tablet o un telefono, quel link lo collega in un tocco. Il link e le
credenziali restano anche in `worker/credenziali.txt`, che non viene mai
pubblicato.

Le prove del servizio si eseguono con `node test/servizio.mjs`.

## Stato dei collegamenti

| Cosa | Stato |
|---|---|
| Luci, TV, clima, prese | attraverso Google Home, dopo `google/GUIDA.md` |
| Citofono | si prova attraverso Google Home, che a volte rifiuta di aprire a distanza |
| Musica sui Nest | da collegare con Spotify |
| Broadlink e presa D-Link collegati direttamente | serve il ponte in casa |
| Telecamere fisse | serve il ponte in casa, codice gia pronto |

Finche un dispositivo non e collegato, la sua casella dice "da collegare" e
la voce risponde che non e ancora collegato, invece di fingere.

## Google Home

Il pannello manda a Google Assistant, a nome tuo, le stesse frasi che
diresti a un Nest, per esempio "accendi luce soggiorno". La strada e:

pannello -> servizio di casa su Cloudflare -> programma su Vercel -> Google

Il programma su Vercel (`google/relay`) serve perche Google accetta questi
comandi solo con il protocollo gRPC, che Cloudflare non sa parlare. Il
permesso di Google resta nelle variabili di Vercel e in
`google/credenziali.txt` sul computer; i tablet non lo vedono mai.

- Si installa con `google/GUIDA.md` e `node google/autorizza.mjs`.
- Ogni casella usa il campo "Nome in Google Home" del dispositivo.
- Se Google risponde che non ha trovato il dispositivo, la casella torna
  com'era e il pannello riporta la risposta.
- Le frasi che il pannello non conosce vengono girate a Google, e la
  risposta si legge e si dice.
- Google concede circa cinquecento comandi al giorno: per una casa bastano.

Le prove del programma si eseguono con `node test/ponte-google.mjs`.

## Limiti noti del browser

Una pagina web non puo regolare la retroilluminazione, spegnere lo schermo
o riaccenderlo. Quindi la luminosita si ottiene con un velo scuro
sovrapposto, e le ore di riposo portano lo schermo a nero profondo
lasciandolo reattivo al tocco. L'opzione di spegnimento vero rilascia il
blocco e lascia spegnere Android, ma dopo serve il tasto fisico per
riaccendere.

## Usabilita

- testi e icone piu grandi sui tablet, con dimensione regolabile nelle
  impostazioni;
- tasto Indietro in cima a ogni schermata e finestra;
- la plancia torna alla schermata di riposo dopo un minuto senza tocchi,
  regolabile; la fotocamera che vede qualcuno non la tiene piu aperta;
- quando il microfono e in ascolto compare la scritta In ascolto in basso a
  destra; quando serve un tocco per attivarlo, lo dice;
- stanze, dispositivi, scene, riquadri della schermata principale, foto e
  sfondi si cambiano dal pannello, senza toccare il codice.
