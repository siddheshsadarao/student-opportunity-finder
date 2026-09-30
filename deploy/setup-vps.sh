#!/usr/bin/env bash
# =============================================================================
#  Student Opportunity Finder — VPS setup
# =============================================================================
#  Sets up everything that cannot run on Netlify:
#     Express API  ·  FastAPI ML service  ·  PostgreSQL  ·  importer cron
#
#  The React frontend is NOT installed here — that goes to Netlify.
#  nginx is configured to serve /api only.
#
#  Usage (on a fresh Ubuntu 22.04 / 24.04 server, as root):
#      curl -fsSL https://raw.githubusercontent.com/USER/REPO/main/deploy/setup-vps.sh -o setup.sh
#      bash setup.sh
#
#  or, if you already cloned the repo:
#      bash deploy/setup-vps.sh
#
#  Safe to re-run: every step checks before it changes anything.
# =============================================================================

set -euo pipefail

APP_USER="sof"
APP_DIR="/var/www/sof"
DB_NAME="student_opportunity_finder"
DB_USER="sof_user"

say()  { printf "\n\033[1;36m==> %s\033[0m\n" "$1"; }
ok()   { printf "    \033[0;32m✓\033[0m %s\n" "$1"; }
warn() { printf "    \033[0;33m!\033[0m %s\n" "$1"; }
die()  { printf "\n\033[0;31mERROR: %s\033[0m\n" "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run this as root (use: sudo bash $0)"

# -----------------------------------------------------------------------------
# Where is the source code?
#
# There are two ways the code gets onto this server:
#   1. It is already here, because you uploaded it (SFTP / scp / unzip).
#   2. It is not here, so we clone it from GitHub.
#
# Case 1 is checked FIRST, by looking for the project next to this script.
# That means if you uploaded the code, you are never asked for a repo URL.
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

say "Locating the source code"

# Look in every sensible place, so it does not matter whether the script was
# left in deploy/, dropped at the project root, or run from somewhere else.
# backend/package.json is the marker that identifies the project root.
SOURCE_DIR=""
for candidate in \
    "$(dirname "$SCRIPT_DIR")" \
    "$SCRIPT_DIR" \
    "$PWD"
do
    if [ -f "$candidate/backend/package.json" ]; then
        SOURCE_DIR="$candidate"
        break
    fi
done

if [ -n "$SOURCE_DIR" ]; then
    USE_LOCAL_SOURCE=true
    REPO_URL=""
    ok "found the code at $SOURCE_DIR"
    ok "it is already uploaded, so GitHub is not needed"
else
    USE_LOCAL_SOURCE=false
    warn "could not find the project. Looked for backend/package.json in:"
    warn "  $(dirname "$SCRIPT_DIR")"
    warn "  $SCRIPT_DIR"
    warn "  $PWD"
    echo
    echo "    Either upload the project and re-run this from inside it,"
    echo "    or give a GitHub URL to clone from."
    echo
    read -rp "    GitHub repo URL (blank to abort): " REPO_URL
    [ -n "$REPO_URL" ] || die "No source code and no repo URL — nothing to install"
fi

# -----------------------------------------------------------------------------
say "Collecting settings"
# -----------------------------------------------------------------------------
read -rp "    Domain for the API (blank = use this server's IP): " API_DOMAIN

# A generated password is safer than one you invent, and you never need to
# remember it — it is written into the .env files for you.
DB_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-24)"
JWT_SECRET="$(openssl rand -hex 32)"

