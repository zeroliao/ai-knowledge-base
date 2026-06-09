#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Usage: $0 /opt/fastgpt-backups/YYYYMMDD-HHMMSS"
  exit 1
fi

ROOT_DIR="${FASTGPT_DEPLOY_DIR:-/opt/fastgpt}"
BACKUP_DIR="$1"
COMPOSE_FILES=(-f docker-compose.pg.yml -f docker-compose.server.override.yml)
ENV_FILE="${FASTGPT_ENV_FILE:-.env}"

if [ ! -d "${BACKUP_DIR}" ]; then
  echo "Backup directory not found: ${BACKUP_DIR}"
  exit 1
fi

for file in mongo.archive.gz postgres.sql.gz minio-data.tar.gz; do
  if [ ! -f "${BACKUP_DIR}/${file}" ]; then
    echo "Required backup file missing: ${BACKUP_DIR}/${file}"
    exit 1
  fi
done

cd "${ROOT_DIR}"

echo "This will restore MongoDB, PostgreSQL/vector data and MinIO data from:"
echo "${BACKUP_DIR}"
echo "Type RESTORE to continue:"
read -r confirm
if [ "${confirm}" != "RESTORE" ]; then
  echo "Restore cancelled."
  exit 1
fi

echo "Restoring MongoDB..."
cat "${BACKUP_DIR}/mongo.archive.gz" | docker compose --env-file "${ENV_FILE}" "${COMPOSE_FILES[@]}" exec -T fastgpt-mongo \
  mongorestore \
  --username "${MONGO_INITDB_ROOT_USERNAME:-myusername}" \
  --password "${MONGO_INITDB_ROOT_PASSWORD:-mypassword}" \
  --authenticationDatabase admin \
  --archive \
  --gzip \
  --drop

echo "Restoring PostgreSQL/vector database..."
gunzip -c "${BACKUP_DIR}/postgres.sql.gz" | docker compose --env-file "${ENV_FILE}" "${COMPOSE_FILES[@]}" exec -T fastgpt-vector \
  psql -U "${POSTGRES_USER:-username}" -d postgres

echo "Restoring MinIO object storage..."
cat "${BACKUP_DIR}/minio-data.tar.gz" | docker compose --env-file "${ENV_FILE}" "${COMPOSE_FILES[@]}" exec -T fastgpt-minio \
  sh -c 'rm -rf /data/* && tar -C /data -xzf -'

echo "Restarting services..."
docker compose --env-file "${ENV_FILE}" "${COMPOSE_FILES[@]}" restart fastgpt-app fastgpt-plugin

echo "Restore complete."
