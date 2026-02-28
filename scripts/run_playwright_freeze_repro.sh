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
MOCK_CODEX="${PLAYWRIGHT_CODEX_COMMAND:-$ROOT_DIR/tests/e2e/mock-codex-cli-flood.py}"
LOG_FILE="${PLAYWRIGHT_JUPYTER_LOG:-$ROOT_DIR/.jupyterlab-playwright-freeze.log}"

cleanup() {
  if [ -n "${JUPYTER_PID:-}" ] && kill -0 "$JUPYTER_PID" >/dev/null 2>&1; then
    kill "$JUPYTER_PID" >/dev/null 2>&1 || true
    wait "$JUPYTER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "[playwright] launching JupyterLab on ${BASE_URL}"
jupyter lab \
  --no-browser \
  --ServerApp.open_browser=False \
  --ServerApp.port="$PORT" \
  --ServerApp.ip="$HOST" \
  --IdentityProvider.token='' \
  --ServerApp.token='' \
  --ServerApp.password='' \
  >"$LOG_FILE" 2>&1 &
JUPYTER_PID=$!

echo "[playwright] waiting for JupyterLab to be ready..."
for _ in $(seq 1 60); do
  if curl -fsS "$BASE_URL" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "$BASE_URL" >/dev/null 2>&1; then
  echo "[playwright] JupyterLab failed to start. Log: $LOG_FILE"
  exit 1
fi

echo "[playwright] running notebook-tab freeze reproduction e2e"
PLAYWRIGHT_BASE_URL="$BASE_URL" \
PLAYWRIGHT_CODEX_COMMAND="$MOCK_CODEX" \
MOCK_CODEX_EVENT_COUNT="${MOCK_CODEX_EVENT_COUNT:-360}" \
MOCK_CODEX_EVENT_DELAY_MS="${MOCK_CODEX_EVENT_DELAY_MS:-20}" \
MOCK_CODEX_CHUNK_WORDS="${MOCK_CODEX_CHUNK_WORDS:-14}" \
npx playwright test tests/e2e/freeze-notebook-tabs-repro.spec.js "$@"
