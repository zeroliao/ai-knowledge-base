#!/usr/bin/env bash
set -euo pipefail

IMAGE_ARCHIVE="/tmp/fastgpt-custom-url-directory-004.tar.gz"
OVERRIDE_FILE="/tmp/docker-compose.server.override.yml"
BASE_DIR="/opt/fastgpt"
CONFIG_CHECK_FILE=""

cleanup() {
  rm -f "$IMAGE_ARCHIVE" "$OVERRIDE_FILE"
  if [[ -n "$CONFIG_CHECK_FILE" ]]; then
    rm -f "$CONFIG_CHECK_FILE"
  fi
}
trap cleanup EXIT

cd "$BASE_DIR"

if [[ ! -f "$IMAGE_ARCHIVE" ]]; then
  echo "missing image archive: $IMAGE_ARCHIVE" >&2
  exit 1
fi

if [[ ! -f "$OVERRIDE_FILE" ]]; then
  echo "missing compose override: $OVERRIDE_FILE" >&2
  exit 1
fi

ts=$(date +%Y%m%d%H%M%S)
cp docker-compose.server.override.yml "docker-compose.server.override.yml.bak.$ts"
docker load -i "$IMAGE_ARCHIVE"
cp "$OVERRIDE_FILE" docker-compose.server.override.yml

CONFIG_CHECK_FILE="$(mktemp /tmp/fastgpt-compose-v004.XXXXXX.yml)"
docker compose --env-file .env -f docker-compose.pg.yml -f docker-compose.server.override.yml config >"$CONFIG_CHECK_FILE"
docker compose --env-file .env -f docker-compose.pg.yml -f docker-compose.server.override.yml up -d fastgpt-app

for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3000 >/dev/null; then
    docker ps --filter name=fastgpt-app --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
    exit 0
  fi
  sleep 2
done

docker logs fastgpt-app --tail=160
exit 1
