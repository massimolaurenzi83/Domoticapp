# Collegare il pannello a Spotify

Serve una volta sola, dal computer, circa dieci minuti. Serve Spotify
Premium. Alla fine la scheda Musica di tablet e telefoni mostra cosa suona,
comanda i Nest e fa partire le tue playlist, anche da fuori casa e con il
tablet spento.

## 1. L'app sul sito sviluppatori di Spotify

1. Apri [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
   ed entra con il tuo account Spotify Premium. La prima volta chiede di
   accettare le condizioni per sviluppatori.
2. Premi **Create app** e compila:
   - **App name**: `Casa`
   - **App description**: `Pannello di casa`
   - **Redirect URIs**: scrivi esattamente `http://127.0.0.1:8888/callback`
     e premi **Add**
   - in **Which API/SDKs are you planning to use?** spunta **Web API**
3. Spunta l'accettazione delle condizioni e premi **Save**.

## 2. Il Client ID

Nella pagina dell'app premi **Settings** e copia il **Client ID**, 32
caratteri. Non serve il Client secret: lascialo stare.

## 3. Il collegamento

Dalla cartella del progetto:

```bash
node spotify/autorizza.mjs
```

Incolla il Client ID quando lo chiede. Si apre la pagina di Spotify: premi
**Accetto**. Lo script controlla l'account, elenca gli altoparlanti che
Spotify vede, aggiorna il servizio di casa e rifà la prova da solo.

## Se qualcosa non va

| Messaggio | Cosa fare |
|---|---|
| INVALID_CLIENT o redirect | nell'app Spotify, Redirect URIs deve contenere esattamente `http://127.0.0.1:8888/callback` |
| Spotify rifiuta l'accesso | nell'app Spotify apri **User Management** e aggiungi il tuo nome e l'email del tuo account Spotify |
| non suona niente | scegli il Nest dall'app Spotify sul telefono, icona degli altoparlanti: poi il pannello lo comanda |
| permesso Spotify da rinnovare dal computer | rilancia `node spotify/autorizza.mjs` |

## Come si usa

- Scheda **Musica**: brano in riproduzione, avanti e indietro, pausa,
  volume; tocca un altoparlante per spostarci la musica; tocca una playlist
  per farla partire.
- A voce: "metti la musica in cucina", "ferma la musica", "alza il volume",
  "prossima canzone", "metti la playlist cena in soggiorno".
- La scena **Silenzio** ferma anche Spotify.

Il limite: Spotify mostra ai programmi come questo solo il Nest che sta
suonando. I Nest spenti li trova solo l'app sul telefono, in casa. Quindi
il Nest si sceglie dall'app Spotify; pausa, volume, brani e playlist si
comandano dal pannello, anche da fuori. Anche chiederlo a Google non
funziona: da questa strada Google non accetta comandi di musica.
