# Deployment Guide — VPS

How to put the whole platform on a VPS with a domain, HTTPS and scheduled
imports.

---

## 1. Why a VPS and not Netlify / Vercel

**Short answer: Netlify cannot run this project.**

Netlify and Vercel host *static files* plus short-lived serverless functions.
This project needs four things running continuously:

| Component | What it needs | Netlify? |
| --- | --- | --- |
| React frontend | Static files | ✅ Yes |
| Express API | A long-running Node process | ❌ No |
| FastAPI ML service | A long-running Python process holding scikit-learn in memory | ❌ No |
| PostgreSQL | A persistent database | ❌ No |
| Ingestion job | A cron job running for minutes every 6 hours | ❌ No |

You could split it — frontend on Netlify, everything else elsewhere — but then
you are managing two platforms and paying for a database host, for no benefit.
**Since you already have a VPS, put everything on it.** One machine, one set of
logs, one backup, no monthly database bill.

### What you need

- A VPS with at least **2 GB RAM** (scikit-learn plus PostgreSQL is tight on 1 GB)
- Ubuntu 22.04 or 24.04
- A domain pointed at the VPS IP (an `A` record)
- Root or `sudo` access

---

## 2. Server setup

```bash
# Log in
ssh root@YOUR_SERVER_IP

# Update and install everything we need
apt update && apt upgrade -y
apt install -y nginx postgresql postgresql-contrib python3.11 python3.11-venv \
               git curl ufw certbot python3-certbot-nginx

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verify
node -v && python3.11 --version && psql --version
```

### Create a non-root user to run the app

Running a web app as root means a bug in the app is a bug with root access.

```bash
adduser --system --group --home /var/www/sof sof
mkdir -p /var/www/sof && chown sof:sof /var/www/sof
```

### Firewall

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

Note that ports **5000** (API) and **8000** (ML service) are deliberately *not*
opened. They only listen on `127.0.0.1` and are reached through nginx, so they
are not exposed to the internet at all.

---

## 3. Database

```bash
sudo -u postgres psql
```

```sql
CREATE DATABASE student_opportunity_finder;
CREATE USER sof_user WITH ENCRYPTED PASSWORD 'PUT_A_LONG_RANDOM_PASSWORD_HERE';
GRANT ALL PRIVILEGES ON DATABASE student_opportunity_finder TO sof_user;
\c student_opportunity_finder
GRANT ALL ON SCHEMA public TO sof_user;
\q
```

Generate the password properly — do not invent one by hand:

```bash
openssl rand -base64 32
```

---

## 4. Deploy the code

```bash
cd /var/www/sof
git clone https://github.com/YOUR_USERNAME/student-opportunity-finder.git .
chown -R sof:sof /var/www/sof
```

### Backend

```bash
cd /var/www/sof/backend
npm ci --omit=dev

cat > .env <<'EOF'
PORT=5000
NODE_ENV=production
DB_HOST=localhost
DB_PORT=5432
DB_NAME=student_opportunity_finder
DB_USER=sof_user
DB_PASSWORD=THE_PASSWORD_YOU_GENERATED
JWT_SECRET=RUN_openssl_rand_hex_32_AND_PASTE_HERE
JWT_EXPIRES_IN=7d
CLIENT_URL=https://yourdomain.com
RECOMMENDATION_SERVICE_URL=http://127.0.0.1:8000
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=A_STRONG_ADMIN_PASSWORD
EOF

chmod 600 .env

# Create the schema, then load categories/skills/demo data
npm run db:migrate
npm run db:seed
psql -U sof_user -d student_opportunity_finder -f ../database/migration_002_ingestion.sql
```

> `JWT_SECRET` must be a long random string — `openssl rand -hex 32`. Anyone who
> knows it can forge a token for any account, including the admin.

### Recommendation service

```bash
cd /var/www/sof/recommendation-service
python3.11 -m venv venv
./venv/bin/pip install -r requirements.txt

cat > .env <<'EOF'
DB_HOST=localhost
DB_PORT=5432
DB_NAME=student_opportunity_finder
DB_USER=sof_user
DB_PASSWORD=THE_PASSWORD_YOU_GENERATED
HOST=127.0.0.1
PORT=8000
ALLOWED_ORIGINS=https://yourdomain.com
EOF

chmod 600 .env
```

