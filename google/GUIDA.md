# Collegare il pannello a Google Home

Serve una volta sola, dal computer, circa venti minuti. Alla fine le caselle
di luci, televisore, clima e prese comandano davvero, dal tablet e dai
telefoni anche fuori casa. L'app Google Home e i Nest continuano a
funzionare esattamente come prima: il pannello non cambia niente in Google
Home, gli manda solo le stesse frasi che diresti a un Nest.

Cosa non passa da qui:

- la musica sui Nest, che arriverà con il collegamento a Spotify;
- gli annunci sui Nest dall'esterno, che Google non consente;
- il citofono: si prova, ma Google a volte rifiuta di aprire porte e
  serrature a distanza, e in quel caso il pannello lo dice.

## 1. Il progetto su Google Cloud

1. Apri [console.cloud.google.com](https://console.cloud.google.com) ed
   entra con l'account Google che usi per Google Home.
2. In alto, accanto al logo, apri l'elenco dei progetti e premi
   **Nuovo progetto**. Nome: `Casa`. Premi **Crea** e poi seleziona il
   progetto appena creato.

## 2. Il permesso di usare Google Assistant

1. Nel menu a sinistra: **API e servizi**, poi **Libreria**.
2. Cerca `Google Assistant API`, aprila e premi **Abilita**.

## 3. La schermata del permesso

1. Nel menu a sinistra: **Google Auth Platform** (può chiamarsi anche
   **Schermata consenso OAuth**). Premi **Inizia**.
2. Nome dell'app: `Casa`. Email di assistenza: la tua. Avanti.
3. Pubblico: **Esterno**. Avanti.
4. Email di contatto: la tua. Accetta le condizioni e premi **Crea**.
5. Apri **Pubblico** e premi **Pubblica app**, poi conferma.
   Lo stato deve diventare **In produzione**. È importante: in prova, il
   permesso scade dopo sette giorni e il pannello smetterebbe di comandare.

## 4. Il file del client

1. Apri **Client** e premi **Crea client**.
2. Tipo di applicazione: **App desktop**. Nome: `Casa`. Premi **Crea**.
3. Nella finestra che compare premi **Scarica JSON**.
4. Sposta il file scaricato nella cartella `google` del progetto, sul
   computer. Il nome comincia per `client_secret`: lascialo così.

Quel file resta solo sul computer e non viene mai pubblicato su GitHub.

## 5. Vercel, dove gira il programma che parla con Google

Google accetta questi comandi solo con un protocollo che il servizio di
casa non può usare, per questo serve un secondo servizio gratuito.

Dalla cartella del progetto, sul computer:

```bash
npx vercel login
```

Scegli **Continue with GitHub** ed entra con il tuo account GitHub.

## 6. Il collegamento

Sempre dalla cartella del progetto:

```bash
node google/autorizza.mjs
```

Si apre la pagina di Google: entra con l'account di Google Home e dai il
permesso. Google avvisa che l'app non è verificata: tocca **Avanzate** e poi
**Vai a Casa**. È normale per un'app che hai creato tu e usi solo tu.

Lo script fa il resto e alla fine prova un comando innocuo passando da tutta
la catena. Quando dice **Fatto**, chiudi e riapri il pannello sui tablet.

## 7. I nomi dei dispositivi

Nel pannello, scheda **Casa**, tasto **Modifica**: per ogni dispositivo il
campo **Nome in Google Home** deve essere scritto come compare nell'app
Google Home, per esempio `luce soggiorno`. Se un comando non va, il pannello
riporta la risposta di Google, che di solito dice quale nome non ha trovato.

## Se qualcosa non va

| Messaggio | Cosa fare |
|---|---|
| permesso Google da rinnovare dal computer | rilancia `node google/autorizza.mjs --nuovo` |
| permesso negato, API da abilitare | ripeti il punto 2 |
| Google ha risposto: non ho trovato... | correggi il nome in Google Home del dispositivo |
| Vercel protegge l'indirizzo | su vercel.com, progetto casa-google, Settings, Deployment Protection: disattiva Vercel Authentication |
| i comandi partono ma Google risponde sempre in modo generico | nell'app Google Home, impostazioni di Google Assistant, attiva **Risultati personali** |
