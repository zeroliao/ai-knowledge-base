#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${FASTGPT_DEPLOY_DIR:-/opt/fastgpt}"
OUTPUT_DIR="${FASTGPT_CHECK_DIR:-${ROOT_DIR}/ops-checks}"
CHECK_NAME="${1:-manual}"
STAMP="$(date +%Y%m%d-%H%M%S)"

usage() {
  cat <<'EOF'
Usage: check-resources.sh [label]

Collects a timestamped, non-secret deployment verification record. The record
includes disk, memory, Docker containers, compose config and disabled optional
component profiles. It does not change services or read environment values.

Environment:
  FASTGPT_DEPLOY_DIR  Compose directory (default: /opt/fastgpt)
  FASTGPT_CHECK_DIR   Output directory (default: $FASTGPT_DEPLOY_DIR/ops-checks)
EOF
}

if [[ "$CHECK_NAME" == "-h" || "$CHECK_NAME" == "--help" ]]; then usage; exit 0; fi
if [[ "$ROOT_DIR" == "/" || -z "$ROOT_DIR" ]]; then echo "Refusing unsafe root: $ROOT_DIR" >&2; exit 1; fi
mkdir -p "$OUTPUT_DIR"
REPORT="$OUTPUT_DIR/${STAMP}-${CHECK_NAME}.txt"
COMPOSE_FILES=(-f docker-compose.pg.yml -f docker-compose.server.override.yml)

{
  echo "verification=resource-and-service-check"
  echo "label=$CHECK_NAME"
  echo "timestamp=$STAMP"
  echo "root=$ROOT_DIR"
  echo
  echo "== disk =="
  df -h / || true
  df -h /storage 2>/dev/null || true
  echo
  echo "== memory =="
  free -h || true
  echo
  echo "== docker =="
  docker --version
  docker compose version
  docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
  echo
  echo "== compose config =="
  if [[ -f "$ROOT_DIR/.env" && -f "$ROOT_DIR/docker-compose.pg.yml" && -f "$ROOT_DIR/docker-compose.server.override.yml" ]]; then
    (cd "$ROOT_DIR" && docker compose --env-file .env "${COMPOSE_FILES[@]}" config --quiet)
    echo "compose_config=valid"
  else
    echo "compose_config=not-run-missing-files"
  fi
  echo
  echo "== optional components =="
  if [[ -f "$ROOT_DIR/docker-compose.server.override.yml" ]]; then
    grep -nE "profiles:|disabled|fastgpt-code-sandbox|fastgpt-mcp-server|fastgpt-volume-manager|opensandbox-server" "$ROOT_DIR/docker-compose.server.override.yml" || true
    echo "sandbox_mcp_volume_manager=expected-disabled"
  else
    echo "sandbox_mcp_volume_manager=unknown-missing-override"
  fi
} 2>&1 | tee "$REPORT"

echo "Verification record: $REPORT"
