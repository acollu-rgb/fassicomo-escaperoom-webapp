#!/usr/bin/env bash
# =============================================================================
#  install_escaperoom.sh — installazione su Ubuntu Server 24.04
#
#  Crea da zero (o completa) l'ambiente per l'Escape Room Fassicomo:
#  utente di sistema, PostgreSQL, virtualenv, .env, migrazioni, statici,
#  domande, superuser, servizio systemd e Nginx sulla porta 8002.
#
#  Idempotente: rilanciato non duplica nulla e non tocca altre applicazioni.
#
#  Uso:
#     sudo ./scripts/install_escaperoom.sh
#     sudo ./scripts/install_escaperoom.sh --admin-password 'ScegliTu!2026'
#     sudo ./scripts/install_escaperoom.sh --domain 192.168.1.50
# =============================================================================

set -Eeuo pipefail

APP_NAME="escaperoom"
DEPLOY_DIR="/srv/escaperoom"
SERVICE_USER="escaperoom"
DB_NAME="escaperoom_db"
DB_USER="escaperoom_user"
NGINX_PORT="8002"
GUNICORN_PORT="8003"
NGINX_SITE="/etc/nginx/sites-available/escaperoom.conf"
SYSTEMD_UNIT="/etc/systemd/system/escaperoom.service"
PYTHON_BIN="python3"

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ADMIN_USER="${ADMIN_USER:-tutor}"
ADMIN_EMAIL="${ADMIN_EMAIL:-tutor@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
SERVER_NAME="${SERVER_NAME:-_}"

# ------------------------------------------------------------------ parametri
while [[ $# -gt 0 ]]; do
  case "$1" in
    --admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
    --admin-user)     ADMIN_USER="$2"; shift 2 ;;
    --admin-email)    ADMIN_EMAIL="$2"; shift 2 ;;
    --domain)         SERVER_NAME="$2"; shift 2 ;;
    -h|--help)        sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Opzione sconosciuta: $1" >&2; exit 1 ;;
  esac
done

