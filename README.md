# Escape Room Cyber — Scuola Fassicomo

Webapp didattica di cybersicurezza: un escape room a livelli con timer, penalità,
hint, classifiche dei migliori tempi e pannello Admin per il tutor.

Versione **2.0.4** — disponibile in due forme:

| Versione | Dove | Quando usarla |
|----------|------|---------------|
| **Statica** (file singoli) | root del repository | postazione singola, apertura da browser, nessun server |
| **Django multiutente** | `servers/django/` | più squadre in contemporanea, timer validato dal server, classifiche condivise |

Entrambe condividono le stesse **72 domande**: 40 originali + 32 aggiuntive
(4 per livello), con 9 varianti per ciascuno degli 8 livelli.

---

## Avvio rapido

**Con Node.js (consigliato, serve per il salvataggio automatico su file):**

```bash
npm start
```

Poi apri <http://localhost:3000>. Il server ascolta su `0.0.0.0:3000`, quindi funziona
anche dall'host di preview e da altri dispositivi della stessa rete.

Porta diversa: `node server.js --port 8080`.

**Senza Node.js:** apri `index.html` nel browser. Il gioco funziona, ma il
collegamento diretto al file della classifica richiede Chrome o Edge in HTTPS
(`localhost` va bene) e su `file://` il browser blocca la File System Access API.
In quel caso i tempi restano salvati nella memoria del browser e si esporta il
backup JSON dall'Admin.

---

## Installazione sul server Ubuntu (comando unico)

Un solo file, autosufficiente: scarica il progetto da GitHub e installa tutto.

```bash
curl -fsSL -o installa_escape_room.sh \
  https://raw.githubusercontent.com/acollu-rgb/fassicomo-escaperoom-webapp/arena/99b72b86-fassicomo-escaperoom-webapp/installa_escape_room.sh

sudo bash installa_escape_room.sh
```

Alla fine il gioco risponde su `http://IP-DELLA-MACCHINA:8002/`.

**Dove metterlo:** in qualunque cartella, va bene la home (`~/`). Serve solo per
lanciarlo: dopo l'installazione il progetto vive in `/srv/escaperoom/` e il
file può anche essere cancellato.

Opzioni utili:

```bash
sudo bash installa_escape_room.sh --ip 192.168.1.50          # IP fisso della macchina
sudo bash installa_escape_room.sh --admin-password 'Scegli!2026'
sudo bash installa_escape_room.sh --help
```

E' idempotente: rilanciarlo aggiorna il codice senza toccare database e partite.

## Anteprima online (GitHub Pages)

La versione **statica** è pubblicata qui:

**https://acollu-rgb.github.io/fassicomo-escaperoom-webapp/**

È un'anteprima reale per provare grafica, domande e flusso di gioco da qualsiasi
browser, anche da telefono. Serve il branch `gh-pages`, che contiene solo i file
del gioco (11 file, 125 KB) e viene aggiornato dal workflow in `.github/workflows/pages.yml`.

Cosa funziona su Pages:

- tutte le 72 domande, i due timer, le penalità, gli hint, il badge finale;
- le classifiche, salvate nella memoria del browser (`localStorage`);
- importazione ed esportazione manuale del JSON dall'Admin.

Cosa **non** funziona su Pages (e perché):

- il salvataggio automatico sul file `classifica.json`: la File System Access API
  richiede Chrome/Edge in contesto sicuro, quindi su Pages i tempi restano comunque
  nella memoria del browser;
- la versione Django multiutente, che ha bisogno di Python, database e server.

Per l'evento serve una delle due installazioni vere: `npm start` su una postazione,
oppure la VM Ubuntu con `install_escaperoom.sh`.

## Struttura del progetto

Elenco completo dei file con il ruolo di ciascuno: [`docs/INDICE_FILE.md`](docs/INDICE_FILE.md).

```
fassicomo-escaperoom-webapp/
├── index.html                 pagina unica dell'app
├── server.js                  server statico senza dipendenze
├── package.json
├── manifest.webmanifest       installazione come app (PWA)
├── css/
│   └── styles.css             foglio di stile completo
├── js/
│   ├── levels.js              contenuti: 8 livelli × 9 varianti (72 domande)
│   ├── classifica.js          classifiche Top 3, Admin, salvataggi
│   ├── scuola.js              animazione "SCUOLA FASSICOMO"
│   └── game.js                motore di gioco, timer, audio, badge
├── assets/
│   ├── logo-fassicomo.svg     logo provvisorio (vedi sotto)
│   └── favicon.svg
├── data/
│   └── classifica.json        classifica iniziale vuota, da collegare
├── tests/
│   ├── run-tests.js           72 verifiche automatiche
│   └── risultati.json         esito dell'ultima esecuzione
├── servers/django/            progetto Django multiutente (vedi il suo README)
└── docs/
    ├── LEGGIMI-originale.txt  istruzioni della versione 2.0.3
    ├── LEGGIMI_versione_2_0_4.md
    └── TEST.txt               esito dei test originali
```

---

## Modalità di gioco

| Modalità | Livelli | Tempo totale | Penalità per errore |
|----------|---------|--------------|---------------------|
| Rapida   | 5       | 12 minuti    | −2:00               |
| Completa | 8       | 17 minuti    | −2:30               |

I tempi sono fissi nel programma (`js/levels.js`, oggetto `modeInfo`): l'Admin non
permette di modificarli.

### I livelli

