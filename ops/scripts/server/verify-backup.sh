#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${1:-}"

usage() {
  cat <<'EOF'
Usage: verify-backup.sh BACKUP_DIR

Checks required backup artifacts, gzip integrity and SHA-256 manifest without
connecting to Docker or changing any data.
EOF
}

if [[ "${BACKUP_DIR}" == "-h" || "${BACKUP_DIR}" == "--help" || -z "${BACKUP_DIR}" ]]; then usage; exit 2; fi
[[ -d "$BACKUP_DIR" ]] || { echo "Backup directory not found: $BACKUP_DIR" >&2; exit 1; }
for file in mongo.archive.gz postgres.sql.gz; do
  [[ -f "$BACKUP_DIR/$file" ]] || { echo "Missing backup artifact: $file" >&2; exit 1; }
done
if [[ -f "$BACKUP_DIR/manifest.sha256" ]]; then
  echo "Checking SHA-256 manifest..."
  (cd "$BACKUP_DIR" && sha256sum -c manifest.sha256)
else
  echo "Warning: legacy backup has no manifest.sha256; continuing with format checks." >&2
fi
echo "Checking compressed database dumps..."
gzip -t "$BACKUP_DIR/mongo.archive.gz" "$BACKUP_DIR/postgres.sql.gz"
if [[ -f "$BACKUP_DIR/minio-data.tar.gz" ]]; then
  echo "Checking MinIO archive..."
  tar -tzf "$BACKUP_DIR/minio-data.tar.gz" >/dev/null
elif [[ -d "$BACKUP_DIR/minio-data" ]]; then
  echo "Checking MinIO directory backup..."
  test -r "$BACKUP_DIR/minio-data"
else
  echo "Missing MinIO artifact: minio-data.tar.gz or minio-data/" >&2
  exit 1
fi
if [[ -f "$BACKUP_DIR/storage.tar.gz" ]]; then
  echo "Checking host storage archive..."
  tar -tzf "$BACKUP_DIR/storage.tar.gz" >/dev/null
fi
echo "Backup verification passed: $BACKUP_DIR"
