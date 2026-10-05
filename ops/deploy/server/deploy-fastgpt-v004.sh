#!/usr/bin/env bash
set -euo pipefail

IMAGE_TAG="url-directory-007"
IMAGE_ARCHIVE="/tmp/fastgpt-custom-${IMAGE_TAG}.tar"
IMAGE_ARCHIVE_GZ="${IMAGE_ARCHIVE}.gz"
OVERRIDE_FILE="/tmp/docker-compose.server.override.yml"
BASE_DIR="/opt/fastgpt"
BACKUP_ROOT="/opt/fastgpt-backups"
CONFIG_CHECK_FILE=""
COMPOSE_FILES=(-f docker-compose.pg.yml -f docker-compose.server.override.yml)

cleanup() {
  rm -f "$IMAGE_ARCHIVE" "$IMAGE_ARCHIVE_GZ" "$OVERRIDE_FILE"
  if [[ -n "$CONFIG_CHECK_FILE" ]]; then
    rm -f "$CONFIG_CHECK_FILE"
  fi
}
trap cleanup EXIT

cd "$BASE_DIR"

if [[ ! -f "$IMAGE_ARCHIVE" && -f "$IMAGE_ARCHIVE_GZ" ]]; then
  echo "Extracting image archive: $IMAGE_ARCHIVE_GZ"
  gzip -dc "$IMAGE_ARCHIVE_GZ" > "$IMAGE_ARCHIVE"
fi

if [[ ! -f "$IMAGE_ARCHIVE" ]]; then
  echo "missing image archive: $IMAGE_ARCHIVE" >&2
  exit 1
fi

if [[ ! -f "$OVERRIDE_FILE" ]]; then
  echo "missing compose override: $OVERRIDE_FILE" >&2
  exit 1
fi

ts=$(date +%Y%m%d%H%M%S)
backup_dir="${BACKUP_ROOT}/${ts}-before-${IMAGE_TAG}"
mkdir -p "$backup_dir"

echo "Backing up MongoDB, PostgreSQL/vector database, MinIO and compose files to ${backup_dir}..."
docker compose --env-file .env "${COMPOSE_FILES[@]}" exec -T fastgpt-mongo \
  mongodump \
  --username "${MONGO_INITDB_ROOT_USERNAME:-myusername}" \
  --password "${MONGO_INITDB_ROOT_PASSWORD:-mypassword}" \
  --authenticationDatabase admin \
  --archive \
  --gzip > "${backup_dir}/mongo.archive.gz"

docker compose --env-file .env "${COMPOSE_FILES[@]}" exec -T fastgpt-vector \
  pg_dumpall \
  -U "${POSTGRES_USER:-username}" > "${backup_dir}/postgres.sql"
gzip "${backup_dir}/postgres.sql"

docker cp fastgpt-minio:/data "${backup_dir}/minio-data"

cp .env "${backup_dir}/env.snapshot"
cp docker-compose.pg.yml "${backup_dir}/docker-compose.pg.yml"
cp docker-compose.server.override.yml "${backup_dir}/docker-compose.server.override.yml"
docker compose --env-file .env "${COMPOSE_FILES[@]}" ps > "${backup_dir}/compose-ps-before.txt"

cp docker-compose.server.override.yml "docker-compose.server.override.yml.bak.$ts"

echo "Loading image archive..."
docker load -i "$IMAGE_ARCHIVE"
cp "$OVERRIDE_FILE" docker-compose.server.override.yml

if ! grep -Eq "^[[:space:]]+image:[[:space:]]+fastgpt-custom:${IMAGE_TAG}[[:space:]]*$" docker-compose.server.override.yml; then
  echo "compose override does not target fastgpt-custom:${IMAGE_TAG}" >&2
  exit 1
fi

CONFIG_CHECK_FILE="$(mktemp /tmp/fastgpt-compose-${IMAGE_TAG}.XXXXXX.yml)"
docker compose --env-file .env "${COMPOSE_FILES[@]}" config >"$CONFIG_CHECK_FILE"

echo "Stopping fastgpt-app before application restart..."
docker compose --env-file .env "${COMPOSE_FILES[@]}" stop fastgpt-app || true

echo "Starting fastgpt-app with ${IMAGE_TAG}..."
docker compose --env-file .env "${COMPOSE_FILES[@]}" up -d fastgpt-app

for i in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:3000 >/dev/null; then
    docker ps --filter name=fastgpt-app --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
    echo "Backup directory: ${backup_dir}"
    exit 0
  fi
  sleep 2
done

docker logs fastgpt-app --tail=160
exit 1