1. **Crittografia** — cifrario di Cesare, chiave III (con scheda informativa).
2. **Sviluppo web** — ispeziona il codice sorgente e trova il commento `TOKEN`.
3. **Sistemi numerici** — conversione binario → decimale.
4. **Reti di computer** — quiz a risposta multipla.
5. **Cybersecurity e phishing** — quiz a risposta multipla.
6. **Identificazione delle minacce** — quiz a risposta multipla.
7. **Enigma (logical password)** — sequenze logiche.
8. **Keyboard cipher** — codici da tastiera e inversioni.

Ogni livello ha **9 varianti**: dopo un errore il gioco ripropone lo stesso livello con
una variante diversa (mai la stessa appena sbagliata).

---

## Classifiche

- Due classifiche separate: **Rapida** (5 livelli) e **Completa** (8 livelli).
- Solo i **migliori 3 tempi** per modalità. Nessun punteggio, nessuno storico.
- Il tempo registrato è il **tempo reale** di completamento (`minuti:secondi.centesimi`);
  le penalità riducono il countdown durante la partita ma non vengono sommate.
- A parità esatta di tempo resta davanti il risultato registrato prima.
- I podi sono visibili nella schermata iniziale e dopo vittoria o sconfitta, e
  nascosti durante la partita.

### Tre livelli di salvataggio

1. **Memoria del browser** (`localStorage`) — sempre attiva, nessun permesso richiesto.
2. **File `classifica.json`** collegato dall'Admin (Chrome/Edge) — scrittura
   automatica a ogni nuovo record, anche a pannello chiuso.
3. **Import/export manuale** del JSON — funziona su qualsiasi browser.

La cache locale fa da riserva quando il file non è collegato o il permesso scade.

---

## Pannello Admin

Pulsante **Admin** sotto le classifiche. Password: `Password.0`

La password è scritta nel codice: serve a evitare clic accidentali, non è una misura
di sicurezza. Non inserire mai dati sensibili nel nome squadra.

Comandi disponibili:

| Comando | Effetto |
|---------|---------|
| Collega file esistente | Apre `classifica.json` e attiva la scrittura automatica |
| Crea file classifica | Crea un nuovo JSON con i dati correnti |
| Riattiva / Salva | Rinnova il permesso e unisce memoria e file |
| Importa copia (manuale) | Carica un JSON senza collegarlo (solo memoria) |
| Scarica backup | Scarica una copia; non modifica il file collegato |
| Azzera classifica | Svuota memoria e file collegato (con conferma) |

Ogni chiusura — pulsante, `Esc` o clic sullo sfondo — blocca di nuovo l'accesso.

### Primo utilizzo

1. `npm start` e apri `http://localhost:3000`.
2. **Admin** → password → **Collega file esistente**.
3. Seleziona `data/classifica.json` e autorizza lettura e scrittura.
4. Verifica il messaggio *Salvataggio automatico attivo*.

Alla riapertura il riferimento viene recuperato da IndexedDB; se il permesso è
scaduto usa **Riattiva / Salva**.

> Usa una sola scheda/postazione per file. Il controllo delle modifiche esterne non
> trasforma il programma in un database multiutente, e la scrittura locale non
> conferma che un eventuale servizio di sincronizzazione cloud abbia finito.

---

## Audio

Musica e suoni sono sintetizzati in tempo reale con la Web Audio API: nessun file
audio da scaricare. Suoni ed effetti si attivano al primo clic (policy dei browser).
Musica, suoni e volume sono separati; sotto i 10 secondi il countdown prende il
posto della musica con un segnale per ogni secondo.

---

## Accessibilità

- Navigazione da tastiera, `Esc` chiude le finestre, focus visibile.
- `aria-pressed`, `aria-live`, `role="timer"`, `role="radiogroup"` sui controlli.
- Supporto a `prefers-reduced-motion`: le animazioni di sfondo si fermano.
- Layout responsive fino a 320 px; stampa del badge tramite `window.print()`.

---

## Test

```bash
npm test
```

72 verifiche automatiche con DOM, canvas, `localStorage`, IndexedDB e File System
API simulati: sintassi, contenuti dei 72 quesiti, codici delle varianti, ordinamento
delle classifiche, persistenza, penalità, passaggio di livello, game over e badge finale.
L'esito viene scritto in `tests/risultati.json`.

**Non** è stato eseguito un collaudo grafico/audio reale o dei permessi di
scrittura in un browser: prima dell'evento prova una partita completa, un record,
il salvataggio e la riapertura del browser.

---

## Versione Django multiutente

In `servers/django/` c'è il progetto Django completo descritto nella specifica:
modelli, API JSON, 9 pagine del livello 2, comando `seed_questions` con le 72
domande, script di installazione/aggiornamento/backup, unit systemd e configurazione
Nginx sulla porta 8002.

```bash
cd servers/django
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env          # DATABASE_URL vuoto → SQLite
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_questions
.venv/bin/python manage.py runserver 8002
```

Istruzioni complete, API, deploy su Ubuntu 24.04 e risoluzione problemi:
[`servers/django/README.md`](servers/django/README.md).

---

## Logo

`assets/logo-fassicomo.svg` è un logo **provvisorio** creato per questo progetto:
non riproduce il marchio ufficiale della Fondazione Fassicomo. Per l'uso ufficiale
sostituisci i file in `assets/` con il logo originale (SVG o PNG rinominato
`logo-fassicomo.svg` / aggiorna i riferimenti in `index.html` e `js/game.js`).
