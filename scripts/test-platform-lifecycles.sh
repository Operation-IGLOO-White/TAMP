#!/usr/bin/env bash
set -euo pipefail

FRONTEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${TAMP_BACKEND_DIR:-$(cd "$FRONTEND_DIR/../.." && pwd)/tamp_backend}"
TEST_URL="${TEST_DATABASE_URL:-}"
SUITE="${1:-all}"
if [[ $# -gt 0 ]]; then shift; fi
case "$SUITE" in
  trucks) TEST_FILES=(tests/test_fleet_assets.py tests/test_workflow.py tests/test_lifecycle.py tests/test_multistop.py tests/test_matching_compliance.py tests/test_driver_compliance.py) ;;
  assets) TEST_FILES=(tests/test_asset_hire.py) ;;
  buses) TEST_FILES=(tests/test_passenger_fleet.py) ;;
  all) TEST_FILES=(tests/test_fleet_assets.py tests/test_workflow.py tests/test_lifecycle.py tests/test_multistop.py tests/test_matching_compliance.py tests/test_driver_compliance.py tests/test_asset_hire.py tests/test_passenger_fleet.py tests/test_rbac.py tests/test_tenant_isolation.py) ;;
  *) echo "Choose a suite: trucks, assets, buses, or all." >&2; exit 2 ;;
esac

if [[ -z "$TEST_URL" || "${TEST_URL##*/}" != *test* ]]; then
  echo "Set TEST_DATABASE_URL to a dedicated PostgreSQL database whose name contains 'test'." >&2
  exit 2
fi
if [[ ! -x "$BACKEND_DIR/.venv/bin/python" ]]; then
  echo "Backend virtual environment not found at $BACKEND_DIR/.venv" >&2
  exit 2
fi

cd "$FRONTEND_DIR"
npm run typecheck
cd "$BACKEND_DIR"
TEST_DATABASE_URL="$TEST_URL" "$BACKEND_DIR/.venv/bin/python" -m pytest -v "${TEST_FILES[@]}" "$@"
