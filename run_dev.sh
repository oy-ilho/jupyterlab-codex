#!/usr/bin/env bash

if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "[1/1] Running install script (install_dev.sh)"
bash "$ROOT_DIR/install_dev.sh"

echo "[2/2] Starting JupyterLab..."
exec jupyter lab --no-browser --ServerApp.open_browser=False "$@"
