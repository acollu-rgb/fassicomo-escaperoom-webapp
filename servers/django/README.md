# Escape Room Fassicomo — versione Django multiutente

Webapp **multiutente** dell'Escape Room: più squadre giocano contemporaneamente,
ognuna con il proprio timer e la propria sequenza di domande, con classifiche
unificate sul server.

Questa cartella è il progetto Django da installare su una VM Ubuntu Server 24.04.
Per la versione statica a file singolo vedi la root del repository.

---

## 1. Caratteristiche

- **72 domande** in database (40 originali + 32 aggiuntive, 4 per livello).
- **9 varianti** per livello, assegnate casualmente e mai ripetute dopo un errore.
- **Timer e penalità calcolati dal server**: il browser è solo un visualizzatore.
- Sessioni simultanee isolate da **UUID non prevedibili**.
- Due classifiche Top 3 separate (Rapida 5 livelli / Completa 8 livelli).
- Le risposte corrette **non escono mai dal server** prima della verifica.
- Admin Django per domande, varianti e sessioni; tempi e penalità **non** modificabili.
- Interfaccia identica alla versione statica: Matrix, "SCUOLA FASSICOMO", badge, hint, audio.

### Tempi (fissi, in `settings.py` → `GAME_CONFIG`)

| Modalità | Livelli | Tempo | Penalità |
|----------|---------|-------|----------|
| Rapida   | 5       | 12 min | −2:00    |
| Completa | 8       | 17 min | −2:30    |

Si possono cambiare solo con variabili d'ambiente (`RAPID_TOTAL_SECONDS`, ecc.)
o direttamente in `settings.py`: **non** dall'Admin.

---

## 2. Installazione rapida (VM Ubuntu 24.04)

```bash
# 1. copia il progetto nella VM
sudo mkdir -p /srv/escaperoom
sudo cp -r servers/django/. /srv/escaperoom/

# 2. esegui lo script di installazione
cd /srv/escaperoom
sudo ./scripts/install_escaperoom.sh --admin-password 'UnaPasswordForte!2026'
```

Lo script:

1. aggiorna i pacchetti e installa Python, PostgreSQL, Nginx e dipendenze;
2. crea l'utente di sistema `escaperoom` e `/srv/escaperoom`;
3. crea il database `escaperoom_db` e l'utente `escaperoom_user` con password casuale;
4. scrive `.env` (permessi 640, contiene la password del DB);
5. crea il virtualenv e installa `requirements.txt`;
6. esegue `migrate`, `collectstatic`, `seed_questions` e genera le 9 pagine del livello 2;
7. crea il superuser Django;
8. installa il servizio systemd e la configurazione Nginx;
9. verifica `/api/health/` e la home su `http://127.0.0.1:8002/`.

È **idempotente**: puoi rilanciarlo senza duplicare utenti, database o domande.

### Porte

| Componente | Porta | Visibilità |
|------------|-------|------------|
| Nginx      | 8002  | rete (pubblica verso i partecipanti) |
| Gunicorn   | 8003  | solo `127.0.0.1` |

> La specifica indicava Gunicorn sulla 8002. Ho separato le porte (Nginx 8002 →
> Gunicorn 8003) perché due processi non possono ascoltare sulla stessa porta:
> altrimenti Nginx e Gunicorn entrerebbero in conflitto. L'URL per i giocatori è
> comunque `http://IP-DELLA-VM:8002/` come richiesto.

---

## 3. Installazione manuale

```bash
cd /srv/escaperoom
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env && nano .env        # imposta SECRET_KEY, ALLOWED_HOSTS, DATABASE_URL
.venv/bin/python manage.py migrate
.venv/bin/python manage.py collectstatic --noinput
.venv/bin/python manage.py seed_questions
.venv/bin/python scripts/genera_pagine_livello2.py
.venv/bin/python manage.py createsuperuser
```

