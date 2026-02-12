#!/usr/bin/env bash

# Backward-compatible entrypoint. The canonical script lives in scripts/.
if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/scripts/run_jupyterlab_codex.sh" "$@"

