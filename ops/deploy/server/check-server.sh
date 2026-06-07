#!/usr/bin/env bash
set -euo pipefail

echo "== System =="
uname -a

echo "== Disk =="
df -h /
df -h /storage 2>/dev/null || true

echo "== Memory =="
free -h

echo "== Docker =="
docker --version
docker compose version
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

echo "== Caddy =="
caddy version 2>&1 || true
caddy validate --config /etc/caddy/Caddyfile 2>&1 || true
