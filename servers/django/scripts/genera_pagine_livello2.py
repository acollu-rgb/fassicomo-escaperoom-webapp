#!/usr/bin/env python3
"""
Genera le 9 pagine del livello 2 (ispezione del codice sorgente).

Uso:
    python scripts/genera_pagine_livello2.py            # crea/aggiorna i file
    python scripts/genera_pagine_livello2.py --check    # verifica senza scrivere

Le pagine finiscono in media/level2/ e contengono il token SOLO dentro un
commento HTML: non compare nel testo visibile, nel title, nella meta
description né nel nome del file.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from game.seed_data import LEVEL2_PAGES, LEVEL_TITLES  # noqa: E402

OUTPUT_DIR = BASE_DIR / "media" / "level2"

PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Terminale {name}</title>
    <meta name="description" content="Terminale riservato agli agenti della Scuola Fassicomo.">
    <style>
        body {{ background: #0d0208; color: #00ff41; font-family: 'Courier New', monospace; padding: 24px; }}
        h1 {{ font-size: 1.4rem; margin-bottom: 8px; }}
        p {{ color: #8fada0; margin: 6px 0; }}
        nav a {{ color: #00ff41; }}
        section {{ border: 1px solid #0f4; border-radius: 8px; padding: 14px; margin: 16px 0; }}
        button {{ background: #00ff41; color: #0d0208; border: 0; padding: 8px 16px; font-weight: bold; cursor: pointer; }}
    </style>
</head>
<body>
    <header>
        <h1>Accesso al settore {name}</h1>
        <p>Rete riservata agli agenti.</p>
    </header>
    <nav>
        <a href="#stato">Stato del sistema</a>
    </nav>
    <main>
        <section id="stato">
            <h2>Controllo connessione</h2>
            <p>Collegamento al terminale attivo.</p>
            <p>Identificazione agente in corso...</p>
{secret_line}
        </section>
        <section id="accesso">
            <button type="button">Accedi</button>
        </section>
    </main>
    <footer>
        <p>Laboratorio di informatica</p>
    </footer>
</body>
</html>
"""


def render(code: str) -> str:
    filename, label, token = LEVEL2_PAGES[code]
    name = code[-1].upper()
    secret_line = f"            <!-- {label}: {token} -->"
    return PAGE_TEMPLATE.format(name=name, secret_line=secret_line)


def main() -> int:
    parser = argparse.ArgumentParser(description="Genera le pagine del livello 2.")
    parser.add_argument("--check", action="store_true", help="verifica senza scrivere")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    problems = []

    for code, (filename, label, token) in LEVEL2_PAGES.items():
        content = render(code)
        path = OUTPUT_DIR / filename

        # controlli di sicurezza: il token non deve essere visibile
        visible = content.split("<body>", 1)[1]
        if token in visible.replace(f"<!-- {label}: {token} -->", ""):
            problems.append(f"{filename}: il token compare fuori dal commento")
        if token.lower() in filename.lower():
            problems.append(f"{filename}: il token è nel nome del file")
        if "<title>" in content and token in content.split("<title>")[1].split("</title>")[0]:
            problems.append(f"{filename}: il token compare nel title")
        if token not in content:
            problems.append(f"{filename}: token assente")
        if content.count("<!--") != 1:
            problems.append(f"{filename}: numero di commenti inatteso")

        if not args.check:
            if path.exists() and path.read_text(encoding="utf-8") == content:
                print(f"  = {filename} (invariato)")
            else:
                path.write_text(content, encoding="utf-8")
                print(f"  + {filename}")

    print(f"\n{len(LEVEL2_PAGES)} pagine in {OUTPUT_DIR}")
    if problems:
        print("\nProblemi trovati:")
        for problem in problems:
            print("  ✗", problem)
        return 1
    print("Controlli superati: i token sono solo dentro i commenti HTML.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
