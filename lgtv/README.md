# TV LG

Un'app per la TV LG LCD 3D del 2011, serie LW, separata dalla domotica.
Rende la TV comandabile e utile da telefono e tablet, senza cambiare
nessuna delle sue impostazioni.

| Parte | Dove gira | Cosa fa |
|---|---|---|
| Ponte TV, `ponte/ponte.mjs` | un apparecchio sempre acceso in casa | parla con la TV nella lingua che la TV capisce |
| App, `ponte/web/` | telefono e tablet, dal browser | telecomando, foto, video, musica, radio, 3D |
| Schermo TV, `ponte/tv/` | il browser della TV stessa | ora, meteo, notizie, radio, foto, prova del 3D |

## Perché serve il ponte

Nessuna pagina web può parlare direttamente con una TV del 2011. La TV
accetta i comandi solo in un formato che i browser non sanno mandare, e il
suo browser non apre più i siti protetti di oggi. Il ponte è un piccolo
programma che sta in mezzo: riceve dal telefono e parla con la TV.

Può girare su:

| Apparecchio | Note |
|---|---|
| Raspberry Pi, anche il più piccolo (Zero 2 W, circa 20 euro) | la scelta migliore: sempre acceso, consuma pochissimo |
| Un vecchio telefono Android con Termux | gratis se ne hai uno nel cassetto; va tenuto in carica |
| Il computer di casa | funziona, ma solo finché è acceso |

Serve Node 18 o più recente. Nessuna libreria da installare.

```bash
node lgtv/ponte/ponte.mjs
```

Stampa l'indirizzo da aprire sul telefono, per esempio
`http://192.168.1.50:8095`, e quello per il browser della TV.

## Prima volta

Dall'app, scheda **Collega**:

1. **Cerca la TV**: il ponte la trova da solo sulla rete di casa. Se non la
   trova, si scrive l'indirizzo, che è nel menu Rete della TV.
2. **Mostra il codice sulla TV**: la TV mostra sei cifre. Si scrivono
   nell'app e si tocca **Collega**. Serve una volta sola: il codice resta
   salvato nel ponte.
3. **Nomi degli ingressi**: per esempio "Fire Stick e proiettore" su HDMI 1.
4. Nel browser della TV si apre l'indirizzo che l'app mostra, e lo si
   salva fra i preferiti del browser.

## Cosa c'è

**Telecomando.** Tutti i tasti di uso quotidiano: volume, canali con i
nove principali a un tocco, frecce e OK, una tavoletta su cui scorrere il
dito per muoversi nei menu, riproduzione, tasti colorati, televideo e
sottotitoli. Gli **ingressi si scelgono direttamente**, HDMI 1 o HDMI 2
senza passare dal menu, con i nomi che hai dato tu. Lo **spegnimento
programmato** lo esegue il ponte, quindi il telefono può restare spento.

**Manda alla TV.** Foto, presentazioni, video e musica dal telefono alla
TV, con il DLNA che la TV ha già. Niente Chromecast, niente Fire Stick.

**Radio.** Decine di migliaia di stazioni, dalle casse della TV.

**3D.** La TV è una LG Cinema 3D con occhiali passivi:

- una **prova del 3D** fatta apposta, con scritte dentro e fuori lo schermo;
- **le tue foto in 3D**: due scatti a 6 o 7 centimetri l'uno dall'altro,
  il telefono li affianca e li manda;
- il tasto 3D a portata di mano, anche per la conversione 2D→3D che la TV
  sa fare da sola con qualsiasi foto o video.

**Schermo nel browser della TV.** Ora, meteo di quattro giorni, notizie
ANSA, radio e le foto mandate dal telefono. Si usa con il telecomando LG:
tasti colorati per cambiare sezione, frecce e OK.

## Sicurezza della TV

La regola: **le impostazioni della TV restano quelle di oggi**.

- Il ponte manda **solo tasti di un elenco scelto uno per uno**. Lo stesso
  protocollo di rete apre anche i menu di servizio della fabbrica (EZ
  ADJUST, IN START, Installation, POWER ONLY), che possono alterare la TV
  in modo permanente: quei codici sono rifiutati sempre, da chiunque
  arrivino. Le prove lo verificano.
- Mancano apposta i tasti che cambiano un'impostazione con un tocco solo:
  modo immagine, formato, risparmio energetico.
- I tasti Menu e Q.Menu ci sono, ma nascosti finché non li chiedi: da lì le
  impostazioni le cambieresti tu, come con il telecomando vero. L'app non lo
  fa mai da sola.
- Il collegamento con il codice non cambia niente nella TV.
- La pagina per il browser della TV è leggera apposta: un'immagine alla
  volta e nessuna animazione continua.

## Prove

```bash
node lgtv/prove/prove.mjs
```

Ventisei prove con una TV finta che risponde come una NetCast del 2011:
collegamento, tasti, rifiuto dei codici di servizio, canali, ingressi, spegnimento programmato,
riconnessione dopo uno spegnimento, foto via DLNA, radio, protezioni del
ponte.

## Cosa resta da verificare con la TV vera

Le prove usano una TV finta costruita sulla documentazione e sui programmi
che altri hanno scritto per queste TV. Con la TV vera vanno controllati:

- che il telecomando di rete risponda: le LG del 2011 lo hanno se nella
  lista dell'app ufficiale "LG TV Remote 2011";
- i tasti diretti degli ingressi e del 3D, che vengono dai codici
  dell'infrarosso;
- quali formati video apre il DLNA della TV;
- come se la cava il browser della TV con la pagina.

## Cosa non si può fare

- **Accendere la TV dalla rete**: da spenta la TV stacca la rete. Si spegne
  dall'app, ma per accenderla serve il telecomando, l'HDMI dalla Fire Stick
  o un trasmettitore a infrarossi.
- **YouTube e Netflix dentro la TV**: le loro app per NetCast sono state
  chiuse dai produttori. Restano Fire Stick e Chromecast.
- **Installare app sulla TV**: il negozio di LG per queste TV è chiuso, e
  forzarne l'installazione vorrebbe dire toccare il sistema della TV.
