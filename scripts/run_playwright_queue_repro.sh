#!/usr/bin/env bash

if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PORT="${JUPYTERLAB_PORT:-8888}"
HOST="${JUPYTERLAB_HOST:-127.0.0.1}"
BASE_URL="${PLAYWRIGHT_BASE_URL:-http://${HOST}:${PORT}/lab}"

if ! curl -fsS "$BASE_URL" >/dev/null 2>&1; then
  echo "[playwright] JupyterLab is not reachable at $BASE_URL."
  echo "[playwright] Start JupyterLab first and retry, or run:"
  echo "[playwright]   npm run test:e2e:repro-local"
  exit 1
fi

echo "[playwright] running queue reproduction e2e against $BASE_URL"
PLAYWRIGHT_BASE_URL="$BASE_URL" \
PLAYWRIGHT_CODEX_COMMAND="${PLAYWRIGHT_CODEX_COMMAND:-$ROOT_DIR/tests/e2e/mock-codex-cli.py}" \
MOCK_CODEX_DELAY_MS="${MOCK_CODEX_DELAY_MS:-2600}" \
playwright test tests/e2e/queue-multitab-repro.spec.js "$@"
