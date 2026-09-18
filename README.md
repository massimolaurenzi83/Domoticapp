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

Metti i file in `photos/` e `wallpapers/`, poi elencali nel rispettivo
`manifest.json`. I nomi vanno scritti come sono sul disco, comprese
maiuscole ed estensione.

```json
{ "photos": ["mare.jpg", { "file": "cena.jpg", "caption": "Agosto 2019" }] }
```

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

## Due pannelli allineati

Promemoria e impostazioni vivono su ogni tablet e vengono allineati tramite
il servizio in `worker/`. Ogni pannello continua a funzionare senza rete e
si riallinea al rientro, quindi lo Xiaomi puo stare via per giorni. Per ogni
campo vince la modifica piu recente. Le cancellazioni viaggiano come
segnaposto, altrimenti un promemoria cancellato qui tornerebbe da la.

Indirizzo e parola condivisa si impostano dal pannello Impostazioni, gruppo
Sincronizzazione, e sono gli unici due valori che restano locali. Lasciandoli
vuoti tutto resta su questo tablet.

Le istruzioni per pubblicare il servizio sono in cima a `worker/index.js`.

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

Il file `test/qa.js` contiene 48 prove funzionali che coprono tutte le aree
del pannello. Le istruzioni per eseguirlo sono scritte in cima al file.

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

## Stato dei collegamenti

| Dispositivo | Come si raggiunge | Stato |
|---|---|---|
| Luci HeySmart | Tuya, dal cloud, da verificare | da collegare |
| Citofono | Tuya, dal cloud | da collegare |
| Nest e Spotify | Spotify Web API | da collegare |
| Broadlink RM4C mini | solo rete locale | in attesa del ponte |
| Presa D-Link | solo rete locale, protocollo HNAP | in attesa del ponte |
| Telecamere fisse | solo rete locale | in attesa del ponte, codice gia pronto |

## Limiti noti del browser

Una pagina web non puo regolare la retroilluminazione, spegnere lo schermo
o riaccenderlo. Quindi la luminosita si ottiene con un velo scuro
sovrapposto, e le ore di riposo portano lo schermo a nero profondo
lasciandolo reattivo al tocco. L'opzione di spegnimento vero rilascia il
blocco e lascia spegnere Android, ma dopo serve il tasto fisico per
riaccendere.