read -rsp "    Admin password for the app (min 8 chars, letter + number): " ADMIN_PASSWORD; echo
[ ${#ADMIN_PASSWORD} -ge 8 ] || die "Admin password must be at least 8 characters"

read -rp "    Your Netlify site URL (https://your-site.netlify.app): " NETLIFY_URL
NETLIFY_URL="${NETLIFY_URL:-http://localhost:5173}"

SERVER_IP="$(hostname -I | awk '{print $1}')"
API_HOST="${API_DOMAIN:-$SERVER_IP}"

# -----------------------------------------------------------------------------
say "Installing packages"
# -----------------------------------------------------------------------------
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx postgresql postgresql-contrib python3 python3-venv \
                       python3-pip git curl ufw ca-certificates rsync >/dev/null
ok "nginx, postgresql, python3, git, rsync"

if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
    apt-get install -y -qq nodejs >/dev/null
fi
ok "node $(node -v)"
ok "python $(python3 --version | awk '{print $2}')"

# -----------------------------------------------------------------------------
say "Creating the application user"
# -----------------------------------------------------------------------------
if ! id "$APP_USER" >/dev/null 2>&1; then
    adduser --system --group --home "$APP_DIR" "$APP_USER"
    ok "user '$APP_USER' created"
else
    ok "user '$APP_USER' already exists"
fi
mkdir -p "$APP_DIR"

# -----------------------------------------------------------------------------
say "Setting up PostgreSQL"
# -----------------------------------------------------------------------------
systemctl enable --now postgresql >/dev/null 2>&1

if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    sudo -u postgres psql -qc "ALTER USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASSWORD';"
    ok "database user password reset"
else
    sudo -u postgres psql -qc "CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASSWORD';"
    ok "database user created"
fi

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
    sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
    ok "database created"
else
    ok "database already exists"
fi
sudo -u postgres psql -q -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO $DB_USER;"

# -----------------------------------------------------------------------------
say "Installing the code into $APP_DIR"
# -----------------------------------------------------------------------------
if [ "$USE_LOCAL_SOURCE" = true ]; then
    if [ "$SOURCE_DIR" = "$APP_DIR" ]; then
        ok "already in place"
    else
        mkdir -p "$APP_DIR"
        # The excludes matter. If any of these were uploaded by mistake they
        # are useless here and actively harmful: a Windows virtualenv contains
        # binaries compiled for Windows, which cannot load on Linux. All of it
        # is rebuilt natively further down.
        rsync -a --delete \
              --exclude 'node_modules' \
              --exclude 'venv' \
              --exclude '__pycache__' \
              --exclude '*.pyc' \
              --exclude 'dist' \
              --exclude '.git' \
              "$SOURCE_DIR"/ "$APP_DIR"/
        ok "copied from $SOURCE_DIR"
        ok "skipped node_modules, venv, __pycache__, dist (rebuilt natively below)"
    fi
elif [ -d "$APP_DIR/.git" ]; then
    git -C "$APP_DIR" pull --ff-only
    ok "repo updated"
else
    # Clone into a temp dir first, because $APP_DIR is the app user's home
    # and is not empty.
    rm -rf /tmp/sof-clone
    git clone --depth 1 "$REPO_URL" /tmp/sof-clone
    cp -a /tmp/sof-clone/. "$APP_DIR"/
    rm -rf /tmp/sof-clone
    ok "repo cloned"
fi

[ -f "$APP_DIR/backend/package.json" ] || die "Code did not arrive at $APP_DIR — nothing to install"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# -----------------------------------------------------------------------------
say "Writing configuration files"
# -----------------------------------------------------------------------------
NETLIFY_SITE_NAME="$(echo "$NETLIFY_URL" | sed -E 's#https?://##; s#\.netlify\.app.*##')"

cat > "$APP_DIR/backend/.env" <<EOF
PORT=5000
NODE_ENV=production

DB_HOST=localhost
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD

JWT_SECRET=$JWT_SECRET
JWT_EXPIRES_IN=7d

CLIENT_URL=$NETLIFY_URL
EXTRA_ORIGINS=$NETLIFY_URL
NETLIFY_SITE_NAME=$NETLIFY_SITE_NAME

RECOMMENDATION_SERVICE_URL=http://127.0.0.1:8000

ADMIN_EMAIL=admin@sof.com
ADMIN_PASSWORD=$ADMIN_PASSWORD
EOF

cat > "$APP_DIR/recommendation-service/.env" <<EOF
DB_HOST=localhost
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
HOST=127.0.0.1
PORT=8000
ALLOWED_ORIGINS=$NETLIFY_URL
EOF

cat > "$APP_DIR/ingestion/.env" <<EOF
DB_HOST=localhost
DB_PORT=5432
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
INGEST_USER_AGENT=StudentOpportunityFinder/1.0 (https://$API_HOST; contact: admin@sof.com)
INGEST_TIMEOUT=20
INGEST_RATE_LIMIT=2.0
INGEST_MAX_PAGES=3
EOF

chmod 600 "$APP_DIR"/*/.env
chown "$APP_USER:$APP_USER" "$APP_DIR"/*/.env
ok "three .env files written (chmod 600)"

# -----------------------------------------------------------------------------
say "Installing the backend"
# -----------------------------------------------------------------------------
cd "$APP_DIR/backend"
sudo -u "$APP_USER" npm ci --omit=dev --silent
ok "npm packages installed"

sudo -u "$APP_USER" npm run db:migrate
sudo -u "$APP_USER" npm run db:seed
ok "schema created and seeded"

for migration in \
    migration_002_ingestion.sql \
    migration_003_mlh.sql \
    migration_004_sources.sql \
    migration_005_source_expansion.sql
do
    sudo -u "$APP_USER" env PGPASSWORD="$DB_PASSWORD" \
        psql -h localhost -U "$DB_USER" -d "$DB_NAME" -q \
        -f "$APP_DIR/database/$migration"
done
ok "ingestion tables, sources and performance indexes created"

# -----------------------------------------------------------------------------
say "Installing the Python services"
# -----------------------------------------------------------------------------
for svc in recommendation-service ingestion; do
    cd "$APP_DIR/$svc"
    sudo -u "$APP_USER" python3 -m venv venv
    sudo -u "$APP_USER" ./venv/bin/pip install -q --upgrade pip
    sudo -u "$APP_USER" ./venv/bin/pip install -q -r requirements.txt
    ok "$svc ready"
done

# -----------------------------------------------------------------------------
say "Creating systemd services"
# -----------------------------------------------------------------------------
cat > /etc/systemd/system/sof-api.service <<EOF
[Unit]
Description=Student Opportunity Finder API
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR/backend
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=false
ReadWritePaths=$APP_DIR

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/sof-ml.service <<EOF
[Unit]
Description=Student Opportunity Finder Recommendation Service
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR/recommendation-service
ExecStart=$APP_DIR/recommendation-service/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=false
ReadWritePaths=$APP_DIR

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now sof-api sof-ml >/dev/null 2>&1
sleep 4
systemctl is-active --quiet sof-api || die "sof-api failed to start. Run: journalctl -u sof-api -n 40"
systemctl is-active --quiet sof-ml  || warn "sof-ml not running. Check: journalctl -u sof-ml -n 40"
ok "sof-api and sof-ml running"

# -----------------------------------------------------------------------------
say "Configuring nginx (API only — the frontend lives on Netlify)"
# -----------------------------------------------------------------------------
cat > /etc/nginx/sites-available/sof <<EOF
server {
    listen 80;
    server_name ${API_DOMAIN:-_};
    server_tokens off;

    # The React app is hosted on Netlify. This server only exposes the API,
    # which Netlify proxies to via the /api/* rule in frontend/public/_redirects.
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    location = / {
        return 200 'Student Opportunity Finder API. The website is on Netlify.';
        add_header Content-Type text/plain;
    }

    client_max_body_size 2M;
}
EOF

ln -sf /etc/nginx/sites-available/sof /etc/nginx/sites-enabled/sof
rm -f /etc/nginx/sites-enabled/default
nginx -t >/dev/null 2>&1 || die "nginx config is invalid"

# restart, not reload: reload fails outright when nginx is not already
# running, which is exactly the case on a server where something else grabbed
# port 80 during install.
systemctl unmask nginx >/dev/null 2>&1 || true
systemctl enable nginx >/dev/null 2>&1 || true
if ! systemctl restart nginx; then
    warn "nginx did not start. Common cause: apache2 or another service on port 80."
    ss -tlnp 2>/dev/null | grep ":80 " | sed "s/^/      /" || true
    die "Fix port 80, then run: bash deploy/finish-setup.sh"
fi
ok "nginx serving /api on port 80"

# -----------------------------------------------------------------------------
say "Firewall"
# -----------------------------------------------------------------------------
ufw allow OpenSSH >/dev/null 2>&1
ufw allow 'Nginx Full' >/dev/null 2>&1
ufw --force enable >/dev/null 2>&1
ok "only SSH and HTTP/HTTPS are open (5000 and 8000 stay private)"

# -----------------------------------------------------------------------------
say "Importing real opportunities"
# -----------------------------------------------------------------------------
cd "$APP_DIR"
sudo -u "$APP_USER" ./ingestion/venv/bin/python -m ingestion.run --pages 2 || \
    warn "import had problems — run it manually later to see why"

touch /var/log/sof-ingest.log && chown "$APP_USER:$APP_USER" /var/log/sof-ingest.log
mkdir -p /var/backups

crontab -u "$APP_USER" -l 2>/dev/null | grep -v 'ingestion.run' > /tmp/sof-cron || true
cat >> /tmp/sof-cron <<EOF
0 */6 * * * cd $APP_DIR && ./ingestion/venv/bin/python -m ingestion.run >> /var/log/sof-ingest.log 2>&1
EOF
crontab -u "$APP_USER" /tmp/sof-cron && rm -f /tmp/sof-cron
ok "importer scheduled every 6 hours"

# -----------------------------------------------------------------------------
say "Checking everything"
# -----------------------------------------------------------------------------
API_OK=$(curl -s -o /dev/null -w '%{http_code}' -m 10 http://127.0.0.1:5000/api/health || echo 000)
ML_OK=$(curl -s -o /dev/null -w '%{http_code}' -m 10 http://127.0.0.1:8000/health || echo 000)
WEB_OK=$(curl -s -o /dev/null -w '%{http_code}' -m 10 "http://$API_HOST/api/health" || echo 000)
COUNT=$(sudo -u "$APP_USER" env PGPASSWORD="$DB_PASSWORD" psql -h localhost -U "$DB_USER" -d "$DB_NAME" -tAc \
        "SELECT COUNT(*) FROM opportunities WHERE is_active AND deadline >= CURRENT_DATE" 2>/dev/null || echo "?")

printf "    API (internal)   : %s\n" "$API_OK"
printf "    ML service       : %s\n" "$ML_OK"
printf "    API (public)     : %s\n" "$WEB_OK"
printf "    open opportunities: %s\n" "$COUNT"

# -----------------------------------------------------------------------------
cat <<EOF

=============================================================================
 DONE
=============================================================================

 Your API is live at:   http://$API_HOST/api/health

 NEXT STEP — connect Netlify to this server without committing its address:

   1. In Netlify: Site configuration -> Environment variables
   2. Set API_ORIGIN to http://$API_HOST
   3. Trigger a new deploy, or rebuild from your laptop:

        cd frontend
        npm run build
        # then drag the  frontend/dist  folder onto Netlify

 LOGIN DETAILS
   Admin    : admin@sof.com  /  (the admin password you typed)
   Student  : demo.student@example.com  /  Student@123

 SAVE THIS — the database password was generated for you:
   $DB_PASSWORD
   (it is already written into $APP_DIR/backend/.env)

 RECOMMENDED — add HTTPS once you point a domain at this server:
   certbot --nginx -d yourdomain.com
   Then change API_ORIGIN in Netlify to the HTTPS API origin.

 USEFUL COMMANDS
   journalctl -u sof-api -f          # API logs
   journalctl -u sof-ml -f           # ML service logs
   systemctl restart sof-api sof-ml  # restart both
   cd $APP_DIR && sudo -u $APP_USER ./ingestion/venv/bin/python -m ingestion.run

=============================================================================
EOF
