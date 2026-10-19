#!/usr/bin/env bash
set -euo pipefail

FRONTEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${TAMP_BACKEND_DIR:-$(cd "$FRONTEND_DIR/../.." && pwd)/tamp_backend}"
TEST_URL="${TEST_DATABASE_URL:-}"

if [[ -z "$TEST_URL" || "${TEST_URL##*/}" != *test* ]]; then
  echo "Set TEST_DATABASE_URL to a dedicated PostgreSQL database whose name contains 'test'." >&2
  exit 2
fi
if [[ ! -x "$BACKEND_DIR/.venv/bin/python" ]]; then
  echo "Backend virtual environment not found at $BACKEND_DIR/.venv" >&2
  exit 2
fi

BACKEND_PID=""
cleanup() {
  if [[ -n "$BACKEND_PID" ]]; then kill "$BACKEND_PID" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

cd "$BACKEND_DIR"
export DATABASE_URL="$TEST_URL"
export ENVIRONMENT=development
export DEV_EMAIL_CODES=true
export SECRET_KEY="fullstack-e2e-secret-key-change-only-in-tests"
export CORS_ORIGINS='["http://127.0.0.1:4174"]'
export ALLOWED_HOSTS='["127.0.0.1","localhost"]'
export BOOTSTRAP_SECRET=""
export LOG_PATH="/tmp/tamp-e2e-logs"
"$BACKEND_DIR/.venv/bin/python" -m alembic upgrade head
"$BACKEND_DIR/.venv/bin/python" -m scripts.seed_e2e
"$BACKEND_DIR/.venv/bin/python" -m uvicorn app.main:app --host 127.0.0.1 --port 5001 --no-proxy-headers > /tmp/tamp-e2e-backend.log 2>&1 &
BACKEND_PID=$!

for _ in {1..40}; do
  if curl --fail --silent http://127.0.0.1:5001/api/v1/health >/dev/null; then break; fi
  sleep 0.25
done
curl --fail --silent http://127.0.0.1:5001/api/v1/health >/dev/null || { cat /tmp/tamp-e2e-backend.log; exit 1; }

cd "$FRONTEND_DIR"
npm run build
PLAYWRIGHT_DEMO="${PLAYWRIGHT_DEMO:-0}" npx playwright test --config playwright.fullstack.config.ts "$@"
