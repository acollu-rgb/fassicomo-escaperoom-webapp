#!/usr/bin/env bash
# =============================================================================
#  installa_escape_room.sh — installazione completa su Ubuntu Server 24.04
#
#  Questo file è AUTOSUFFICIENTE: scarica il progetto da GitHub e installa
#  tutto (PostgreSQL, Python, Gunicorn, Nginx, systemd, 72 domande).
#  Non devi aver già scaricato nient'altro.
#
#  DOVE METTERLO SUL SERVER
#    Va bene una qualsiasi cartella: serve solo per lanciarlo.
#    Consigliata la home dell'utente:  /home/NOME_UTENTE/
#
#      cd ~
#      sudo bash installa_escape_room.sh
#
#  ESEMPI
#      sudo bash installa_escape_room.sh
#      sudo bash installa_escape_room.sh --ip 192.168.1.50
#      sudo bash installa_escape_room.sh --ip 192.168.1.50 --admin-password 'Scegli!2026'
#      sudo bash installa_escape_room.sh --help
#      sudo bash installa_escape_room.sh --diagnostica   (stato, non modifica nulla)
#
#  Dopo l'installazione il gioco è su  http://IP-DELLA-MACCHINA:8002/
#
#  Lo script è idempotente: se lo rilanci non duplica nulla e non cancella
#  il database né le partite già giocate.
# =============================================================================

set -Eeuo pipefail

# ---------------------------------------------------------------- parametri
REPO_URL="https://github.com/acollu-rgb/fassicomo-escaperoom-webapp.git"
REPO_BRANCH="arena/99b72b86-fassicomo-escaperoom-webapp"
DEPLOY_DIR="/srv/escaperoom"
WORK_DIR="/tmp/escaperoom-bootstrap"
# nel repository il progetto Django sta in questa sottocartella
SRC_SUBDIR="servers/django"
NGINX_PORT="8002"

SERVER_IP=""
ADMIN_USER="tutor"
ADMIN_EMAIL="tutor@example.com"
ADMIN_PASSWORD=""
SKIP_APT="false"
DIAGNOSTICA="false"

uso() {
  sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ip)             SERVER_IP="$2"; shift 2 ;;
    --admin-user)     ADMIN_USER="$2"; shift 2 ;;
    --admin-email)    ADMIN_EMAIL="$2"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="$2"; shift 2 ;;
    --skip-apt)       SKIP_APT="true"; shift ;;
    --diagnostica)    DIAGNOSTICA="true"; shift ;;
    -h|--help)        uso ;;
    *) echo "Opzione sconosciuta: $1 (usa --help)" >&2; exit 1 ;;
  esac
done

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m  ✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m  ! %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m  ✗ %s\033[0m\n' "$*" >&2; exit 1; }

trap 'die "Interrotto alla riga $LINENO. Rilancia lo script: è idempotente e riprende da dove si era fermato."' ERR

# ---------------------------------------------------------------- diagnostica
if [[ "$DIAGNOSTICA" == "true" ]]; then
  set +e   # la diagnostica non deve mai interrompersi ne' sembrare un errore
  echo "=========== DIAGNOSTICA ESCAPE ROOM ==========="
  echo "data:            $(date -Is)"
  echo "utente:          $(id -un) (uid $(id -u))"
  echo "sistema:         $(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME")"
  echo "python3:         $(python3 --version 2>&1)"
  echo "python3-venv:    $(python3 -c 'import venv; print("presente")' 2>&1)"
  echo "venv su disco:   $(ls -ld "$DEPLOY_DIR/.venv" 2>&1)"
  echo "venv python:     $([[ -x "$DEPLOY_DIR/.venv/bin/python" ]] && echo "eseguibile" || echo "ASSENTE")"
  echo "venv pip:        $([[ -x "$DEPLOY_DIR/.venv/bin/pip" ]] && echo "eseguibile" || echo "ASSENTE")"
  echo "progetto:        $([[ -f "$DEPLOY_DIR/manage.py" ]] && echo "presente" || echo "ASSENTE: $DEPLOY_DIR")"
  echo "requirements:    $(ls -l "$DEPLOY_DIR/requirements.txt" 2>&1)"
  echo ".env:            $(ls -l "$DEPLOY_DIR/.env" 2>&1)"
  echo "TMPDIR (shell):  ${TMPDIR:-<non impostata>}"
  echo "/tmp scrivibile: $([[ -w /tmp ]] && echo si || echo NO)"
  echo "spazio /tmp:     $(df -h /tmp 2>/dev/null | tail -1 | awk '{print $4" liberi"}')"
  echo "spazio /srv:     $(df -h /srv 2>/dev/null | tail -1 | awk '{print $4" liberi"}')"
  echo "cwd attuale:     $(pwd 2>/dev/null || echo INESISTENTE)"
  stato_servizio() { systemctl is-active "$1" 2>/dev/null || echo "assente/non attivo"; }
  echo "postgresql:      $(stato_servizio postgresql)"
  echo "nginx:           $(stato_servizio nginx)"
  echo "servizio:        $(stato_servizio escaperoom)"
  echo
  echo "--- riga di comando usata di recente ---"
  echo "cd $DEPLOY_DIR && runuser -u escaperoom -- .venv/bin/pip install -r requirements.txt"
  echo "==============================================="
  exit 0
