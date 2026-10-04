#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="${FASTGPT_DEPLOY_DIR:-/opt/fastgpt}"
COMPOSE_FILES=(-f docker-compose.pg.yml -f docker-compose.server.override.yml)
ENV_FILE="${FASTGPT_ENV_FILE:-.env}"
BACKUP_DIR=""
DRY_RUN=false
CONFIRM=false

usage() {
  cat <<'EOF'
Usage: restore-fastgpt.sh BACKUP_DIR [options]

Validates a backup manifest and restores MongoDB, PostgreSQL/pgvector and MinIO.
This is destructive for the target databases and object storage.

Options:
  --dry-run                 Validate files and print the restore plan only.
  --confirm                 Required for non-interactive execution.
  -h, --help                Show this help.

Before production use, restore into an isolated stack and verify sample documents,
vector dimensions, citations and original-file access.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --confirm) CONFIRM=true; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "Unknown option: $1" >&2; usage; exit 2 ;;
    *) [[ -z "$BACKUP_DIR" ]] && BACKUP_DIR="$1" || { echo "Only one backup directory is allowed" >&2; exit 2; }; shift ;;
  esac
done

if [[ -z "$BACKUP_DIR" || ! -d "$BACKUP_DIR" ]]; then
  echo "Backup directory not found. Usage: $0 BACKUP_DIR [--dry-run|--confirm]" >&2
  exit 1
fi
if [[ "$ROOT_DIR" == "/" || -z "$ROOT_DIR" ]]; then
  echo "Refusing unsafe deployment directory: $ROOT_DIR" >&2
  exit 1
fi

for file in mongo.archive.gz postgres.sql.gz; do
  [[ -f "$BACKUP_DIR/$file" ]] || { echo "Required backup file missing: $BACKUP_DIR/$file" >&2; exit 1; }
done
if [[ -f "$BACKUP_DIR/manifest.sha256" ]]; then
  (cd "$BACKUP_DIR" && sha256sum -c manifest.sha256)
else
  echo "Warning: legacy backup has no manifest.sha256; gzip and MinIO checks will still run." >&2
fi
if [[ ! -f "$BACKUP_DIR/minio-data.tar.gz" && ! -d "$BACKUP_DIR/minio-data" ]]; then
  echo "Required MinIO backup missing: minio-data.tar.gz or minio-data/" >&2
  exit 1
fi
gzip -t "$BACKUP_DIR/mongo.archive.gz" "$BACKUP_DIR/postgres.sql.gz"
if [[ -f "$BACKUP_DIR/minio-data.tar.gz" ]]; then tar -tzf "$BACKUP_DIR/minio-data.tar.gz" >/dev/null; fi

echo "Restore plan:"
echo "  source: $BACKUP_DIR"
echo "  target: $ROOT_DIR"
echo "  components: MongoDB, PostgreSQL/pgvector, MinIO"
echo "  warning: existing target data will be replaced"

if [[ "$DRY_RUN" == true ]]; then
  echo "Dry-run complete; no data was changed."
  exit 0
fi

if [[ "$CONFIRM" != true ]]; then
  if [[ ! -t 0 ]]; then
    echo "Non-interactive restore requires --confirm." >&2
    exit 2
  fi
  read -r -p "Type RESTORE to continue: " answer
  [[ "$answer" == RESTORE ]] || { echo "Restore cancelled."; exit 1; }
fi

cd "$ROOT_DIR"
[[ -f "$ENV_FILE" ]] || { echo "Environment file not found: $ROOT_DIR/$ENV_FILE" >&2; exit 1; }
command -v docker >/dev/null || { echo "docker is required" >&2; exit 1; }

echo "Restoring MongoDB..."
cat "$BACKUP_DIR/mongo.archive.gz" | docker compose --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" exec -T fastgpt-mongo \
  mongorestore \
  --username "${MONGO_INITDB_ROOT_USERNAME:-myusername}" \
  --password "${MONGO_INITDB_ROOT_PASSWORD:-mypassword}" \
  --authenticationDatabase admin \
  --archive \
  --gzip \
  --drop

echo "Restoring PostgreSQL/vector database..."
gzip -dc "$BACKUP_DIR/postgres.sql.gz" | docker compose --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" exec -T fastgpt-vector \
  psql -U "${POSTGRES_USER:-username}" -d postgres

echo "Restoring MinIO object storage..."
docker compose --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" exec -T fastgpt-minio sh -c 'rm -rf /data/*'
if [[ -f "$BACKUP_DIR/minio-data.tar.gz" ]]; then
  TMP_RESTORE="$(mktemp -d /tmp/fastgpt-minio-restore.XXXXXX)"
  cleanup() { rm -rf "$TMP_RESTORE"; }
  trap cleanup EXIT
  tar -C "$TMP_RESTORE" -xzf "$BACKUP_DIR/minio-data.tar.gz"
  docker cp "$TMP_RESTORE/minio-data/." fastgpt-minio:/data
else
  docker cp "$BACKUP_DIR/minio-data/." fastgpt-minio:/data
fi

if [[ -f "$BACKUP_DIR/storage.tar.gz" ]]; then
  echo "Host /storage archive is available at $BACKUP_DIR/storage.tar.gz; restore it separately after review."
fi

echo "Restarting application services..."
docker compose --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" restart fastgpt-app fastgpt-plugin
echo "Restore complete. Verify service health, vector dimensions and representative citations before production traffic."
