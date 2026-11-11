"""
Impostazioni Django — Escape Room Fassicomo.

Tutti i valori sensibili o dipendenti dalla macchina arrivano da variabili
d'ambiente (file `.env`), così nessuna credenziale finisce nel repository.

In produzione va servito da gunicorn dietro Nginx sulla porta 8002
(vedi deploy/nginx/escaperoom.conf).
"""

from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------- ambiente

def env(name, default=None):
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value


def env_bool(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def env_list(name, default=""):
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


def load_dotenv(path):
    """Lettore .env minimale, senza dipendenze esterne."""
    if not Path(path).is_file():
        return
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


load_dotenv(BASE_DIR / ".env")

# ---------------------------------------------------------------- sicurezza

SECRET_KEY = env("DJANGO_SECRET_KEY", "dev-insecure-key-change-me")
DEBUG = env_bool("DJANGO_DEBUG", False)

ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "localhost,127.0.0.1")
CSRF_TRUSTED_ORIGINS = env_list("CSRF_TRUSTED_ORIGINS")

# In sviluppo si accettano host arbitrari (preview, tunnel, IP di rete locale).
# In produzione (DEBUG=False) resta valida solo la lista ALLOWED_HOSTS.
if DEBUG and env_bool("DJANGO_ALLOW_ANY_HOST", True):
    ALLOWED_HOSTS = ["*"]
    if not CSRF_TRUSTED_ORIGINS:
        CSRF_TRUSTED_ORIGINS = ["https://*", "http://*"]

# Nginx inoltra questo header: serve a Django per ricostruire gli URL assoluti
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True

SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = False  # il JS legge il cookie per l'header X-CSRFToken
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

if env_bool("DJANGO_SECURE_COOKIES", False):
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

# ---------------------------------------------------------------- app

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "game",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "escaperoom.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "game.context_processors.game_config",
            ],
        },
    },
]

WSGI_APPLICATION = "escaperoom.wsgi.application"

# ---------------------------------------------------------------- database

DATABASE_URL = env("DATABASE_URL", "")

if DATABASE_URL.startswith("postgres"):
    # formato: postgres://utente:password@host:porta/nome
    from urllib.parse import urlparse

    url = urlparse(DATABASE_URL)
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": url.path.lstrip("/"),
            "USER": url.username,
            "PASSWORD": url.password,
            "HOST": url.hostname or "127.0.0.1",
            "PORT": str(url.port or 5432),
            "CONN_MAX_AGE": 60,
        }
    }
else:
    # fallback per sviluppo locale e per i test automatici
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------- i18n

LANGUAGE_CODE = "it-it"
TIME_ZONE = "Europe/Rome"
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------- statici

STATIC_URL = env("STATIC_URL", "/static/")
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"]

# In test e sviluppo i nomi dei file statici non sono "hashati": evita di
# dipendere dal manifest generato da collectstatic durante i test.
_USE_MANIFEST = not DEBUG and not env_bool("DJANGO_TESTING", False)

STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {
        "BACKEND": (
            "whitenoise.storage.CompressedManifestStaticFilesStorage"
            if _USE_MANIFEST
            else "django.contrib.staticfiles.storage.StaticFilesStorage"
        )
    },
}

# Pagine del livello 2: sono file HTML da ispezionare, serviti come media
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# ---------------------------------------------------------------- sessioni

SESSION_ENGINE = "django.contrib.sessions.backends.db"
SESSION_COOKIE_AGE = 60 * 60 * 8  # il cookie dura 8 ore

# ---------------------------------------------------------------- log

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {"format": "[{asctime}] {levelname} {name}: {message}", "style": "{"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "verbose"},
    },
    "root": {"handlers": ["console"], "level": env("DJANGO_LOG_LEVEL", "INFO")},
    "loggers": {
        "django.request": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "game": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}

# ---------------------------------------------------------------- gioco

# Tempi e penalità: definite QUI (o in SiteSetting da shell) e non
# modificabili dall'interfaccia. Valori in secondi.
GAME_CONFIG = {
    "rapid": {
        "label": "Rapida",
        "levels": 5,
        "total_seconds": int(env("RAPID_TOTAL_SECONDS", 12 * 60)),
        "penalty_seconds": int(env("RAPID_PENALTY_SECONDS", 120)),
    },
    "complete": {
        "label": "Completa",
        "levels": 8,
        "total_seconds": int(env("COMPLETE_TOTAL_SECONDS", 17 * 60)),
        "penalty_seconds": int(env("COMPLETE_PENALTY_SECONDS", 150)),
    },
}

TEAM_NAME_MAX_LENGTH = 40
LEADERBOARD_SIZE = 3

# Minuti di tolleranza oltre i quali una sessione "active" viene marcata
# scaduta anche se nessuno ha chiamato l'API (pulizia periodica).
SESSION_EXPIRY_GRACE_SECONDS = 60
