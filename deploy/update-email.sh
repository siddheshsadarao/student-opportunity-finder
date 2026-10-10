#!/usr/bin/env bash
set -euo pipefail
APP_DIR=/var/www/sof
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ "$(id -u)" -eq 0 ] || { echo 'Run this script as root.'; exit 1; }
[ -f "$APP_DIR/backend/.env" ] || { echo 'Existing backend environment not found.'; exit 1; }
[ -f "$SOURCE_DIR/backend/.env.email" ] || { echo 'Private email configuration missing.'; exit 1; }
BACKUP_DIR="/root/sof-backups/email-$(date +%Y%m%d-%H%M%S)"
install -d -m 700 "$BACKUP_DIR"
cp "$APP_DIR/backend/src/config/env.js" "$BACKUP_DIR/env.js"
if [ -f "$APP_DIR/backend/.env.email" ]; then
  cp "$APP_DIR/backend/.env.email" "$BACKUP_DIR/email.env"
  chmod 600 "$BACKUP_DIR/email.env"
fi
install -o sof -g sof -m 600 "$SOURCE_DIR/backend/.env.email" "$APP_DIR/backend/.env.email"
install -o sof -g sof -m 644 "$SOURCE_DIR/backend/src/config/env.js" "$APP_DIR/backend/src/config/env.js"
systemctl restart sof-api
systemctl is-active --quiet sof-api
echo 'Email configuration updated. sof-api is running.'
echo 'Database environment, frontend, Caddy and nginx were not changed.'
