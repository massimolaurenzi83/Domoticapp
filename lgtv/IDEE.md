# Tutto quello che si può fare con la TV LG

Un elenco completo, per scegliere insieme cosa fare dopo. La TV è una LG LCD
3D del 2011, serie LW, con NetCast 2.0. Per i video ci sono una Fire Stick
4K, condivisa con il proiettore da uno splitter HDMI, e un Chromecast
rotondo.

Regola valida per tutto: le impostazioni della TV non si toccano.

## Già fatto

| Cosa | Dove |
|---|---|
| Telecomando completo sul telefono, con tavoletta per i menu | app, scheda Telecomando |
| Ingressi diretti con i tuoi nomi: HDMI 1 "Fire Stick e proiettore" | app, scheda Telecomando |
| I nove canali principali a un tocco, e numero del canale da scrivere | app, scheda Telecomando |
| Spegnimento programmato, eseguito dal ponte | app, scheda Telecomando |
| Foto, presentazioni, video e musica dal telefono alla TV, senza Chromecast | app, scheda Manda alla TV |
| Radio dalle casse della TV | app, scheda Radio, e browser della TV |
| Prova del 3D, foto 3D fatte con il telefono, conversione 2D→3D della TV | app, scheda 3D, e browser della TV |
| Schermo nel browser della TV: ora, meteo, notizie, radio, foto | `http://<ponte>:8095/tv` |
| Blocco dei codici dei menu di servizio | ponte, sempre attivo |

## Si può fare, con il ponte che c'è già

Ordinati da quanto valgono secondo me.

1. **Galleria 3D.** Su Wikimedia Commons ci sono migliaia di fotografie
   stereoscopiche libere da diritti, anche dell'Ottocento, già nel formato
   lato a lato. Il ponte le prende, la TV le mostra in 3D vero. Mezza
   giornata di lavoro.
2. **Quiz di famiglia.** La domanda compare sulla TV, ognuno risponde dal
   proprio telefono, la TV mostra la classifica. Funziona con il browser
   della TV com'è. Una giornata.
3. **Fire Stick dal telefono.** Il ponte può comandare anche la Fire Stick:
   aprire Netflix, RaiPlay, Prime Video o YouTube con un tocco, pausa,
   tasto Home, e accenderla. Accendendola, se l'HDMI lo lascia passare,
   si accende anche la TV. Serve attivare una voce nelle opzioni
   sviluppatore **della Fire Stick**, non della TV, e la si spegne quando
   vuoi. Una giornata.
4. **Archivio di foto e video sulla TV.** Il ponte si presenta alla TV come
   un archivio: dal menu della TV, con il telecomando LG, si sfogliano le
   cartelle di foto, musica e film che ci sono sul ponte o su un disco USB
   attaccato al ponte. Una giornata.
5. **Volume a cursore e stato.** Il ponte legge il volume della TV e sa se
   sta riproducendo qualcosa: un cursore al posto dei tasti + e −. Poche ore.
6. **Scorciatoie.** Un tasto "Film" che passa all'ingresso della Fire
   Stick e mette il volume giusto, un tasto "Notiziario" che va su Rai 1.
   Poche ore.
7. **Tempo davanti alla TV per i bambini.** Dopo un tempo scelto, la TV si
   spegne da sola, con un avviso un minuto prima. Poche ore.
8. **Schermo di casa sul Chromecast.** È già scritto, nella parte della
   domotica: va spostato qui, senza la domotica. Serve la registrazione
   Google Cast da 5 dollari.

## Si può fare, con qualcosa in più

| Cosa | Cosa serve |
|---|---|
| Accendere la TV dal telefono | un trasmettitore a infrarossi in rete, per esempio il Broadlink che hai già, oppure la Fire Stick come al punto 3 |
| Guida TV con "guarda adesso" che cambia canale | una fonte gratuita e affidabile dei programmi italiani: quelle che ho trovato non sono aggiornate o sono a pagamento |
| Comandi a voce per la TV | il microfono del telefono, da una pagina protetta: va pensato come raggiungere il ponte da lì |

## Non si può fare

| Cosa | Perché |
|---|---|
| Accendere la TV dalla rete | da spenta la TV stacca la rete; le LG del 2011 non hanno il risveglio da rete |
| YouTube, Netflix, RaiPlay dentro la TV | i produttori hanno chiuso le loro app per NetCast; restano Fire Stick e Chromecast |
| Installare app nuove sulla TV | il negozio di LG per queste TV è chiuso, e forzarlo vorrebbe dire toccare il sistema della TV |
| Mostrare lo schermo del telefono sulla TV | la TV del 2011 non ha Miracast; si fa con la Fire Stick |
| Scrivere sulla tastiera del telefono dentro il browser della TV | il telecomando di rete del 2011 non ha la tastiera; c'è solo dal 2012 |
| Cambiare immagine, audio o altre impostazioni dal telefono | si potrebbe, ma è esattamente quello che hai chiesto di non fare |

## Da sapere

- **Splitter HDMI.** Molti splitter bloccano i comandi fra gli apparecchi
  (HDMI-CEC, SimpLink per LG). Se la Fire Stick non riesce ad accendere la
  TV, la causa è probabilmente lo splitter.
- **Sicurezza.** Il telecomando di rete delle LG apre anche i menu di
  servizio della fabbrica, che possono alterare la TV per sempre. Il ponte
  li rifiuta in ogni caso, e le prove lo controllano a ogni modifica.