### Ingestion service

```bash
cd /var/www/sof/ingestion
python3.11 -m venv venv
./venv/bin/pip install -r requirements.txt

cat > .env <<'EOF'
DB_HOST=localhost
DB_PORT=5432
DB_NAME=student_opportunity_finder
DB_USER=sof_user
DB_PASSWORD=THE_PASSWORD_YOU_GENERATED
INGEST_USER_AGENT=StudentOpportunityFinder/1.0 (https://yourdomain.com; contact: you@yourdomain.com)
INGEST_RATE_LIMIT=2.0
INGEST_MAX_PAGES=3
EOF

chmod 600 .env
```

> Put a **real** contact address in `INGEST_USER_AGENT`. If a site has a problem
> with your traffic, you want them to email you rather than block your server.

### Frontend

```bash
cd /var/www/sof/frontend
npm ci
npm run build          # produces dist/
```

The built files are static. nginx serves them directly — no Node process needed
for the frontend in production.

```bash
chown -R sof:sof /var/www/sof
```

---

## 5. Run the services with systemd

systemd restarts a service if it crashes and starts everything on reboot.

### API

```bash
cat > /etc/systemd/system/sof-api.service <<'EOF'
[Unit]
Description=Student Opportunity Finder API
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=sof
Group=sof
WorkingDirectory=/var/www/sof/backend
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

# Hardening: the service cannot write anywhere it does not need to
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/www/sof/backend

[Install]
WantedBy=multi-user.target
EOF
```

### Recommendation service

```bash
cat > /etc/systemd/system/sof-ml.service <<'EOF'
[Unit]
Description=Student Opportunity Finder Recommendation Service
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=sof
Group=sof
WorkingDirectory=/var/www/sof/recommendation-service
ExecStart=/var/www/sof/recommendation-service/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/www/sof/recommendation-service

[Install]
WantedBy=multi-user.target
EOF
```

### Start both

```bash
systemctl daemon-reload
systemctl enable --now sof-api sof-ml
systemctl status sof-api sof-ml --no-pager

# Health check from the server itself
curl -s localhost:5000/api/health
curl -s localhost:8000/health
```

---

## 6. nginx

```bash
cat > /etc/nginx/sites-available/sof <<'EOF'
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Do not advertise the nginx version
    server_tokens off;

    # --- React app (static build) ---
    root /var/www/sof/frontend/dist;
    index index.html;

    # React Router handles the routing, so every unknown path must return
    # index.html rather than a 404.
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Hashed asset filenames never change contents, so cache them hard.
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # --- API ---
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # The recommendation call can take a few seconds on a cold start.
        proxy_read_timeout 60s;
    }

    client_max_body_size 2M;
}
EOF

ln -sf /etc/nginx/sites-available/sof /etc/nginx/sites-enabled/sof
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

Note there is **no** nginx route to port 8000. The ML service is only reachable
from the Express API on localhost, which is what we want — it has no
authentication of its own.

---

## 7. HTTPS

```bash
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Certbot edits the nginx config and installs a renewal timer. Check it:

```bash
systemctl status certbot.timer
certbot renew --dry-run
```

Once HTTPS works, make sure `CLIENT_URL` in `backend/.env` and
`ALLOWED_ORIGINS` in `recommendation-service/.env` both use `https://`, then:

```bash
systemctl restart sof-api sof-ml
```

---

## 8. Schedule the imports

```bash
crontab -u sof -e
```

```cron
# Import new opportunities every 6 hours
0 */6 * * * cd /var/www/sof && ./ingestion/venv/bin/python -m ingestion.run >> /var/log/sof-ingest.log 2>&1

# Nightly database backup, keeping 14 days
30 2 * * * pg_dump student_opportunity_finder | gzip > /var/backups/sof-$(date +\%F).sql.gz && find /var/backups -name 'sof-*.sql.gz' -mtime +14 -delete
```

```bash
mkdir -p /var/backups
touch /var/log/sof-ingest.log && chown sof:sof /var/log/sof-ingest.log
```

