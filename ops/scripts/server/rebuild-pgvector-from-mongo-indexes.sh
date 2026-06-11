#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${FASTGPT_DEPLOY_DIR:-/opt/fastgpt}"
BACKUP_ROOT="${FASTGPT_BACKUP_DIR:-/opt/fastgpt-backups}"
COMPOSE_FILES=(-f docker-compose.pg.yml -f docker-compose.server.override.yml)
ENV_FILE="${FASTGPT_ENV_FILE:-.env}"
VECTOR_DIMENSIONS="${VECTOR_DIMENSIONS:-2048}"
EMBEDDING_MODEL="${EMBEDDING_MODEL:-Qwen/Qwen3-Embedding-8B}"
EMBEDDING_BATCH_SIZE="${EMBEDDING_BATCH_SIZE:-1}"
MONGO_DB="${MONGO_DB:-fastgpt}"
EXECUTE="false"

usage() {
  cat <<'EOF'
Usage:
  rebuild-pgvector-from-mongo-indexes.sh [--execute]

Rebuild pgvector modeldata rows from existing Mongo dataset_datas.indexes.dataId.
Default mode is dry-run and only prints counts.

Required for --execute:
  EMBEDDING_BASE_URL   OpenAI-compatible base URL, for example https://api.siliconflow.cn/v1
  EMBEDDING_API_KEY    Provider API key

Optional:
  EMBEDDING_MODEL      Default: Qwen/Qwen3-Embedding-8B
  VECTOR_DIMENSIONS    Default: 2048
  EMBEDDING_BATCH_SIZE Default: 1
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --execute)
      EXECUTE="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

cd "${ROOT_DIR}"

echo "Checking Mongo index references..."
docker compose --env-file "${ENV_FILE}" "${COMPOSE_FILES[@]}" exec -T fastgpt-mongo \
  mongosh \
  -u "${MONGO_INITDB_ROOT_USERNAME:-myusername}" \
  -p "${MONGO_INITDB_ROOT_PASSWORD:-mypassword}" \
  --authenticationDatabase admin \
  "${MONGO_DB}" \
  --quiet <<'JS'
const rows = db.dataset_datas.aggregate([
  { $unwind: '$indexes' },
  { $match: { 'indexes.dataId': { $exists: true, $ne: '' }, 'indexes.text': { $type: 'string', $ne: '' } } },
  {
    $group: {
      _id: '$indexes.dataId',
      teamId: { $first: '$teamId' },
      datasetId: { $first: '$datasetId' },
      collectionId: { $first: '$collectionId' },
      text: { $first: '$indexes.text' },
      refCount: { $sum: 1 }
    }
  },
  { $group: { _id: null, uniqueVectorIds: { $sum: 1 }, totalRefs: { $sum: '$refCount' } } }
]).toArray()[0] || { uniqueVectorIds: 0, totalRefs: 0 };
printjson(rows);
JS

if [[ "${EXECUTE}" != "true" ]]; then
  echo "Dry-run complete. Re-run with --execute to rebuild modeldata."
  exit 0
fi

if [[ -z "${EMBEDDING_BASE_URL:-}" || -z "${EMBEDDING_API_KEY:-}" ]]; then
  echo "EMBEDDING_BASE_URL and EMBEDDING_API_KEY are required with --execute." >&2
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${BACKUP_ROOT}/${STAMP}-before-pgvector-rebuild"
mkdir -p "${BACKUP_DIR}"

echo "Backing up PostgreSQL/vector database to ${BACKUP_DIR}..."
docker compose --env-file "${ENV_FILE}" "${COMPOSE_FILES[@]}" exec -T fastgpt-vector \
  pg_dumpall \
  -U "${POSTGRES_USER:-username}" > "${BACKUP_DIR}/postgres.sql"
gzip "${BACKUP_DIR}/postgres.sql"

TMP_JSONL="/tmp/fastgpt-index-vectors-${STAMP}.jsonl"
echo "Exporting Mongo index texts to ${TMP_JSONL}..."
docker compose --env-file "${ENV_FILE}" "${COMPOSE_FILES[@]}" exec -T fastgpt-mongo \
  mongosh \
  -u "${MONGO_INITDB_ROOT_USERNAME:-myusername}" \
  -p "${MONGO_INITDB_ROOT_PASSWORD:-mypassword}" \
  --authenticationDatabase admin \
  "${MONGO_DB}" \
  --quiet > "${TMP_JSONL}" <<'JS'
db.dataset_datas.aggregate([
  { $unwind: '$indexes' },
  { $match: { 'indexes.dataId': { $exists: true, $ne: '' }, 'indexes.text': { $type: 'string', $ne: '' } } },
  {
    $group: {
      _id: '$indexes.dataId',
      teamId: { $first: '$teamId' },
      datasetId: { $first: '$datasetId' },
      collectionId: { $first: '$collectionId' },
      text: { $first: '$indexes.text' }
    }
  },
  { $sort: { _id: 1 } }
], { allowDiskUse: true }).forEach((item) => print(JSON.stringify({
  id: String(item._id),
  teamId: String(item.teamId),
  datasetId: String(item.datasetId),
  collectionId: String(item.collectionId),
  text: item.text
})));
JS