fi

# ---------------------------------------------------------------- controlli
log "Controlli preliminari"

[[ $EUID -eq 0 ]] || die "Serve sudo. Usa:  sudo bash $0"

if [[ -r /etc/os-release ]]; then
  . /etc/os-release
  ok "Sistema: ${PRETTY_NAME:-sconosciuto}"
  if [[ "${VERSION_ID:-}" != "24.04" ]]; then
    warn "Consigliato Ubuntu 24.04. Proseguo, ma su altre versioni i pacchetti possono differire."
  fi
else
  warn "Non riesco a leggere /etc/os-release: proseguo."
fi

command -v systemctl >/dev/null || die "systemd non disponibile: questo script serve un server, non un container senza systemd."

ARCH="$(uname -m)"
ok "Architettura: ${ARCH}"

# IP della macchina: usato per ALLOWED_HOSTS, altrimenti il gioco risponde 400
if [[ -z "$SERVER_IP" ]]; then
  SERVER_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}')"
fi
if [[ -z "$SERVER_IP" ]]; then
  SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi
[[ -n "$SERVER_IP" ]] || die "Non riesco a determinare l'IP. Ripeti con:  --ip 192.168.1.50"
ok "Indirizzo IP rilevato: ${SERVER_IP}"

# ---------------------------------------------------------------- pacchetti
if [[ "$SKIP_APT" == "true" ]]; then
  log "Pacchetti: salto (--skip-apt)"
else
  log "Aggiornamento e installazione pacchetti di sistema"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq || die "apt-get update fallito. Controlla la connessione a internet."
  apt-get install -y -qq \
    git curl ca-certificates rsync \
    python3 python3-venv python3-dev \
    postgresql postgresql-contrib libpq-dev \
    nginx build-essential \
    || apt-get install -y -qq \
         git curl ca-certificates \
         python3 python3-venv python3-dev \
         postgresql postgresql-contrib libpq-dev \
         nginx build-essential \
    || die "Installazione pacchetti fallita."
  ok "Pacchetti installati"
fi

# ---------------------------------------------------------------- sorgente
log "Scaricamento del progetto"

# Il download usa curl + tar, presenti anche su Ubuntu minimal.
# git e rsync, se mancano, non sono un problema.
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"

TARBALL="https://codeload.github.com/acollu-rgb/fassicomo-escaperoom-webapp/tar.gz/refs/heads/${REPO_BRANCH}"
log "Scarico ${TARBALL}"
if curl -fsSL --max-time 180 "$TARBALL" -o /tmp/escaperoom.tar.gz; then
  tar -xzf /tmp/escaperoom.tar.gz -C "$WORK_DIR" --strip-components=1 \
    || die "Estrazione dell'archivio fallita."
  ok "Codice scaricato ($(du -sh "$WORK_DIR" | cut -f1))"
elif command -v git >/dev/null 2>&1; then
  warn "Download diretto non riuscito: provo con git"
  git clone --quiet --branch "$REPO_BRANCH" --depth 1 "$REPO_URL" "$WORK_DIR" \
    || die "Nemmeno git è riuscito a scaricare il progetto. La macchina è connessa a internet?"
  ok "Codice scaricato con git"
else
  die "Download fallito e git non disponibile. Controlla la connessione a internet."
fi
rm -f /tmp/escaperoom.tar.gz

# il progetto Django è in $SRC_SUBDIR: è QUELLO che va in /srv, non la radice
PROJECT_SRC="${WORK_DIR}/${SRC_SUBDIR}"
[[ -f "$PROJECT_SRC/manage.py" ]] || die "manage.py non trovato in ${PROJECT_SRC}: struttura del repository inattesa."

