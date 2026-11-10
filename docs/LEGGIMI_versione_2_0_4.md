# Escape Room Scuola Fassicomo — Webapp 2.0.4

Versione **senza impostazioni dei tempi nell'Admin**: i tempi di gioco e le penalità
sono fissi nel programma.

- Modalità Rapida: 5 livelli, 12 minuti totali, penalità −2:00 per errore.
- Modalità Completa: 8 livelli, 17 minuti totali, penalità −2:30 per errore.

## File della versione

| File | Contenuto |
|------|-----------|
| `index.html` | struttura della pagina (gioco, classifiche, modali) |
| `css/styles.css` | grafica completa, responsive e da stampa |
| `js/levels.js` | 8 livelli × 5 varianti, titoli, tempi e penalità |
| `js/game.js` | motore di gioco, timer, audio, badge finale |
| `js/classifica.js` | classifiche Top 3 e pannello Admin |
| `js/scuola.js` | animazione "SCUOLA FASSICOMO" |
| `data/classifica.json` | classifica inizialmente vuota, da collegare in Admin |
| `server.js` | server statico locale senza dipendenze |
| `tests/run-tests.js` | 67 verifiche automatiche |

## Animazione della scuola

La scritta **SCUOLA FASSICOMO** scende sullo schermo:

- dimensione 32 pixel, spaziatura verticale 35 pixel;
- più scritte contemporanee distribuite su tutta la larghezza;
- velocità diverse per ogni scritta, tra 90 e 175 pixel al secondo;
- posizione e velocità cambiano a ogni nuova discesa;
- le scritte restano dietro al pannello di gioco.

I caratteri Matrix normali non sono stati modificati. Le animazioni si fermano se
il sistema chiede di ridurre il movimento o se la scheda non è visibile.

## Admin

Il pulsante **Admin** si trova sotto le classifiche. Password: `Password.0`

L'Admin contiene: Collega file esistente, Crea file classifica, Riattiva / Salva,
Importa copia (manuale), Scarica backup, Azzera classifica.

Non contiene la possibilità di modificare i tempi totali o le penalità.

## Classifiche

Due classifiche separate — Rapida (5 livelli) e Completa (8 livelli) — con i soli
migliori 3 tempi per modalità.

Il tempo registrato è il tempo reale di completamento (`minuti:secondi.centesimi`),
non il tempo residuo. Le penalità riducono il countdown durante la partita ma non
vengono sommate al risultato. Nessun punteggio, nessuno storico.

## Salvataggio

L'app salva i tempi su **tre livelli**, in ordine di disponibilità:

1. memoria del browser (`localStorage`): sempre attiva, sopravvive alla chiusura
   della scheda;
2. file `classifica.json` collegato in Admin: scrittura automatica a ogni record,
   anche a pannello chiuso (Chrome/Edge su `http://localhost` o HTTPS);
3. importazione ed esportazione manuale del JSON da Admin: funziona su tutti i browser.

Al primo utilizzo: `npm start` → apri <http://localhost:3000> → **Admin** → password
→ **Collega file esistente** → seleziona `data/classifica.json` → autorizza lettura e
scrittura → verifica *Salvataggio automatico attivo*.

Alla riapertura il riferimento al file viene recuperato da IndexedDB: se il permesso
è ancora valido la classifica viene letta da sola, altrimenti serve **Riattiva /
Salva** o una nuova selezione del file.

## Browser consigliato

**Google Chrome** o **Microsoft Edge** desktop, anche su Mac, per il salvataggio
diretto sul file. Safari e Firefox non supportano la File System Access API: in quel
caso l'app usa la memoria del browser e il backup manuale, senza errori bloccanti.

## Verifiche effettuate

- Controllo sintattico di `levels.js`, `classifica.js`, `scuola.js`, `game.js`, `server.js`.
- 67 test automatici con DOM, canvas, `localStorage`, IndexedDB e File System API simulati.
- Esito in `tests/risultati.json` (si rigenera con `npm test`).

Non è stato effettuato un collaudo grafico, audio o dei permessi reali in un browser:
prima dell'evento prova una partita, un record, il salvataggio e la riapertura.
