#!/usr/bin/env bash
# =============================================================================
#  update_escaperoom.sh — aggiornamento sicuro dell'Escape Room
#
#  Backup del database, aggiornamento del codice, migrazioni, statici e
#  riavvio del solo servizio escaperoom. Nessun'altra webapp viene toccata.
#
#  Uso:
#     sudo ./scripts/update_escaperoom.sh
#     sudo ./scripts/update_escaperoom.sh --no-git     (solo migrazioni + restart)
# =============================================================================

set -Eeuo pipefail

APP_NAME="escaperoom"
DEPLOY_DIR="/srv/escaperoom"
SERVICE_USER="escaperoom"
BACKUP_DIR="${DEPLOY_DIR}/backup"
USE_GIT=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-git) USE_GIT=0; shift ;;
    -h|--help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "Opzione sconosciuta: $1" >&2; exit 1 ;;
  esac
done

log()  { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m[x] %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Esegui lo script con sudo."
[[ -f "${DEPLOY_DIR}/.env" ]] || die "Manca ${DEPLOY_DIR}/.env: esegui prima install_escaperoom.sh"

ENV_RUN=(env $(grep -v '^#' "${DEPLOY_DIR}/.env" | xargs))
cd "$DEPLOY_DIR"

# ------------------------------------------------------------------ backup
log "Backup del database"
mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/escaperoom-${STAMP}.sql.gz"

DB_URL="$(grep '^DATABASE_URL=' .env | cut -d= -f2-)"
if [[ "$DB_URL" == postgres* ]]; then
  PGPASSWORD="$(echo "$DB_URL" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')" \
    pg_dump -h 127.0.0.1 -U escaperoom_user escaperoom_db | gzip > "$BACKUP_FILE"
else
  sqlite3 db.sqlite3 ".backup '/tmp/escaperoom-${STAMP}.sqlite3'" 2>/dev/null \
    && gzip -c "/tmp/escaperoom-${STAMP}.sqlite3" > "$BACKUP_FILE" \
    || warn "Backup SQLite non eseguito (sqlite3 non installato?)"
fi
[[ -s "$BACKUP_FILE" ]] && log "Backup creato: ${BACKUP_FILE}" || die "Backup vuoto: interrompo per sicurezza."

# tiene gli ultimi 14 backup
ls -1t "${BACKUP_DIR}"/escaperoom-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f

# ------------------------------------------------------------------ codice
if [[ "$USE_GIT" -eq 1 ]] && [[ -d .git ]]; then
  log "Aggiornamento del codice da Git"
  sudo -u "$SERVICE_USER" git fetch --all --prune
  sudo -u "$SERVICE_USER" git pull --ff-only
else
  log "Aggiornamento codice saltato (--no-git o repository assente)"
fi

# ------------------------------------------------------------------ dipendenze
log "Dipendenze Python"
sudo -u "$SERVICE_USER" .venv/bin/pip install --quiet -r requirements.txt

# ------------------------------------------------------------------ django
log "Migrazioni"
sudo -u "$SERVICE_USER" "${ENV_RUN[@]}" .venv/bin/python manage.py migrate --noinput

log "File statici"
sudo -u "$SERVICE_USER" "${ENV_RUN[@]}" .venv/bin/python manage.py collectstatic --noinput

log "Controllo di sistema"
sudo -u "$SERVICE_USER" "${ENV_RUN[@]}" .venv/bin/python manage.py check --deploy 2>/dev/null \
  || warn "check --deploy ha segnalato avvisi (non bloccanti)"

log "Pagine del livello 2"
sudo -u "$SERVICE_USER" python3 scripts/genera_pagine_livello2.py --check >/dev/null \
  || sudo -u "$SERVICE_USER" python3 scripts/genera_pagine_livello2.py

# ------------------------------------------------------------------ riavvio
log "Riavvio del servizio ${APP_NAME}"
systemctl restart "$APP_NAME"
sleep 2
systemctl is-active --quiet "$APP_NAME" || {
  journalctl -u "$APP_NAME" -n 40 --no-pager
  die "Servizio non attivo: ripristina il backup ${BACKUP_FILE} se necessario."
}

log "Verifica HTTP"
curl -fsS --max-time 10 "http://127.0.0.1:8002/api/health/" | head -c 200; echo

cat <<EOF

================================================================
Aggiornamento completato.
  Backup: ${BACKUP_FILE}
  Rollback manuale:
    gunzip -c ${BACKUP_FILE} | psql -h 127.0.0.1 -U escaperoom_user escaperoom_db
    sudo systemctl restart ${APP_NAME}
================================================================
EOF