echo "Recreating modeldata as HALFVEC(${VECTOR_DIMENSIONS})..."
docker compose --env-file "${ENV_FILE}" "${COMPOSE_FILES[@]}" exec -T fastgpt-vector \
  psql -U "${POSTGRES_USER:-username}" -d "${POSTGRES_DB:-postgres}" <<SQL
CREATE EXTENSION IF NOT EXISTS vector;
DROP TABLE IF EXISTS modeldata;
CREATE TABLE modeldata (
  id BIGINT PRIMARY KEY,
  vector HALFVEC(${VECTOR_DIMENSIONS}) NOT NULL,
  team_id VARCHAR(50) NOT NULL,
  dataset_id VARCHAR(50) NOT NULL,
  collection_id VARCHAR(50) NOT NULL,
  createtime TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
SQL

echo "Embedding and importing vectors..."
docker run --rm \
  --network container:${PG_CONTAINER:-fastgpt-pg} \
  -v "${TMP_JSONL}:/work/indexes.jsonl:ro" \
  -e PGHOST=127.0.0.1 \
  -e PGPORT=5432 \
  -e PGUSER="${POSTGRES_USER:-username}" \
  -e PGPASSWORD="${POSTGRES_PASSWORD:-password}" \
  -e PGDATABASE="${POSTGRES_DB:-postgres}" \
  -e EMBEDDING_BASE_URL \
  -e EMBEDDING_API_KEY \
  -e EMBEDDING_MODEL \
  -e VECTOR_DIMENSIONS \
  -e EMBEDDING_BATCH_SIZE \
  node:20-alpine sh -lc 'npm add pg >/dev/null 2>&1 && node -' <<'NODE'
const fs = require('fs');
const { Client } = require('pg');

const rows = fs.readFileSync('/work/indexes.jsonl', 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse).filter((item) => /^\d+$/.test(item.id));
const client = new Client();
const dimensions = Number(process.env.VECTOR_DIMENSIONS || 2048);
const batchSize = Math.max(1, Number(process.env.EMBEDDING_BATCH_SIZE || 1));

function normalizeVector(vector) {
  if (vector.length > dimensions) return vector.slice(0, dimensions);
  if (vector.length < dimensions) return vector.concat(Array(dimensions - vector.length).fill(0));
  return vector;
}

async function embed(texts) {
  const res = await fetch(`${process.env.EMBEDDING_BASE_URL.replace(/\/$/, '')}/embeddings`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.EMBEDDING_API_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.EMBEDDING_MODEL,
      input: texts,
      encoding_format: 'float',
      dimensions
    })
  });
  if (!res.ok) throw new Error(`embedding ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return body.data.map((item) => normalizeVector(item.embedding));
}

(async () => {
  await client.connect();
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    let vectors;
    try {
      vectors = await embed(batch.map((item) => item.text));
    } catch (error) {
      vectors = [];
      for (const item of batch) {
        try {
          vectors.push((await embed([item.text]))[0]);
        } catch (singleError) {
          console.error(`skip ${item.id}: ${singleError.message}`);
          vectors.push(null);
        }
      }
    }

    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      const vector = vectors[j];
      if (!vector) continue;
      await client.query(
        'INSERT INTO modeldata(id, vector, team_id, dataset_id, collection_id) VALUES($1, $2, $3, $4, $5)',
        [item.id, `[${vector}]`, item.teamId, item.datasetId, item.collectionId]
      );
      inserted++;
    }

    if (inserted % 100 === 0) console.log(`inserted=${inserted}/${rows.length}`);
  }

  await client.end();
  console.log(`done inserted=${inserted}/${rows.length}`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE

echo "Creating vector indexes..."
docker compose --env-file "${ENV_FILE}" "${COMPOSE_FILES[@]}" exec -T fastgpt-vector \
  psql -U "${POSTGRES_USER:-username}" -d "${POSTGRES_DB:-postgres}" <<'SQL'
CREATE INDEX vector_index ON modeldata USING hnsw (vector halfvec_ip_ops) WITH (m = 32, ef_construction = 128);
CREATE INDEX team_dataset_collection_index ON modeldata USING btree(team_id, dataset_id, collection_id);
CREATE INDEX create_time_index ON modeldata USING btree(createtime);
SELECT count(*) AS modeldata_count, min(vector_dims(vector)) AS min_dims, max(vector_dims(vector)) AS max_dims FROM modeldata;
SQL

rm -f "${TMP_JSONL}"
echo "pgvector rebuild complete."
