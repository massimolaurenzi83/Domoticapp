# Lo schermo di casa sulla TV

Serve una volta sola, circa dieci minuti, e si fa dal computer o dal
telefono. Alla fine la scheda TV del pannello ha il tasto **Porta sulla
TV**: il Chromecast mostra le foto della cornice, l'ora, il meteo, i
promemoria, i timer e i messaggi dell'interfono, e dalla scheda Radio la
musica può suonare dalla TV.

Cosa non cambia:

- il televisore: nessuna impostazione viene toccata, il pannello non parla
  mai con la TV;
- il Chromecast: resta com'è, la pagina gira solo finché è aperta e poi
  il Chromecast torna alla sua schermata di sempre;
- per tornare indietro basta cancellare il numero dalle impostazioni del
  pannello.

Il telecomando nella scheda TV (pausa, volume, app) **non** ha bisogno di
questo passaggio: usa il collegamento con Google Home, `google/GUIDA.md`.

## 1. Registrarsi come sviluppatore Cast

Google chiede che le pagine per il Chromecast abbiano un numero di
applicazione. Per averlo serve un account sviluppatore Cast, che costa
**5 dollari una volta sola**.

1. Apri [cast.google.com/publish](https://cast.google.com/publish) ed entra
   con il tuo account Google.
2. Accetta le condizioni e paga i 5 dollari.

## 2. Creare l'applicazione

1. Premi **Add new application**.
2. Scegli **Custom Receiver**.
3. Compila così:

| Campo | Valore |
|---|---|
| Name | `Casa` |
| Receiver Application URL | `https://massimolaurenzi83.github.io/Domoticapp/tv/` |

4. Premi **Save**. Compare il numero dell'applicazione, **otto caratteri**,
   per esempio `A1B2C3D4`. Copialo.

## 3. Renderla utilizzabile dal tuo Chromecast

Ci sono due strade. La prima è la più semplice.

**Pubblicarla.** Accanto all'applicazione premi **Publish**. Da quel
momento funziona su qualunque Chromecast, il tuo compreso. Nessuno la
trova da solo: serve il numero, e senza il tablet di casa la pagina resta
vuota.

**Oppure registrare solo il tuo Chromecast.** Premi **Add new Device** e
scrivi il numero di serie del Chromecast. Lo trovi sull'etichetta del
Chromecast o del suo alimentatore, oppure nell'app Google Home: tocca il
Chromecast, poi l'ingranaggio, poi **Informazioni sul dispositivo**. Dopo
un quarto d'ora riavvia il Chromecast staccando e riattaccando la corrente.

## 4. Scrivere il numero nel pannello

1. Sul tablet apri le **Impostazioni**, gruppo **Televisore**.
2. In **Numero applicazione Cast** scrivi gli otto caratteri.
3. Ricarica la pagina.

Il numero arriva da solo anche sull'altro tablet e sui telefoni.

## 5. Usarlo

Scheda **TV**, tasto **Porta sulla TV**: Chrome apre l'elenco dei
dispositivi, scegli il Chromecast della TV.

Il tasto **Anteprima** mostra nella scheda come apparirà la TV, con le foto
e i dati veri. Funziona anche prima di questa guida.

## Le protezioni per lo schermo

Una TV del 2011 può essere al plasma, e un plasma si segna con le immagini
ferme. Per questo:

- ora e meteo cambiano posto ogni minuto;
- la pagina si chiude da sola dopo le ore scelte nelle impostazioni,
  quattro di fabbrica;
- si chiude all'inizio delle ore di riposo del pannello;
- se il tablet si scollega, dopo dieci minuti si chiude.

## Se qualcosa non va

| Cosa succede | Cosa fare |
|---|---|
| Il tasto Porta sulla TV non compare | manca il numero nelle impostazioni, oppure va ricaricata la pagina |
| "questo browser non sa trasmettere" | serve Chrome; su iPhone non funziona, è una regola di Apple |
| L'elenco non mostra il Chromecast | tablet e Chromecast devono essere sulla stessa rete Wi-Fi |
| Il Chromecast non apre lo schermo di casa | l'applicazione non è pubblicata e il Chromecast non è registrato, punto 3 |
| Le foto non arrivano | la cornice del tablet non ha foto: aggiungile dalle impostazioni, gruppo Cornice |
