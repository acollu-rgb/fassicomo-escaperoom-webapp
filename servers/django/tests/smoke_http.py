#!/usr/bin/env python3
"""
Smoke test HTTP contro un server già avviato.

Uso:
    python tests/smoke_http.py                    # default http://127.0.0.1:8002
    python tests/smoke_http.py http://host:porta

Verifica il percorso reale di un giocatore: pagina iniziale, avvio sessione,
risposte (giuste e sbagliate), completamento, classifica, scadenza, pagine
del livello 2 e file statici. Usa solo la libreria standard.
"""

from __future__ import annotations

import http.cookiejar
import json
import os
import re
import secrets
import sys
import urllib.error
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8002").rstrip("/")

# Ogni esecuzione usa nomi squadra diversi: nessun conflitto con le partite
# rimaste attive da esecuzioni precedenti o da veri giocatori.
RUN = "smoke-" + secrets.token_hex(3)
TEAM_RAPID = f"{RUN}-rapida"
TEAM_COMPLETE = f"{RUN}-completa"
TEAM_EXPIRY = f"{RUN}-scadenza"

PASSED = []
FAILED = []


def check(name, fn):
    try:
        result = fn()
        if result is False:
            raise AssertionError("condizione falsa")
        PASSED.append(name)
        print(f"  \u2713 {name}")
    except Exception as exc:  # noqa: BLE001
        FAILED.append((name, str(exc)))
        print(f"  \u2717 {name} \u2014 {exc}")


class Client:
    """Client HTTP minimale con cookie e header CSRF."""

    def __init__(self, base):
        self.base = base
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar),
            urllib.request.HTTPRedirectHandler(),
        )

    def csrf(self):
        for cookie in self.jar:
            if cookie.name == "csrftoken":
                return cookie.value
        return ""

    def request(self, method, path, data=None, allow_error=False):
        url = self.base + path
        body = None
        headers = {"Accept": "*/*", "User-Agent": "smoke-test/escaperoom"}
        if data is not None:
            body = json.dumps(data).encode()
            headers["Content-Type"] = "application/json"
            headers["X-CSRFToken"] = self.csrf()
            headers["Referer"] = self.base + "/"
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with self.opener.open(req, timeout=20) as response:
                return response.status, response.read(), dict(response.headers)
        except urllib.error.HTTPError as exc:
            if not allow_error:
                return exc.code, exc.read(), dict(exc.headers)
            return exc.code, exc.read(), dict(exc.headers)

    def get(self, path, **kwargs):
        return self.request("GET", path, **kwargs)

    def post(self, path, data, **kwargs):
        return self.request("POST", path, data=data, **kwargs)

    def get_json(self, path):
        status, body, _ = self.get(path)
        return status, json.loads(body or b"{}")

    def post_json(self, path, data):
        status, body, _ = self.post(path, data)
        try:
            return status, json.loads(body or b"{}")
        except json.JSONDecodeError:
            return status, {"raw": body.decode("utf-8", "replace")[:300]}


def normalize(value):
    return " ".join(str(value).split()).strip().upper()


def solve_level(client, session_id, state, questions):
    """Risponde correttamente al livello corrente, restituendo il nuovo stato."""
    question = state["question"]
    if question["type"] == "choice":
        # il server non espone la risposta: la ricaviamo dal seed locale
        status, payload = client.post_json(
            f"/api/session/{session_id}/answer/", {"option_id": question["options"][0]["id"]}
        )
        return payload
    status, payload = client.post_json(
        f"/api/session/{session_id}/answer/", {"answer": questions[question["code"]]}
    )
    return payload


