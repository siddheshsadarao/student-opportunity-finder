#!/usr/bin/env bash
# Small backend update; preserves API keys and all uploaded resumes.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo 'Run as root.' >&2; exit 1; }
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR=/var/www/sof
[ -f "$SOURCE_DIR/backend/package.json" ] && [ -d "$APP_DIR/backend" ] || { echo 'Existing SOF installation or release files missing.' >&2; exit 1; }
BACKUP_DIR="/root/sof-backups/resumes-$(date +%Y%m%d-%H%M%S)"
install -d -m 700 "$BACKUP_DIR"
sudo -u postgres pg_dump -Fc student_opportunity_finder > "$BACKUP_DIR/database.dump"
chmod 600 "$BACKUP_DIR/database.dump"
tar --exclude=node_modules -czf "$BACKUP_DIR/backend.tar.gz" -C "$APP_DIR" backend
chmod 600 "$BACKUP_DIR/backend.tar.gz"
rsync -a --exclude='.env*' --exclude=node_modules --exclude=storage \
  "$SOURCE_DIR/backend/" "$APP_DIR/backend/"
chown -R sof:sof "$APP_DIR/backend"
cd "$APP_DIR/backend"
sudo -u sof npm ci --omit=dev --silent
install -d -o sof -g sof -m 755 "$APP_DIR/database"
install -o sof -g sof -m 644 "$SOURCE_DIR/database/migration_010_student_state.sql" "$APP_DIR/database/migration_010_student_state.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d student_opportunity_finder -f "$APP_DIR/database/migration_010_student_state.sql"
bash "$SOURCE_DIR/deploy/fix-resume-storage.sh"
systemctl restart sof-api
systemctl is-active --quiet sof-api
python3 "$SOURCE_DIR/deploy/fix-resume-upload.py"
echo "Resume backend updated. API keys and existing resumes preserved. Backup: $BACKUP_DIR"
