# Indice dei file — Escape Room Fassicomo

Elenco dei file presenti nel repository, con il ruolo di ciascuno.
Le righe di questo documento non sono quelle reali dei file: contano come
indicazione sintetica per orientarsi.

> Le due versioni condividono le stesse **72 domande** (40 originali + 32 aggiuntive,
> 9 varianti per ciascuno degli 8 livelli).

---

## 1. Webapp statica (root del repository)

| File | Righe | Ruolo |
|------|-------|-------|
| [`index.html`](index.html) | 113 | pagina unica: gioco, classifiche, pannello Admin |
| [`css/styles.css`](css/styles.css) | 709 | grafica completa, responsive e da stampa |
| [`js/levels.js`](js/levels.js) | 120 | 72 domande, titoli dei livelli, tempi e penalità |
| [`js/game.js`](js/game.js) | 821 | motore di gioco, timer, audio, badge |
| [`js/classifica.js`](js/classifica.js) | 637 | classifiche Top 3, Admin, tre livelli di salvataggio |
| [`js/scuola.js`](js/scuola.js) | 94 | animazione "SCUOLA FASSICOMO" |
| [`data/classifica.json`](data/classifica.json) | 5 | classifica iniziale vuota, da collegare in Admin |
| [`server.js`](server.js) | 130 | server statico senza dipendenze, porta 3000 |
| [`package.json`](package.json) | 25 | comandi `npm start` / `npm test` |
| [`manifest.webmanifest`](manifest.webmanifest) | 24 | installazione come app (PWA) |
| [`tests/run-tests.js`](tests/run-tests.js) | 700+ | 72 verifiche automatiche |

## 2. Progetto Django multiutente (`servers/django/`)

| File | Righe | Ruolo |
|------|-------|-------|
| [`manage.py`](servers/django/manage.py) | 22 | utility Django |
| [`requirements.txt`](servers/django/requirements.txt) | 12 | Django 5.1, Gunicorn, psycopg, WhiteNoise |
| [`.env.example`](servers/django/.env.example) | 18 | modello di configurazione (il `.env` reale non è versionato) |
| [`README.md`](servers/django/README.md) | 294 | installazione, API, deploy, backup, problemi |
| [`escaperoom/settings.py`](servers/django/escaperoom/settings.py) | 240 | configurazione, `GAME_CONFIG`, lettura `.env` |
| [`game/models.py`](servers/django/game/models.py) | 280 | i 7 modelli |
| [`game/services.py`](servers/django/game/services.py) | 362 | timer, penalità, varianti, classifica |
| [`game/views.py`](servers/django/game/views.py) | 237 | pagine HTML + API JSON |
| [`game/seed_data.py`](servers/django/game/seed_data.py) | 244 | le 72 domande, fonte unica |
| [`game/management/commands/seed_questions.py`](servers/django/game/management/commands/seed_questions.py) | 70 | caricamento idempotente |
| [`game/tests.py`](servers/django/game/tests.py) | 400 | 39 test Django |
| [`tests/smoke_http.py`](servers/django/tests/smoke_http.py) | 330 | 45 verifiche HTTP reali |
| [`scripts/install_escaperoom.sh`](servers/django/scripts/install_escaperoom.sh) | 240 | installazione su Ubuntu 24.04 |
| [`scripts/update_escaperoom.sh`](servers/django/scripts/update_escaperoom.sh) | 130 | aggiornamento con backup |
| [`deploy/nginx/escaperoom.conf`](servers/django/deploy/nginx/escaperoom.conf) | 70 | Nginx porta 8002 → Gunicorn 8003 |
| [`deploy/systemd/escaperoom.service`](servers/django/deploy/systemd/escaperoom.service) | 35 | servizio systemd |

### Le 9 pagine del livello 2

[`media/level2/`](servers/django/media/level2/) — ognuna contiene il token **solo**
in un commento HTML.

| File | Etichetta del commento | Token |
|------|------------------------|-------|
| `livello_2_target_a.html` | TOKEN | ROOT |
| `livello_2_target_b.html` | TOKEN | ADMIN |
| `livello_2_target_c.html` | TOKEN | CYBER |
| `livello_2_target_d.html` | TOKEN | FIREWALL |
| `livello_2_target_e.html` | TOKEN | TOKEN |
| `livello_2_target_f.html` | ACCESSO | SICURO |
| `livello_2_target_g.html` | PASSWORD TEMPORANEA | NETA2026 |
| `livello_2_target_h.html` | CODICE DI SBLOCCO | FLASH |
| `livello_2_target_i.html` | CHIAVE DI RETE | PING |

## 3. Documentazione

| File | Contenuto |
|------|-----------|
| [`README.md`](README.md) | panoramica, avvio, struttura, classifica, test |
| [`docs/LEGGIMI_versione_2_0_4.md`](docs/LEGGIMI_versione_2_0_4.md) | note di versione |
| [`docs/LEGGIMI-originale.txt`](docs/LEGGIMI-originale.txt) | istruzioni originali 2.0.3 |
| [`docs/TEST.txt`](docs/TEST.txt) | riepilogo delle verifiche |
| [`tests/risultati.json`](tests/risultati.json) | esito dettagliato dell'ultima esecuzione |

---

## Verifiche

| Suite | Comando | Esito |
|-------|---------|-------|
| App statica | `npm test` | 72 / 72 |
| Django | `DJANGO_TESTING=1 .venv/bin/python manage.py test game` | 39 / 39 |
| HTTP reale | `.venv/bin/python tests/smoke_http.py` | 45 / 45 |

Il test `stesse 72 domande e risposte del seed Django` confronta `js/levels.js` con
`game/seed_data.py`: le due versioni non possono divergere sui contenuti.
