#!/usr/bin/env bash
# Keep systemd hardening while allowing private resume storage.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo 'Run as root.' >&2; exit 1; }
install -d -o sof -g sof -m 700 /var/lib/sof/resumes
install -d -m 755 /etc/systemd/system/sof-api.service.d
printf '[Service]\nReadWritePaths=/var/lib/sof/resumes\n' > /etc/systemd/system/sof-api.service.d/resume-storage.conf
chmod 644 /etc/systemd/system/sof-api.service.d/resume-storage.conf
systemctl daemon-reload
echo 'Private resume folder enabled in sof-api writable paths.'
