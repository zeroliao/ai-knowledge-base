#!/usr/bin/env bash
set -euo pipefail

IMAGE_TAG="url-directory-005"
IMAGE_ARCHIVE="/tmp/fastgpt-custom-${IMAGE_TAG}.tar"
OVERRIDE_FILE="/tmp/docker-compose.server.override.yml"
BASE_DIR="/opt/fastgpt"
BACKUP_ROOT="/opt/fastgpt-backups"
CONFIG_CHECK_FILE=""
COMPOSE_FILES=(-f docker-compose.pg.yml -f docker-compose.server.override.yml)

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
backup_dir="${BACKUP_ROOT}/${ts}-before-${IMAGE_TAG}"
mkdir -p "$backup_dir"

echo "Stopping fastgpt-app before vector dimension migration..."
docker compose --env-file .env "${COMPOSE_FILES[@]}" stop fastgpt-app || true

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

CONFIG_CHECK_FILE="$(mktemp /tmp/fastgpt-compose-${IMAGE_TAG}.XXXXXX.yml)"
docker compose --env-file .env "${COMPOSE_FILES[@]}" config >"$CONFIG_CHECK_FILE"

echo "Migrating pgvector table to HALFVEC(2048)..."
docker compose --env-file .env "${COMPOSE_FILES[@]}" exec -T fastgpt-vector \
  psql -U "${POSTGRES_USER:-username}" -d "${POSTGRES_DB:-postgres}" <<'SQL'
CREATE EXTENSION IF NOT EXISTS vector;
DROP TABLE IF EXISTS modeldata;
CREATE TABLE modeldata (
  id BIGSERIAL PRIMARY KEY,
  vector HALFVEC(2048) NOT NULL,
  team_id VARCHAR(50) NOT NULL,
  dataset_id VARCHAR(50) NOT NULL,
  collection_id VARCHAR(50) NOT NULL,
  createtime TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX vector_index ON modeldata USING hnsw (vector halfvec_ip_ops) WITH (m = 32, ef_construction = 128);
CREATE INDEX team_dataset_collection_index ON modeldata USING btree(team_id, dataset_id, collection_id);
CREATE INDEX create_time_index ON modeldata USING btree(createtime);
SQL

echo "Updating Qwen/Qwen3-Embedding-8B dimensions and queuing dataset vector rebuild..."
docker compose --env-file .env "${COMPOSE_FILES[@]}" exec -T fastgpt-mongo \
  mongosh \
  -u "${MONGO_INITDB_ROOT_USERNAME:-myusername}" \
  -p "${MONGO_INITDB_ROOT_PASSWORD:-mypassword}" \
  --authenticationDatabase admin \
  fastgpt \
  --quiet <<'JS'
const now = new Date();
const resetLockTime = new Date('2000-01-01T00:00:00Z');
const billId = 'dimension-2048-' + Date.now();

const modelRes = db.system_models.updateOne(
  { model: 'Qwen/Qwen3-Embedding-8B' },
  {
    $set: {
      'metadata.defaultConfig': { dimensions: 2048 },
      'metadata.defaultToken': 2048,
      'metadata.maxToken': 2048
    }
  }
);

const deletedTrainings = db.dataset_trainings.deleteMany({});
const clearedRebuilding = db.dataset_datas.updateMany({}, { $unset: { rebuilding: '' } });

let inserted = 0;
let batch = [];

const flush = () => {
  if (!batch.length) return;
  db.dataset_trainings.insertMany(batch, { ordered: false });
  inserted += batch.length;
  batch = [];
};

const cursor = db.dataset_datas.aggregate(
  [
    {
      $lookup: {
        from: 'datasets',
        localField: 'datasetId',
        foreignField: '_id',
        as: 'dataset'
      }
    },
    { $unwind: '$dataset' },
    {
      $match: {
        'dataset.deleteTime': null,
        'dataset.vectorModel': 'Qwen/Qwen3-Embedding-8B'
      }
    },
    {
      $project: {
        teamId: 1,
        tmbId: 1,
        datasetId: 1,
        collectionId: 1,
        imageId: 1,
        q: 1,
        indexes: 1
      }
    }
  ],
  { allowDiskUse: true }
);

while (cursor.hasNext()) {
  const data = cursor.next();
  batch.push({
    teamId: data.teamId,
    tmbId: data.tmbId,
    datasetId: data.datasetId,
    collectionId: data.collectionId,
    billId,
    mode: 'chunk',
    dataId: data._id,
    ...(data.imageId ? { imageId: data.imageId } : {}),
    retryCount: 50,
    lockTime: resetLockTime,
    expireAt: now
  });
  if (batch.length >= 500) flush();
}
flush();

printjson({
  modelMatched: modelRes.matchedCount,
  modelModified: modelRes.modifiedCount,
  deletedTrainings: deletedTrainings.deletedCount,
  clearedRebuilding: clearedRebuilding.modifiedCount,
  rebuildTasksInserted: inserted
});
JS

echo "Starting fastgpt-app with ${IMAGE_TAG}..."
docker compose --env-file .env "${COMPOSE_FILES[@]}" up -d fastgpt-app

for i in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:3000 >/dev/null; then
    docker ps --filter name=fastgpt-app --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
    docker compose --env-file .env "${COMPOSE_FILES[@]}" exec -T fastgpt-vector \
      psql -U "${POSTGRES_USER:-username}" -d "${POSTGRES_DB:-postgres}" \
      -c "SELECT format_type(atttypid, atttypmod) AS vector_type FROM pg_attribute WHERE attrelid = 'modeldata'::regclass AND attname = 'vector'; SELECT count(*) AS modeldata_count FROM modeldata;"
    echo "Backup directory: ${backup_dir}"
    exit 0
  fi
  sleep 2
done

docker logs fastgpt-app --tail=160
exit 1
