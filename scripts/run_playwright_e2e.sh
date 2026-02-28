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
for candidate in "${BASE_URL_CANDIDATES[@]}"; do
  if curl -fsS "$candidate" >/dev/null 2>&1; then
    BASE_URL="$candidate"
    break
  fi
done

if [[ -z "$BASE_URL" ]]; then
  echo "[playwright] JupyterLab is not reachable."
  if [[ "${PLAYWRIGHT_BASE_URL:-}" != "" ]]; then
    echo "[playwright] Tried: $PLAYWRIGHT_BASE_URL"
  else
    echo "[playwright] Tried: ${FALLBACK_PORTS_RAW}"
  fi
  echo "[playwright] Start JupyterLab first and retry."
  echo "[playwright] Or run auto-start mode:"
  echo "[playwright]   jlpm test:e2e:repro-local"
  exit 1
fi

if [ -x "$ROOT_DIR/node_modules/.bin/playwright" ]; then
  env PLAYWRIGHT_BASE_URL="$BASE_URL" \
    "$ROOT_DIR/node_modules/.bin/playwright" test "$@"
else
  env PLAYWRIGHT_BASE_URL="$BASE_URL" \
    npx playwright test "$@"
fi
