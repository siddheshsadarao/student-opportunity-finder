#!/usr/bin/env bash
# Updates an existing /var/www/sof installation from an uploaded project.
# It deliberately does not read, write, reload or restart Caddy/nginx.
set -euo pipefail

APP_DIR="/var/www/sof"
APP_USER="sof"
DB_NAME="student_opportunity_finder"

say() { printf "\n==> %s\n" "$1"; }
ok()  { printf "    ✓ %s\n" "$1"; }
die() { printf "ERROR: %s\n" "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root: sudo bash deploy/update-vps.sh"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$SOURCE_DIR/backend/package.json" ] || die "Run the script from the uploaded project."
[ -d "$APP_DIR" ] || die "$APP_DIR does not exist; use setup-vps.sh for a first install."

say "Copying application code (Caddy is not touched)"
for part in backend ingestion recommendation-service database docs; do
    rsync -a --delete \
      --exclude '.env' --exclude 'node_modules' --exclude 'venv' \
      --exclude '__pycache__' --exclude '*.pyc' \
      "$SOURCE_DIR/$part/" "$APP_DIR/$part/"
done
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
ok "code updated and existing .env files preserved"

say "Installing dependencies"
cd "$APP_DIR/backend"
sudo -u "$APP_USER" npm ci --omit=dev --silent
sudo -u "$APP_USER" "$APP_DIR/ingestion/venv/bin/pip" install -q -r "$APP_DIR/ingestion/requirements.txt"
ok "dependencies ready"

say "Applying source expansion and query indexes"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" \
  -f "$APP_DIR/database/migration_005_source_expansion.sql"
ok "database migration applied"

say "Restarting only Student Opportunity Finder services"
systemctl restart sof-api sof-ml
systemctl is-active --quiet sof-api || die "sof-api did not start"
systemctl is-active --quiet sof-ml || die "sof-ml did not start"
ok "sof-api and sof-ml running"

say "Importing all enabled live sources"
cd "$APP_DIR"
sudo -u "$APP_USER" ./ingestion/venv/bin/python -m ingestion.run
ok "import complete; the existing 6-hour cron will keep it updated"

echo
echo "Done. Existing reverse-proxy configuration was not modified."
