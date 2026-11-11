#!/usr/bin/env python
"""Utility di gestione Django per l'Escape Room Fassicomo."""

import os
import sys


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "escaperoom.settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Django non è installato o il virtualenv non è attivo.\n"
            "Attiva l'ambiente con: source .venv/bin/activate\n"
            "oppure installa le dipendenze con: pip install -r requirements.txt"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