### Sviluppo in locale (senza PostgreSQL)

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env      # DATABASE_URL vuoto → SQLite
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_questions
.venv/bin/python manage.py runserver 8002
```

Apri <http://localhost:8002>.

---

## 4. Struttura

```
servers/django/
├── manage.py
├── requirements.txt
├── .env.example                  modello di configurazione (il .env reale non è versionato)
├── escaperoom/
│   ├── settings.py               configurazione, GAME_CONFIG, lettura .env
│   ├── urls.py  wsgi.py  asgi.py
├── game/
│   ├── models.py                 Question, QuestionVariant, QuestionOption,
│   │                             GameSession, SessionQuestion, LeaderboardEntry, SiteSetting
│   ├── services.py               logica di gioco: timer, penalità, varianti, classifica
│   ├── views.py                  pagine HTML + API JSON
│   ├── urls.py  admin.py  tests.py  seed_data.py
│   ├── context_processors.py
│   ├── templatetags/game_tags.py
│   ├── management/commands/seed_questions.py
│   └── migrations/0001_initial.py
├── templates/game/               base, start, level, result, leaderboard, error
├── static/                       css/, js/, img/
├── media/level2/                 9 pagine HTML da ispezionare
├── scripts/
│   ├── install_escaperoom.sh
│   ├── update_escaperoom.sh
│   ├── backup_escaperoom.sh
│   └── genera_pagine_livello2.py
├── deploy/
│   ├── nginx/escaperoom.conf
│   └── systemd/escaperoom.service
└── tests/
    └── smoke_http.py             verifica HTTP contro un server avviato
```

---

## 5. API

| Metodo | Percorso | Descrizione |
|--------|----------|-------------|
| POST | `/api/session/start/` | `{"team_name": "...", "mode": "rapid\|complete"}` → crea sessione |
| GET  | `/api/session/<uuid>/state/` | stato, tempo residuo dal server, domanda corrente |
| POST | `/api/session/<uuid>/answer/` | `{"answer": "..."}` oppure `{"option_id": 12}` |
| GET  | `/api/leaderboard/` | Top 3 delle due modalità |
| GET  | `/api/health/` | controllo rapido (usato da install/update) |
| GET  | `/leaderboard/` | pagina pubblica delle classifiche |

Esempio:

```bash
curl -X POST http://IP:8002/api/session/start/ \
  -H 'Content-Type: application/json' \
  -d '{"team_name":"Falchi","mode":"rapid"}'

curl http://IP:8002/api/session/<UUID>/state/

curl -X POST http://IP:8002/api/session/<UUID>/answer/ \
  -H 'Content-Type: application/json' -d '{"answer":"HACKER"}'
```

Le mutazioni richiedono il cookie CSRF: dall'interfaccia lo gestisce `common.js`.

### Esiti di `answer`

- `correct` → si passa al livello successivo;
- `wrong` → errore +1, penalità applicata, nuova variante dello stesso livello;
- `completed` → ultimo livello superato, tempo registrato;
- `expired` → tempo esaurito (anche per effetto della penalità).

---

## 6. Admin

`http://IP-DELLA-VM:8002/admin/` — solo account staff/superuser.

| Sezione | Cosa puoi fare |
|---------|----------------|
| Domande | modificare testo, risposta, hint, opzioni, attivare/disattivare |
| Varianti | associare pagine HTML al livello 2, attivare/disattivare |
| Sessioni | controllare stato, errori, tempi; segnare scadute/abbandonate |
| Risultati | vedere la classifica, **azzerarla** con l'azione confermata |
| Impostazioni | chiavi generiche (`SiteSetting`) |

Tempi e penalità **non compaiono** come campi modificabili: sono costanti di configurazione.

---

## 7. Comandi utili

```bash
# domande
.venv/bin/python manage.py seed_questions              # idempotente
.venv/bin/python manage.py seed_questions --reset      # ricrea da zero
.venv/bin/python manage.py seed_questions --quiet      # senza elenco

# manutenzione
.venv/bin/python manage.py shell -c "from game.services import expire_stale_sessions; print(expire_stale_sessions())"

# pagine livello 2
.venv/bin/python scripts/genera_pagine_livello2.py --check

# test
DJANGO_TESTING=1 .venv/bin/python manage.py test game -v 2
.venv/bin/python tests/smoke_http.py http://127.0.0.1:8002
```