def main():
    print(f"\nSmoke test su {BASE}\n")

    anonymous = Client(BASE)

    # ---------------------------------------------------------- pagine
    status, body, _ = anonymous.get("/")
    check("home raggiungibile", lambda: status == 200 or (_ for _ in ()).throw(AssertionError(status)))
    html = body.decode("utf-8", "replace")
    check("home contiene il modulo di avvio", lambda: "start-form" in html and "team-name" in html)
    check("home contiene le classifiche", lambda: "Migliori tempi" in html)
    check("home contiene logo e CSS", lambda: "/static/img/logo-fassicomo.svg" in html and "/static/css/styles.css" in html)
    check("home espone il token CSRF", lambda: "csrftoken" in anonymous.jar and True or bool(anonymous.csrf()))

    for asset, label in [
        ("/static/css/styles.css", "CSS"),
        ("/static/js/play.js", "JS di gioco"),
        ("/static/js/scuola.js", "animazione scuola"),
        ("/static/img/logo-fassicomo.svg", "logo"),
        ("/media/level2/livello_2_target_f.html", "pagina livello 2f"),
    ]:
        status, body, _ = anonymous.get(asset)
        check(f"{label} servito ({asset})", lambda s=status: s == 200)

    status, payload = anonymous.get_json("/api/health/")
    check("health risponde con 72 domande", lambda: payload.get("questions") == 72)
    check("nessuna risposta corretta nelle API di stato",
          lambda: "correct_answer" not in json.dumps(payload))

    # ---------------------------------------------------------- livello 2: token nel commento
    for letter, token in [("a", "ROOT"), ("f", "SICURO"), ("g", "NETA2026"), ("i", "PING")]:
        status, body, _ = anonymous.get(f"/media/level2/livello_2_target_{letter}.html")
        text = body.decode("utf-8", "replace")
        visible = text.split("<body>", 1)[1]
        visible = re.sub(r"<!--.*?-->", "", visible, flags=re.S)
        check(
            f"pagina 2{letter}: token nel commento e non visibile",
            lambda v=visible, t=token, x=text: (f"<!--" in x and t in x and t not in v),
        )

    # ---------------------------------------------------------- avvio partita rapida
    player = Client(BASE)
    player.get("/")
    status, payload = player.post_json(
        "/api/session/start/", {"team_name": TEAM_RAPID, "mode": "rapid"}
    )
    check("creazione sessione Rapida", lambda: status == 201 and payload.get("ok"))
    session = payload["session"]
    session_id = session["id"]
    check("timer iniziale a 12 minuti", lambda: session["seconds_remaining"] == 720)
    check("cinque livelli in modalità Rapida", lambda: session["total_levels"] == 5)
    check("domanda livello 1 presente", lambda: bool(session["question"]))

    status, duplicate = player.post_json(
        "/api/session/start/", {"team_name": TEAM_RAPID.upper(), "mode": "rapid"}
    )
    check("nome squadra duplicato rifiutato", lambda: status == 409 and duplicate["error"] == "team_name_in_use")

    # ---------------------------------------------------------- risposta errata
    errors_before = session["error_count"]
    status, payload = player.post_json(f"/api/session/{session_id}/answer/", {"answer": "SBAGLIATA"})
    check("risposta errata applica penalità", lambda: payload["session"]["error_count"] == errors_before + 1)
    check("la penalità riduce il timer di 120 s", lambda: payload["session"]["seconds_remaining"] <= 600)
    check("dopo l'errore resta lo stesso livello", lambda: payload["session"]["current_level"] == 1)
    check("dopo l'errore cambia la variante",
          lambda: payload["session"]["question"]["code"] != session["question"]["code"])

    # ---------------------------------------------------------- risposte corrette: serve la banca dati
    sys.path.insert(0, ".")
    from game.seed_data import QUESTIONS  # noqa: E402

    answers = {item["code"]: item["answer"] for item in QUESTIONS}
    choice_answers = {}
    for item in QUESTIONS:
        if item["type"] == "choice":
            choice_answers[item["code"]] = item["answer"]

    state = payload["session"]
    guard = 0
    while state["status"] == "active" and guard < 20:
        guard += 1
        question = state["question"]
        if question["type"] == "choice":
            # individua l'opzione corretta dal testo (il client reale la vede)
            correct_text = choice_answers[question["code"]]
            option_id = next(
                option["id"] for option in question["options"]
                if normalize(option["text"]) == normalize(correct_text)
            )
            status, payload = player.post_json(
                f"/api/session/{session_id}/answer/", {"option_id": option_id}
            )
        else:
            status, payload = player.post_json(
                f"/api/session/{session_id}/answer/", {"answer": answers[question["code"]]}
            )
        state = payload["session"]

    check("partita rapida completata", lambda: state["status"] == "completed")
    check("sessioni completate hanno result_url", lambda: bool(payload.get("result_url")))

    status, body, _ = player.get(f"/partita/{session_id}/risultato/")
    check("pagina risultato mostra il badge", lambda: b"Badge ufficiale hacker" in body)

    status, leaderboard = player.get_json("/api/leaderboard/")
    rapid = leaderboard["leaderboard"]["rapid"]
    check("il tempo rapido entra in classifica", lambda: any(e["team_name"] == TEAM_RAPID for e in rapid))
    check("al massimo tre tempi per modalità", lambda: len(rapid) <= 3)
    check("tempo formattato minuti:secondi.centesimi",
          lambda: bool(re.match(r"^\d{2}:\d{2}\.\d{2}$", rapid[0]["formatted"])))
    check("classifica separata per modalità", lambda: all(e["team_name"] != TEAM_RAPID for e in leaderboard["leaderboard"]["complete"]))

    # ---------------------------------------------------------- partita completa
    player2 = Client(BASE)
    player2.get("/")
    status, payload = player2.post_json(
        "/api/session/start/", {"team_name": TEAM_COMPLETE, "mode": "complete"}
    )
    check("creazione sessione Completa", lambda: status == 201)
    session2 = payload["session"]
    session2_id = session2["id"]
    check("timer iniziale a 17 minuti", lambda: session2["seconds_remaining"] == 1020)
    check("otto livelli in modalità Completa", lambda: session2["total_levels"] == 8)

    state = session2
    guard = 0
    levels_seen = []
    while state["status"] == "active" and guard < 20:
        guard += 1
        question = state["question"]
        levels_seen.append(question["level"])
        if question["type"] == "choice":
            correct_text = choice_answers[question["code"]]
            option_id = next(
                option["id"] for option in question["options"]
                if normalize(option["text"]) == normalize(correct_text)
            )
            status, payload = player2.post_json(
                f"/api/session/{session2_id}/answer/", {"option_id": option_id}
            )
        else:
            status, payload = player2.post_json(
                f"/api/session/{session2_id}/answer/", {"answer": answers[question["code"]]}
            )
        state = payload["session"]

    check("partita completa completata", lambda: state["status"] == "completed")
    check("tutti gli 8 livelli attraversati", lambda: levels_seen == [1, 2, 3, 4, 5, 6, 7, 8])

    # ---------------------------------------------------------- scadenza
    player3 = Client(BASE)
    player3.get("/")
    status, payload = player3.post_json(
        "/api/session/start/", {"team_name": TEAM_EXPIRY, "mode": "rapid"}
    )
    session3_id = payload["session"]["id"]
    check("sessione di scadenza creata", lambda: status == 201)

    # porta il deadline nel passato agendo solo sull'API non è possibile:
    # la scadenza reale è verificata nei test Django (test_expired_session_*).
    check("API rifiuta risposte su sessione inesistente",
          lambda: player3.post_json(
              "/api/session/00000000-0000-0000-0000-000000000000/answer/", {"answer": "X"}
          )[0] == 404)

    # ---------------------------------------------------------- validazioni
    status, payload = player3.post_json("/api/session/start/", {"team_name": "", "mode": "rapid"})
    check("nome vuoto rifiutato", lambda: status == 400)
    status, payload = player3.post_json("/api/session/start/", {"team_name": "X", "mode": "turbo"})
    check("modalità non valida rifiutata", lambda: status == 400 and payload["error"] == "invalid_mode")
    status, payload = player3.post_json("/api/session/start/", {"team_name": "y" * 50, "mode": "rapid"})
    check("nome troppo lungo rifiutato", lambda: status == 400 and payload["error"] == "team_name_too_long")

    status, body, _ = player3.get("/pagina-inesistente/")
    check("pagina inesistente restituisce 404", lambda: status == 404)

    status, body, _ = anonymous.get("/admin/")
    check("Admin protetto da login", lambda: status == 200 and b"login" in body.lower() or status == 302)
    status, body, _ = anonymous.get("/classifica/")
    check("pagina classifica raggiungibile", lambda: b"Classifiche ufficiali" in body)

    # ---------------------------------------------------------- pulizia
    if os.environ.get("DJANGO_SETTINGS_MODULE"):
        try:
            import django

            if not getattr(django, "apps", None) or not django.apps.apps.ready:
                django.setup()
            from game.models import GameSession

            removed = GameSession.objects.filter(team_name__startswith=RUN).count()
            GameSession.objects.filter(team_name__startswith=RUN).delete()
            print(f"  · pulizia: rimosse {removed} sessioni di test ({RUN})")
        except Exception as exc:  # noqa: BLE001
            print(f"  · pulizia non eseguita: {exc}")
    else:
        print(f"  · sessioni di test create con prefisso {RUN} (non rimosse)")

    # ---------------------------------------------------------- riepilogo
    print(f"\nRisultato: {len(PASSED)} superati, {len(FAILED)} falliti su {len(PASSED) + len(FAILED)}\n")
    if FAILED:
        for name, error in FAILED:
            print(f"  ✗ {name}: {error}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
