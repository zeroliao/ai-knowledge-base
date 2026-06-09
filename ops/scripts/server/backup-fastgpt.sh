#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${FASTGPT_DEPLOY_DIR:-/opt/fastgpt}"
BACKUP_ROOT="${FASTGPT_BACKUP_DIR:-/opt/fastgpt-backups}"
COMPOSE_FILES=(-f docker-compose.pg.yml -f docker-compose.server.override.yml)
ENV_FILE="${FASTGPT_ENV_FILE:-.env}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${STAMP}"

cd "${ROOT_DIR}"
mkdir -p "${BACKUP_DIR}"

echo "Backup directory: ${BACKUP_DIR}"

echo "Backing up MongoDB..."
docker compose --env-file "${ENV_FILE}" "${COMPOSE_FILES[@]}" exec -T fastgpt-mongo \
  mongodump \
  --username "${MONGO_INITDB_ROOT_USERNAME:-myusername}" \
  --password "${MONGO_INITDB_ROOT_PASSWORD:-mypassword}" \
  --authenticationDatabase admin \
  --archive \
  --gzip > "${BACKUP_DIR}/mongo.archive.gz"

echo "Backing up PostgreSQL/vector database..."
docker compose --env-file "${ENV_FILE}" "${COMPOSE_FILES[@]}" exec -T fastgpt-vector \
  pg_dumpall \
  -U "${POSTGRES_USER:-username}" > "${BACKUP_DIR}/postgres.sql"
gzip "${BACKUP_DIR}/postgres.sql"

echo "Backing up MinIO object storage..."
docker compose --env-file "${ENV_FILE}" "${COMPOSE_FILES[@]}" exec -T fastgpt-minio \
  tar -C /data -czf - . > "${BACKUP_DIR}/minio-data.tar.gz"

echo "Capturing compose and container state..."
cp "${ENV_FILE}" "${BACKUP_DIR}/env.snapshot"
cp docker-compose.pg.yml "${BACKUP_DIR}/docker-compose.pg.yml"
cp docker-compose.server.override.yml "${BACKUP_DIR}/docker-compose.server.override.yml"
docker compose --env-file "${ENV_FILE}" "${COMPOSE_FILES[@]}" ps > "${BACKUP_DIR}/compose-ps.txt"

find "${BACKUP_ROOT}" -mindepth 1 -maxdepth 1 -type d -mtime +30 -print -exec rm -rf {} \;

echo "Backup complete: ${BACKUP_DIR}"
