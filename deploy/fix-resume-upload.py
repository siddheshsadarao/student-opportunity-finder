#!/usr/bin/env python3
"""Raise the upload limit only in the dedicated, active SOF nginx server."""
import datetime
import os
from pathlib import Path
import re
import shutil
import subprocess


def updated_config(text):
    clean = re.sub(r"(?m)#.*$", "", text)
    if len(re.findall(r"\bserver\s*\{", clean)) != 1:
        raise ValueError("Expected one dedicated server block; shared configs are not changed.")
    proxies = re.findall(r"\bproxy_pass\s+([^;]+);", clean)
    if not proxies or any(not re.fullmatch(r"http://(?:127\.0\.0\.1|localhost):5000/?", proxy.strip()) for proxy in proxies):
        raise ValueError("Not a dedicated SOF API config (upstream must be port 5000).")
    if re.search(r"\bclient_max_body_size\s+[^;]+;", clean):
        return re.sub(r"\bclient_max_body_size\s+[^;]+;", "client_max_body_size 6M;", text)
    return re.sub(r"(\bserver\s*\{)", r"\1\n    client_max_body_size 6M;", text, count=1)


def main():
    if os.geteuid() != 0:
        raise SystemExit("Run this script as root.")
    dump = subprocess.run(["nginx", "-T"], check=True, capture_output=True, text=True).stdout
    candidates = {}
    for name in re.findall(r"(?m)^# configuration file (.+):$", dump):
        file = Path(name).resolve()
        if not file.is_relative_to(Path("/etc/nginx")) or not file.is_file():
            continue
        text = file.read_text()
        try:
            updated = updated_config(text)
        except ValueError:
            continue
        candidates[file] = (text, updated)
    if len(candidates) != 1:
        raise SystemExit("Could not identify exactly one dedicated SOF nginx config. No nginx files changed. Inspect nginx -T for the API upstream on port 5000.")
    file, (original, updated) = next(iter(candidates.items()))
    if original == updated:
        print("SOF nginx upload limit is already 6M.")
        return
    backup = Path("/root/sof-backups") / ("upload-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S"))
    backup.mkdir(parents=True, mode=0o700)
    shutil.copy2(file, backup / file.name)
    file.write_text(updated)
    try:
        subprocess.run(["nginx", "-t"], check=True)
        subprocess.run(["systemctl", "reload", "nginx"], check=True)
    except subprocess.CalledProcessError:
        file.write_text(original)
        subprocess.run(["nginx", "-t"], check=False)
        subprocess.run(["systemctl", "reload", "nginx"], check=False)
        raise SystemExit("Nginx validation/reload failed; original config restored.")
    print(f"Updated only {file}; backup: {backup}")


if __name__ == "__main__":
    main()
