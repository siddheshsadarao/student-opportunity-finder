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

say "Backing up the current application and database"
BACKUP_DIR="/root/sof-backups/$(date +%Y%m%d-%H%M%S)"
install -d -m 700 "$BACKUP_DIR"
sudo -u postgres pg_dump -Fc "$DB_NAME" > "$BACKUP_DIR/database.dump"
tar --exclude='node_modules' --exclude='venv' --exclude='__pycache__' \
  -czf "$BACKUP_DIR/application.tar.gz" -C "$APP_DIR" \
  backend database ingestion recommendation-service
chmod 600 "$BACKUP_DIR/database.dump" "$BACKUP_DIR/application.tar.gz"
ok "backup saved in $BACKUP_DIR"

say "Copying application code (Caddy is not touched)"
for part in backend ingestion recommendation-service database docs; do
    rsync -a --delete \
      --exclude '.env' --exclude 'node_modules' --exclude 'venv' \
      --exclude '__pycache__' --exclude '*.pyc' \
      --exclude '.env.*' --exclude 'storage' --exclude '.run.lock' \
      "$SOURCE_DIR/$part/" "$APP_DIR/$part/"
done
if [ -f "$SOURCE_DIR/backend/.env.email" ]; then
    install -o "$APP_USER" -g "$APP_USER" -m 600 \
      "$SOURCE_DIR/backend/.env.email" "$APP_DIR/backend/.env.email"
fi
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
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" \
  -f "$APP_DIR/database/migration_006_email_resume.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" \
  -f "$APP_DIR/database/migration_007_student_phone.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" \
  -f "$APP_DIR/database/migration_008_remove_demo_opportunities.sql"
install -d -o "$APP_USER" -g "$APP_USER" -m 700 /var/lib/sof/resumes
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" \
  -f "$APP_DIR/database/migration_009_listing_freshness.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$DB_NAME" \
  -f "$APP_DIR/database/migration_010_student_state.sql"
ok "database migration applied"

say "Scheduling hourly listing refresh"
install -m 644 "$SOURCE_DIR/deploy/sof-refresh.service" /etc/systemd/system/sof-refresh.service
install -m 644 "$SOURCE_DIR/deploy/sof-refresh.timer" /etc/systemd/system/sof-refresh.timer
systemctl daemon-reload
systemctl enable --now sof-refresh.timer
ok "hourly timer enabled; overlapping imports are locked out"

say "Restarting only Student Opportunity Finder services"
bash "$SOURCE_DIR/deploy/fix-resume-storage.sh"
systemctl restart sof-api sof-ml
systemctl is-active --quiet sof-api || die "sof-api did not start"
systemctl is-active --quiet sof-ml || die "sof-ml did not start"
ok "sof-api and sof-ml running"

say "Importing all enabled live sources"
cd "$APP_DIR"
if sudo -u "$APP_USER" ./ingestion/venv/bin/python -m ingestion.run; then
    ok "import complete"
else
    printf '    Some sources failed or returned partial results; inspect admin Data sources for errors.\n'
fi

echo
echo "Done. Existing reverse-proxy configuration was not modified."