Run it once by hand first, so you see the output:

```bash
cd /var/www/sof && sudo -u sof ./ingestion/venv/bin/python -m ingestion.run
```

Stop the log growing forever:

```bash
cat > /etc/logrotate.d/sof <<'EOF'
/var/log/sof-ingest.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
    create 0644 sof sof
}
EOF
```

---

## 9. Checks after deploying

```bash
# Services running?
systemctl is-active sof-api sof-ml nginx postgresql

# Endpoints answering?
curl -s https://yourdomain.com/api/health
curl -s localhost:8000/health

# Is the ML engine actually being used? Should print "ml", not "fallback".
# (log in through the site first and copy the token from devtools)
curl -s https://yourdomain.com/api/dashboard -H "Authorization: Bearer TOKEN" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['engine'])"

# Ports 5000/8000 must NOT be reachable from outside — run from your laptop:
curl -m 5 http://YOUR_SERVER_IP:5000/api/health   # should time out
```

Then in a browser: register an account, finish onboarding, confirm
recommendations appear with match percentages, and check
**Admin → Data Sources** shows the last import.

---

## 10. Updating after a code change

```bash
cd /var/www/sof
sudo -u sof git pull

# Backend
cd backend && sudo -u sof npm ci --omit=dev

# Frontend (rebuild the static files)
cd ../frontend && sudo -u sof npm ci && sudo -u sof npm run build

# Python services, only if requirements.txt changed
cd ../recommendation-service && sudo -u sof ./venv/bin/pip install -r requirements.txt

systemctl restart sof-api sof-ml
```

nginx does not need reloading for a frontend rebuild — it serves whatever is in
`dist/`.

---

## 11. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| 502 Bad Gateway | The API is not running: `journalctl -u sof-api -n 50 --no-pager` |
| Recommendations say "fallback" | The ML service is down: `systemctl status sof-ml`, then `journalctl -u sof-ml -n 50` |
| ML service dies on start | Usually out of memory. scikit-learn needs ~300 MB. Add swap: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` |
| CORS error in the browser | `CLIENT_URL` in `backend/.env` does not exactly match the site origin, including `https://` |
| Login works, then 401 everywhere | `JWT_SECRET` changed (e.g. the service restarted with a different `.env`). All existing tokens are void; log in again |
| Refresh gives 404 | The nginx `try_files ... /index.html` line is missing |
| Import finds nothing | Run it manually and read the output. A `403` means that site is refusing automated access — disable it in **Admin → Data Sources** |
| Database connection refused | `systemctl status postgresql`, and check the password in `.env` matches the one you set |

### Useful commands

```bash
journalctl -u sof-api -f          # live API logs
journalctl -u sof-ml -f           # live ML logs
tail -f /var/log/nginx/error.log  # nginx errors
tail -f /var/log/sof-ingest.log   # import logs
systemctl restart sof-api sof-ml  # restart both services
```

---

## 12. Security checklist before showing it publicly

- [ ] `JWT_SECRET` is a long random string, not the development default
- [ ] The admin password was changed from `Admin@123` (**Admin → Settings**)
- [ ] The database user is `sof_user`, not `postgres`, with a generated password
- [ ] All three `.env` files are `chmod 600` and are **not** in git
- [ ] `ufw` allows only SSH and HTTP/HTTPS
- [ ] Ports 5000 and 8000 are unreachable from outside the server
- [ ] HTTPS works and renews automatically (`certbot renew --dry-run`)
- [ ] The services run as `sof`, not root
- [ ] Nightly backups are running and you have restored one at least once
- [ ] `INGEST_USER_AGENT` contains a real contact address

---

## 13. Cost

Everything here runs on one small VPS:

| Item | Typical cost |
| --- | --- |
| VPS, 2 GB RAM | ₹400–₹800 / month |
| Domain | ₹700–₹1,000 / year |
| HTTPS certificate | Free (Let's Encrypt) |
| Database hosting | ₹0 — PostgreSQL runs on the same VPS |

Compared with splitting across Netlify plus a managed database, this is both
cheaper and simpler to operate.