Il comando `expire_stale_sessions` può essere schedulato ogni minuto:

```cron
* * * * * /srv/escaperoom/.venv/bin/python /srv/escaperoom/manage.py shell -c "from game.services import expire_stale_sessions; expire_stale_sessions()"
```

---

## 8. Backup e aggiornamento

```bash
# backup manuale (database + media)
sudo /srv/escaperoom/scripts/backup_escaperoom.sh

# aggiornamento (backup automatico + migrate + collectstatic + restart)
sudo /srv/escaperoom/scripts/update_escaperoom.sh

# solo migrazioni, senza git
sudo /srv/escaperoom/scripts/update_escaperoom.sh --no-git
```

Ripristino:

```bash
gunzip -c /srv/escaperoom/backup/db-AAAAMMGG-HHMMSS.sql.gz | \
  psql -h 127.0.0.1 -U escaperoom_user escaperoom_db
sudo systemctl restart escaperoom
```

---

## 9. Risoluzione problemi

| Sintomo | Causa probabile | Rimedio |
|---------|-----------------|---------|
| `502 Bad Gateway` | Gunicorn non attivo | `systemctl status escaperoom`, `journalctl -u escaperoom -n 50` |
| `DisallowedHost` | IP non in `ALLOWED_HOSTS` | aggiungi l'IP in `/srv/escaperoom/.env`, poi `systemctl restart escaperoom` |
| `CSRF verification failed` | `CSRF_TRUSTED_ORIGINS` errato | inserisci `http://IP:8002` nel `.env` |
| Pagine del livello 2 in 404 | manca `media/level2/` | `.venv/bin/python scripts/genera_pagine_livello2.py` |
| CSS non aggiornato | statici vecchi o manifest | `manage.py collectstatic --noinput` + `systemctl restart escaperoom` |
| `Nessuna domanda attiva per il livello N` | domande disattivate | Admin → domande → riattiva, oppure `seed_questions` |
| `Nome squadra già in partita` | partita rimasta attiva | Admin → sessioni → segna come scaduta/abbandonata |
| Porta 8002 occupata | altra applicazione sulla VM | `ss -ltnp \| grep 8002`; cambia porta Nginx solo se necessario |

Log:

```bash
sudo journalctl -u escaperoom -f
sudo tail -f /var/log/nginx/escaperoom.error.log
sudo tail -f /srv/escaperoom/logs/gunicorn-error.log
```

---

## 10. Verifiche eseguite

- `manage.py check`: nessun problema.
- **39 test Django** (`manage.py test game`): seed delle 72 domande, idempotenza,
  avvio Rapida/Completa, nome duplicato, nome vuoto/troppo lungo, modalità non valida,
  risposta corretta con avanzamento, risposta errata con penalità di 120/150 s,
  variante diversa dopo l'errore, penalità non sommata al tempo finale,
  completamento a 8 livelli, scelta multipla via `option_id`, sessione scaduta,
  penalità che porta a scadenza, Top 3 ordinata, parità, modalità separate,
  nessuna risposta corretta nelle API, Admin protetto, CSRF obbligatorio.
- **45 smoke test HTTP** (`tests/smoke_http.py`) contro il server reale: pagine,
  asset statici, 9 pagine del livello 2 con token solo nei commenti, partita
  Rapida completa, partita Completa completa, classifiche, validazioni, 404.

### Limiti dichiarati

- Non è stato eseguito un collaudo su VM Ubuntu 24.04 reale: gli script
  (`install_escaperoom.sh`, Nginx, systemd) sono verificati sintatticamente e
  scritti in modo idempotente, ma vanno provati sulla macchina di destinazione.
- I test Django girano su SQLite; PostgreSQL è configurato ma va collaudato in VM.
- Non è stato fatto un collaudo audio/grafico in browser reale.
- Il logo in `static/img/` è un segnaposto tipografico: va sostituito con
  `logo-fassicomo.jpg` ufficiale (vedi nota nel README principale).
