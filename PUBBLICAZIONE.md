# Come pubblicare il pannello

Il progetto e gia pronto e configurato. Restano tre passaggi, che vanno
fatti una volta sola.

L indirizzo finale sara:

    https://massimolaurenzi83.github.io/Domoticapp/

## 1. Crea il repository su GitHub

Apri [github.com/new](https://github.com/new) e compila cosi:

| Campo | Valore |
|---|---|
| Repository name | `Domoticapp` |
| Visibilita | **Public** |
| Add a README | **lascia disattivato** |
| Add .gitignore | **lascia su None** |
| Choose a license | **lascia su None** |

I tre "lascia" sono importanti: il progetto ha gia i suoi file e crearne
altri adesso manderebbe in conflitto il primo invio.

Premi **Create repository** e chiudi la pagina che si apre.

## 2. Manda il progetto su GitHub

Apri il terminale nella cartella del progetto ed esegui:

```bash
git push -u origin main
```

Al primo invio ti verranno chieste le credenziali.

GitHub non accetta piu la password dell account. Se si apre una finestra
del browser, accedi da li e hai finito. Se invece il terminale chiede
username e password, allora:

1. Vai su [github.com/settings/tokens](https://github.com/settings/tokens)
2. Premi **Generate new token**, scegli **classic**
3. Dai un nome qualsiasi, per esempio `tablet di casa`
4. Metti la spunta su **repo**
5. Premi **Generate token** e copia il codice che compare
6. Nel terminale, come username scrivi `massimolaurenzi83` e come password
   incolla quel codice

Il codice compare una volta sola: se lo perdi ne generi un altro.

## 3. Accendi la pubblicazione

Vai su:

    https://github.com/massimolaurenzi83/Domoticapp/settings/pages

Nella sezione **Build and deployment**:

- **Source**: scegli `Deploy from a branch`
- **Branch**: scegli `main` e cartella `/ (root)`
- Premi **Save**

Dopo un paio di minuti il sito e online. Se apri l indirizzo e vedi
ancora un errore, aspetta e ricarica: la prima pubblicazione e la piu
lenta.

## 4. Sul tablet

Apri l indirizzo con Chrome sul Galaxy Note. Parte da sola la
configurazione guidata.

Conviene aggiungere la pagina alla schermata Home: dal menu di Chrome,
**Aggiungi a schermata Home**. Aperta da li occupa tutto lo schermo, senza
la barra degli indirizzi.

Sui telefoni fai lo stesso. Sull iPhone e obbligatorio, altrimenti le
notifiche non arrivano: e una regola di Apple.

## Aggiornamenti successivi

Ogni volta che il progetto cambia, bastano tre comandi:

```bash
git add -A
git commit -m "descrizione della modifica"
git push
```

I tablet prendono la versione nuova da soli al successivo caricamento,
perche il codice viene sempre riverificato con il server.

## Cosa finisce online e cosa no

Nel repository ci sono solo il codice e le immagini di esempio. Non ci
finiscono le password delle telecamere, le chiavi delle luci, le foto
della sorveglianza, i promemoria e la lista della spesa: quelli stanno
dentro il tablet oppure nel servizio, e nessuno dei due e pubblico.