log()  { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Esegui lo script con sudo."

if ! command -v lsb_release >/dev/null 2>&1 || [[ "$(lsb_release -rs)" != "24.04" ]]; then
  warn "Sistema diverso da Ubuntu 24.04: proseguo, ma verifica manualmente."
fi

# ------------------------------------------------------------------ pacchetti
log "Aggiornamento pacchetti e installazione dipendenze"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  python3 python3-venv python3-dev \
  postgresql postgresql-contrib libpq-dev \
  nginx git curl build-essential

# ------------------------------------------------------------------ utente
log "Utente di sistema ${SERVICE_USER}"
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi
usermod -aG www-data "$SERVICE_USER"

# ------------------------------------------------------------------ codice
log "Copia del progetto in ${DEPLOY_DIR}"
mkdir -p "$DEPLOY_DIR"
if [[ "$SRC_DIR" != "$DEPLOY_DIR" ]]; then
  rsync -a --delete \
    --exclude '.venv' --exclude 'db.sqlite3' --exclude 'staticfiles' \
    --exclude '__pycache__' --exclude '.env' \
    "$SRC_DIR"/ "$DEPLOY_DIR"/
fi
mkdir -p "$DEPLOY_DIR"/{media/level2,staticfiles,backup,logs}

# ------------------------------------------------------------------ database
log "Database PostgreSQL"
DB_PASSWORD=""
if [[ -f "$DEPLOY_DIR/.env" ]] && grep -q '^DATABASE_URL=postgres' "$DEPLOY_DIR/.env"; then
  DB_PASSWORD="$(grep '^DATABASE_URL=' "$DEPLOY_DIR/.env" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')"
  log "Password del database già presente: la riuso"
fi
if [[ -z "$DB_PASSWORD" ]]; then
  DB_PASSWORD="$(python3 -c 'import secrets,string; print("".join(secrets.choice(string.ascii_letters+string.digits+"-_") for _ in range(40)))')"
fi

sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"
sudo -u postgres psql -c "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';" >/dev/null

sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 \
  || sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"

# PostgreSQL resta in ascolto solo su localhost
PG_CONF="$(sudo -u postgres psql -tAc 'SHOW config_file;')"
if grep -qE "^\s*listen_addresses\s*=\s*'\*'" "$PG_CONF" 2>/dev/null; then
  warn "PostgreSQL è esposto in rete: correggi listen_addresses in ${PG_CONF}"
fi

# ------------------------------------------------------------------ .env
log "File di configurazione .env"
ENV_FILE="$DEPLOY_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(64))')"
  cat > "$ENV_FILE" <<EOF
# Generato da install_escaperoom.sh il $(date -Is) — NON versionare questo file
DJANGO_SECRET_KEY=${SECRET_KEY}
DJANGO_DEBUG=False
ALLOWED_HOSTS=localhost,127.0.0.1,${SERVER_NAME}
CSRF_TRUSTED_ORIGINS=http://${SERVER_NAME}:${NGINX_PORT},http://${SERVER_NAME}
DATABASE_URL=postgres://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}
DJANGO_SETTINGS_MODULE=escaperoom.settings
RAPID_TOTAL_SECONDS=720
RAPID_PENALTY_SECONDS=120
COMPLETE_TOTAL_SECONDS=1020
COMPLETE_PENALTY_SECONDS=150
DJANGO_LOG_LEVEL=INFO
EOF
  chmod 640 "$ENV_FILE"
  log "Creato ${ENV_FILE} (contiene la password del database: non copiarlo nel repository)"
else
  log ".env esistente: lo lascio invariato"
fi
chown "root:${SERVICE_USER}" "$ENV_FILE" 2>/dev/null || true

# ------------------------------------------------------------------ venv
log "Virtualenv e dipendenze Python"
if [[ ! -x "$DEPLOY_DIR/.venv/bin/python" ]]; then
  sudo -u "$SERVICE_USER" "$PYTHON_BIN" -m venv "$DEPLOY_DIR/.venv"
fi
sudo -u "$SERVICE_USER" "$DEPLOY_DIR/.venv/bin/pip" install --quiet --upgrade pip wheel
sudo -u "$SERVICE_USER" "$DEPLOY_DIR/.venv/bin/pip" install --quiet -r "$DEPLOY_DIR/requirements.txt"

# ------------------------------------------------------------------ django
log "Migrazioni, file statici e domande"
cd "$DEPLOY_DIR"
sudo -u "$SERVICE_USER" env $(grep -v '^#' .env | xargs) .venv/bin/python manage.py migrate --noinput
sudo -u "$SERVICE_USER" env $(grep -v '^#' .env | xargs) .venv/bin/python manage.py collectstatic --noinput --clear
sudo -u "$SERVICE_USER" env $(grep -v '^#' .env | xargs) .venv/bin/python manage.py seed_questions --quiet
sudo -u "$SERVICE_USER" env $(grep -v '^#' .env | xargs) .venv/bin/python scripts/genera_pagine_livello2.py

# ------------------------------------------------------------------ superuser
log "Account amministratore Django (${ADMIN_USER})"
if sudo -u "$SERVICE_USER" env $(grep -v '^#' .env | xargs) .venv/bin/python manage.py shell -c \
   "from django.contrib.auth import get_user_model; import sys; sys.exit(0 if get_user_model().objects.filter(username='${ADMIN_USER}').exists() else 1)"; then
  log "Utente ${ADMIN_USER} già presente"
else
  if [[ -z "$ADMIN_PASSWORD" ]]; then
    ADMIN_PASSWORD="$(python3 -c 'import secrets,string; print(secrets.token_urlsafe(12)+"!9")')"
    warn "Password admin generata: ${ADMIN_PASSWORD}"
    warn "Annotala ora: non viene salvata in chiaro da nessuna parte."
  fi
  sudo -u "$SERVICE_USER" env $(grep -v '^#' .env | xargs) \
    DJANGO_SUPERUSER_PASSWORD="$ADMIN_PASSWORD" \
    .venv/bin/python manage.py createsuperuser --noinput \
      --username "$ADMIN_USER" --email "$ADMIN_EMAIL"
fi

# ------------------------------------------------------------------ permessi
chown -R "${SERVICE_USER}:www-data" "$DEPLOY_DIR"
chmod -R g+rX "$DEPLOY_DIR/staticfiles"
chmod 750 "$DEPLOY_DIR/media"

# ------------------------------------------------------------------ systemd
log "Servizio systemd ${APP_NAME}"
install -m 644 "$DEPLOY_DIR/deploy/systemd/escaperoom.service" "$SYSTEMD_UNIT"
systemctl daemon-reload
systemctl enable "$APP_NAME" >/dev/null
systemctl restart "$APP_NAME"
sleep 2
systemctl is-active --quiet "$APP_NAME" || {
  journalctl -u "$APP_NAME" -n 40 --no-pager
  die "Il servizio ${APP_NAME} non è partito."
}

# ------------------------------------------------------------------ nginx
log "Configurazione Nginx sulla porta ${NGINX_PORT}"
sed -e "s#__SERVER_NAME__#${SERVER_NAME}#g" \
    -e "s#__DEPLOY_DIR__#${DEPLOY_DIR}#g" \
    "$DEPLOY_DIR/deploy/nginx/escaperoom.conf" > "$NGINX_SITE"
ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/${APP_NAME}.conf"

# controllo di sintassi senza toccare altri siti
if ! nginx -t; then
  rm -f "/etc/nginx/sites-enabled/${APP_NAME}.conf"
  die "configurazione Nginx non valida: ho rimosso il link, il resto non è stato toccato."
fi
systemctl reload nginx

# ------------------------------------------------------------------ verifica
log "Verifica finale"
if curl -fsS --max-time 10 "http://127.0.0.1:${NGINX_PORT}/api/health/" >/tmp/escaperoom-health.json; then
  cat /tmp/escaperoom-health.json; echo
else
  die "Nessuna risposta da http://127.0.0.1:${NGINX_PORT}/api/health/"
fi

HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${NGINX_PORT}/")"
[[ "$HTTP_CODE" == "200" ]] || die "La home risponde ${HTTP_CODE}"
log "Home OK (HTTP ${HTTP_CODE})"

cat <<EOF

================================================================
Installazione completata.

  Gioco:   http://IP-DELLA-VM:${NGINX_PORT}/
  Admin:   http://IP-DELLA-VM:${NGINX_PORT}/admin/
  Utente:  ${ADMIN_USER}
  Servizio: systemctl status ${APP_NAME}
  Log:      journalctl -u ${APP_NAME} -f

Prossimi passi consigliati:
  1. verifica i tempi in ${DEPLOY_DIR}/.env
  2. imposta ALLOWED_HOSTS con l'IP reale della macchina
  3. fai un backup: ${DEPLOY_DIR}/scripts/backup_escaperoom.sh
================================================================
EOF