mkdir -p "$DEPLOY_DIR"
# Si copia con i percorsi assoluti, SENZA spostare la directory corrente:
# $WORK_DIR viene cancellata subito dopo, e una shell con la cwd inesistente
# fa fallire pip con "OSError: [Errno 2] No such file or directory".
shopt -s dotglob nullglob
for voce in "$PROJECT_SRC"/*; do
  base="$(basename "$voce")"
  case "$base" in
    .git|.venv|db.sqlite3|staticfiles|__pycache__|.env) continue ;;
  esac
  cp -a "$voce" "$DEPLOY_DIR"/
done
shopt -u dotglob nullglob
# gli script di deploy devono essere eseguibili
chmod +x "$DEPLOY_DIR"/scripts/*.sh 2>/dev/null || true
find "$DEPLOY_DIR" -name '__pycache__' -type d -prune -exec rm -rf {} + 2>/dev/null || true
ok "Progetto copiato in ${DEPLOY_DIR} ($(du -sh "$DEPLOY_DIR" | cut -f1))"
rm -rf "$WORK_DIR"
# la cwd non deve mai restare su una cartella cancellata
cd "$DEPLOY_DIR"

if [[ ! -f "$DEPLOY_DIR/manage.py" ]]; then
  die "${DEPLOY_DIR}/manage.py non trovato: copia del progetto incompleta."
fi

# ---------------------------------------------------------------- installazione
log "Avvio dell'installazione"

ARGS=(--domain "$SERVER_IP" --admin-user "$ADMIN_USER" --admin-email "$ADMIN_EMAIL")
if [[ -n "$ADMIN_PASSWORD" ]]; then
  ARGS+=(--admin-password "$ADMIN_PASSWORD")
fi

if ! bash "${DEPLOY_DIR}/scripts/install_escaperoom.sh" "${ARGS[@]}"; then
  die "L'installazione ha segnalato un errore. Vedi il messaggio sopra.

Per capire cosa è successo:
  sudo journalctl -u escaperoom -n 50 --no-pager
  sudo nginx -t
  sudo systemctl status escaperoom --no-pager

Ripeti pure lo script: è idempotente."
fi

# ---------------------------------------------------------------- verifica
log "Verifica finale indipendente"

HEALTH="http://127.0.0.1:${NGINX_PORT}/api/health/"
if curl -fsS --max-time 10 "$HEALTH" >/tmp/escaperoom-verifica.json 2>/dev/null; then
  ok "Il servizio risponde"
  python3 - <<'PY' || true
import json
try:
    d = json.load(open("/tmp/escaperoom-verifica.json"))
    print(f"     domande in archivio: {d.get('questions')}")
    print(f"     partite attive:      {d.get('active_sessions')}")
except Exception:
    pass
PY
else
  warn "Nessuna risposta da ${HEALTH}"
  warn "Controlla:  sudo journalctl -u escaperoom -n 50 --no-pager"
fi

PAGINA_L2="http://127.0.0.1:${NGINX_PORT}/static/level2/livello_2_target_a.html"
if curl -fsS -o /dev/null --max-time 5 "$PAGINA_L2" 2>/dev/null; then
  ok "Pagine del livello 2 raggiungibili"
else
  warn "Pagine del livello 2 non raggiungibili: esegui  cd ${DEPLOY_DIR} && sudo -u escaperoom env \$(grep -v '^#' .env | xargs) .venv/bin/python manage.py collectstatic --noinput"
fi

if command -v systemctl >/dev/null; then
  systemctl is-enabled --quiet escaperoom 2>/dev/null && ok "Servizio abilitato all'avvio"
  systemctl is-active  --quiet escaperoom 2>/dev/null && ok "Servizio attivo"
fi

# ---------------------------------------------------------------- riepilogo
cat <<EOF

================================================================
  INSTALLAZIONE COMPLETATA
================================================================

  Gioco:    http://${SERVER_IP}:${NGINX_PORT}/
  Admin:    http://${SERVER_IP}:${NGINX_PORT}/admin/
  Classifica: http://${SERVER_IP}:${NGINX_PORT}/classifica/

  Utente admin:  ${ADMIN_USER}
$( [[ -n "$ADMIN_PASSWORD" ]] && echo "  Password:      quella scelta da te" || echo "  Password:      generata dallo script — cerca 'Password admin generata' più sopra" )

  Comandi utili
    sudo systemctl status escaperoom      stato del servizio
    sudo systemctl restart escaperoom     riavvio dopo una modifica
    sudo journalctl -u escaperoom -f      log in tempo reale
    sudo nginx -t                          verifica configurazione Nginx

  File importanti
    ${DEPLOY_DIR}/.env                    configurazione (NON condividere)
    ${DEPLOY_DIR}/scripts/backup_escaperoom.sh    backup del database

  Se dagli altri computer della rete non si apre:
    l'IP ${SERVER_IP} non è in ALLOWED_HOSTS. Aggiungilo nel file .env
    alla riga ALLOWED_HOSTS=... poi:  sudo systemctl restart escaperoom

  Se il firewall della macchina è attivo:
    sudo ufw allow ${NGINX_PORT}/tcp

================================================================
EOF
