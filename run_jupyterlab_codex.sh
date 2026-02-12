#!/usr/bin/env bash

if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "[0/6] Checking Python/Jupyter prerequisites"

if ! command -v python >/dev/null 2>&1; then
  echo "ERROR: python not found on PATH"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node not found on PATH (required to build the front-end)"
  exit 1
fi

if ! python -c 'import jupyterlab' >/dev/null 2>&1; then
  echo "JupyterLab not found in this Python environment. Installing (jupyterlab>=4,<5; jupyter_server>=2,<3)..."
  python -m pip install -q "jupyterlab>=4,<5" "jupyter_server>=2,<3"
fi

JLPM="jlpm"
if ! command -v jlpm >/dev/null 2>&1; then
  JLPM="python -m jupyterlab.jlpm"
fi

if ! command -v jupyter >/dev/null 2>&1; then
  echo "ERROR: jupyter command not found (expected after installing jupyterlab)."
  echo "Try: python -m pip install \"jupyterlab>=4,<5\""
  exit 1
fi

echo "[1/6] Installing JS dependencies"
$JLPM install

echo "[2/6] Building JupyterLab extension"
$JLPM run build

echo "[3/6] Installing Python package (editable)"
python -m pip install -e "$ROOT_DIR" --no-deps

echo "[4/6] Enabling server extension"
PREFIX="${CONDA_PREFIX:-$(python -c 'import sys; print(sys.prefix)')}"

JUPYTER_CFG_DIR="$PREFIX/etc/jupyter/jupyter_server_config.d"
mkdir -p "$JUPYTER_CFG_DIR"
cp -f "$ROOT_DIR/jupyter-config/jupyter_server_config.d/jupyterlab_codex.json" "$JUPYTER_CFG_DIR/jupyterlab_codex.json"

jupyter server extension enable jupyterlab_codex --sys-prefix || true
jupyter server extension list | sed -n '1,120p' || true

LABEXT_DIR="$PREFIX/share/jupyter/labextensions"
mkdir -p "$LABEXT_DIR"

echo "[5/6] Linking labextension into $LABEXT_DIR"
ln -sfn "$ROOT_DIR/jupyterlab_codex/labextension" "$LABEXT_DIR/jupyterlab-codex"

echo "[6/6] Current labextension status"
jupyter labextension list

echo "Starting JupyterLab..."
exec jupyter lab --no-browser --ServerApp.open_browser=False "$@"
