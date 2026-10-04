#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="${FASTGPT_DEPLOY_DIR:-/opt/fastgpt}"
BACKUP_ROOT="${FASTGPT_BACKUP_DIR:-/opt/fastgpt-backups}"
COMPOSE_FILES=(-f docker-compose.pg.yml -f docker-compose.server.override.yml)
ENV_FILE="${FASTGPT_ENV_FILE:-.env}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_STORAGE="${BACKUP_STORAGE:-true}"
DRY_RUN=false

usage() {
  cat <<'EOF'
Usage: backup-fastgpt.sh [options]

Creates a logical backup of MongoDB, PostgreSQL/pgvector and MinIO.
The host /storage directory is included by default when it exists.

Options:
  --dry-run                 Print the plan without writing data.
  --retention-days N        Remove backup directories older than N days (default: 30).
  --no-storage              Do not archive the host /storage directory.
  -h, --help                Show this help.

Environment:
  FASTGPT_DEPLOY_DIR, FASTGPT_BACKUP_DIR, FASTGPT_ENV_FILE
  BACKUP_STORAGE=false      Same as --no-storage.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --retention-days)
      [[ "${2:-}" =~ ^[0-9]+$ ]] || { echo "--retention-days expects an integer" >&2; exit 2; }
      RETENTION_DAYS="$2"; shift 2 ;;
    --no-storage) BACKUP_STORAGE=false; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

if [[ ! -d "$ROOT_DIR" ]]; then
  echo "Deployment directory not found: $ROOT_DIR" >&2
  exit 1
fi
if [[ "$BACKUP_ROOT" == "/" || -z "$BACKUP_ROOT" ]]; then
  echo "Refusing unsafe backup root: $BACKUP_ROOT" >&2
  exit 1
fi
if [[ ! -f "$ROOT_DIR/$ENV_FILE" ]]; then
  echo "Environment file not found: $ROOT_DIR/$ENV_FILE" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${STAMP}"
cd "$ROOT_DIR"

echo "Backup plan:"
echo "  source: $ROOT_DIR"
echo "  destination: $BACKUP_DIR"
echo "  components: MongoDB, PostgreSQL/pgvector, MinIO"
if [[ "$BACKUP_STORAGE" == true ]]; then echo "  host storage: /storage when present"; fi
echo "  retention: ${RETENTION_DAYS} days"

if [[ "$DRY_RUN" == true ]]; then
  echo "Dry-run complete; no backup data was written."
  exit 0
fi

command -v docker >/dev/null || { echo "docker is required" >&2; exit 1; }
command -v sha256sum >/dev/null || { echo "sha256sum is required" >&2; exit 1; }
mkdir -p "$BACKUP_ROOT"
if [[ -e "$BACKUP_DIR" ]]; then
  echo "Backup destination already exists: $BACKUP_DIR" >&2
  exit 1
fi
mkdir "$BACKUP_DIR"
TEMP_DIR="$(mktemp -d /tmp/fastgpt-backup.XXXXXX)"
cleanup() { rm -rf "$TEMP_DIR"; }
trap cleanup EXIT

echo "Backing up MongoDB..."
docker compose --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" exec -T fastgpt-mongo \
  mongodump \
  --username "${MONGO_INITDB_ROOT_USERNAME:-myusername}" \
  --password "${MONGO_INITDB_ROOT_PASSWORD:-mypassword}" \
  --authenticationDatabase admin \
  --archive \
  --gzip > "$BACKUP_DIR/mongo.archive.gz"

echo "Backing up PostgreSQL/vector database..."
docker compose --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" exec -T fastgpt-vector \
  pg_dumpall \
  -U "${POSTGRES_USER:-username}" > "$TEMP_DIR/postgres.sql"
gzip -c "$TEMP_DIR/postgres.sql" > "$BACKUP_DIR/postgres.sql.gz"

echo "Backing up MinIO object storage..."
docker cp fastgpt-minio:/data "$TEMP_DIR/minio-data"
tar -C "$TEMP_DIR" -czf "$BACKUP_DIR/minio-data.tar.gz" minio-data

if [[ "$BACKUP_STORAGE" == true && -d /storage ]]; then
  echo "Backing up host storage..."
  tar -C / -czf "$BACKUP_DIR/storage.tar.gz" storage
elif [[ "$BACKUP_STORAGE" == true ]]; then
  echo "Host /storage does not exist; recording MinIO backup only."
fi

echo "Capturing compose and runtime state..."
cp docker-compose.pg.yml "$BACKUP_DIR/docker-compose.pg.yml"
cp docker-compose.server.override.yml "$BACKUP_DIR/docker-compose.server.override.yml"
docker compose --env-file "$ENV_FILE" "${COMPOSE_FILES[@]}" ps > "$BACKUP_DIR/compose-ps.txt"
{
  echo "created_at=$STAMP"
  echo "source_root=$ROOT_DIR"
  echo "env_file=$(basename "$ENV_FILE")"
  echo "env_sha256=$(sha256sum "$ENV_FILE" | awk '{print $1}')"
  echo "storage_archive=$([[ -f "$BACKUP_DIR/storage.tar.gz" ]] && echo true || echo false)"
  echo "sandbox_mcp_volume_manager=disabled-by-compose-profile"
} > "$BACKUP_DIR/backup-metadata.txt"

(cd "$BACKUP_DIR" && sha256sum -- * > manifest.sha256)

echo "Applying retention policy..."
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime "+$RETENTION_DAYS" -print -exec rm -rf -- {} +

echo "Backup complete: $BACKUP_DIR"
echo "Manifest: $BACKUP_DIR/manifest.sha256"
