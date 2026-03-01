#!/usr/bin/env bash

if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

HOST="${JUPYTERLAB_HOST:-127.0.0.1}"
DEFAULT_PORT="${JUPYTERLAB_PORT:-8888}"
FALLBACK_PORTS_RAW="${JUPYTERLAB_FALLBACK_PORTS:-$DEFAULT_PORT 8889 8890 8891 8892 8893}"
if [[ "${PLAYWRIGHT_BASE_URL:-}" != "" ]]; then
  BASE_URL_CANDIDATES=("$PLAYWRIGHT_BASE_URL")
else
  # shellcheck disable=SC2206
  FALLBACK_PORTS=(${FALLBACK_PORTS_RAW})
  BASE_URL_CANDIDATES=()
  for port in "${FALLBACK_PORTS[@]}"; do
    BASE_URL_CANDIDATES+=("http://${HOST}:${port}/lab")
  done
fi

BASE_URL=""
JUPYTER_PID=""
LOG_FILE="${PLAYWRIGHT_JUPYTER_LOG:-$ROOT_DIR/.jupyterlab-playwright.log}"

cleanup() {
  if [ -n "${JUPYTER_PID}" ] && kill -0 "$JUPYTER_PID" >/dev/null 2>&1; then
    kill "$JUPYTER_PID" >/dev/null 2>&1 || true
    wait "$JUPYTER_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

for candidate in "${BASE_URL_CANDIDATES[@]}"; do
  if curl -fsS "$candidate" >/dev/null 2>&1; then
    BASE_URL="$candidate"
    break
  fi
done

if [[ -z "$BASE_URL" ]]; then
  if [[ "${PLAYWRIGHT_BASE_URL:-}" != "" ]]; then
    echo "[playwright] JupyterLab is not reachable."
    echo "[playwright] Tried: $PLAYWRIGHT_BASE_URL"
    echo "[playwright] Start JupyterLab first and retry."
    exit 1
  fi

  echo "[playwright] JupyterLab is not reachable. launching automatically..."
  for port in ${FALLBACK_PORTS_RAW}; do
    BASE_URL_CANDIDATE="http://${HOST}:${port}/lab"
    echo "[playwright] launching JupyterLab on ${BASE_URL_CANDIDATE}"

    jupyter lab \
      --no-browser \
      --ServerApp.open_browser=False \
      --ServerApp.port="$port" \
      --ServerApp.ip="$HOST" \
      --IdentityProvider.token='' \
      --ServerApp.token='' \
      --ServerApp.password='' \
      >"$LOG_FILE" 2>&1 &
    JUPYTER_PID=$!

    for _ in $(seq 1 60); do
      if curl -fsS "$BASE_URL_CANDIDATE" >/dev/null 2>&1; then
        BASE_URL="$BASE_URL_CANDIDATE"
        break 2
      fi
      sleep 1
    done

    if [ -n "$JUPYTER_PID" ] && kill -0 "$JUPYTER_PID" >/dev/null 2>&1; then
      kill "$JUPYTER_PID" >/dev/null 2>&1 || true
      wait "$JUPYTER_PID" >/dev/null 2>&1 || true
    fi
    JUPYTER_PID=""
  done

  if [[ -z "$BASE_URL" ]]; then
    echo "[playwright] JupyterLab failed to start. Log: $LOG_FILE"
    exit 1
  fi
fi

if [ -x "$ROOT_DIR/node_modules/.bin/playwright" ]; then
  env PLAYWRIGHT_BASE_URL="$BASE_URL" \
    "$ROOT_DIR/node_modules/.bin/playwright" test "$@"
else
  env PLAYWRIGHT_BASE_URL="$BASE_URL" \
    npx playwright test "$@"
fi
