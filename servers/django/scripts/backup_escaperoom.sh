#!/usr/bin/env bash
# =============================================================================
#  backup_escaperoom.sh — backup manuale di database e file media
#
#  Uso:  sudo ./scripts/backup_escaperoom.sh [cartella_destinazione]
#  Cron suggerito (ogni notte alle 23:30):
#    30 23 * * * root /srv/escaperoom/scripts/backup_escaperoom.sh
# =============================================================================

set -Eeuo pipefail

DEPLOY_DIR="/srv/escaperoom"
DEST="${1:-${DEPLOY_DIR}/backup}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$DEST"

DB_URL="$(grep '^DATABASE_URL=' "${DEPLOY_DIR}/.env" | cut -d= -f2-)"
if [[ "$DB_URL" == postgres* ]]; then
  PGPASSWORD="$(echo "$DB_URL" | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#')" \
    pg_dump -h 127.0.0.1 -U escaperoom_user escaperoom_db | gzip > "${DEST}/db-${STAMP}.sql.gz"
  echo "Database: ${DEST}/db-${STAMP}.sql.gz"
fi

tar -czf "${DEST}/media-${STAMP}.tar.gz" -C "$DEPLOY_DIR" media
echo "File media: ${DEST}/media-${STAMP}.tar.gz"

# conserva 30 giorni
find "$DEST" -name 'db-*.sql.gz' -mtime +30 -delete
find "$DEST" -name 'media-*.tar.gz' -mtime +30 -delete
echo "Backup completato."
