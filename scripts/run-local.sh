#!/usr/bin/env bash
# Run all five services without Docker (Linux or macOS), for quick development.
# Needs: a running PostgreSQL and Redis/Valkey, and `pip install -e services/common`
# plus each service's requirements in an active virtualenv.
# On Windows, use `docker compose up` instead (see README).
set -euo pipefail
cd "$(dirname "$0")/.."

export DATABASE_URL="${DATABASE_URL:-postgresql://horizon@127.0.0.1:5432/horizon}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379/0}"
export LOCAL_STORAGE_DIR="${LOCAL_STORAGE_DIR:-$PWD/.data/documents}"
mkdir -p .logs "$LOCAL_STORAGE_DIR"

python db/migrate.py

for pair in search-service:8001 booking-service:8002 customer-service:8003 document-service:8004 notification-worker:8005; do
  svc=${pair%%:*}; port=${pair##*:}
  (cd "services/$svc" && SERVICE_NAME=$svc nohup uvicorn app.main:app --host 127.0.0.1 --port "$port" > "../../.logs/$svc.log" 2>&1 &)
  echo "Started $svc on http://localhost:$port  (API docs at /docs, logs in .logs/$svc.log)"
done
