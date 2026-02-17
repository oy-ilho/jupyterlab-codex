#!/usr/bin/env bash

if [ -z "${BASH_VERSION:-}" ]; then
  exec bash "$0" "$@"
fi

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

PYTHON_BIN="${PYTHON_BIN:-}"
if [ -z "$PYTHON_BIN" ]; then
  if command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
  elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
  else
    echo "ERROR: python not found on PATH (also tried python3)."
    exit 1
  fi
fi

echo "[1/5] Checking Python/Jupyter prerequisites"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "ERROR: $PYTHON_BIN not found on PATH"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node not found on PATH (required to build the front-end)"
  exit 1
fi

if ! "$PYTHON_BIN" -c 'import jupyterlab' >/dev/null 2>&1; then
  echo "JupyterLab not found in this Python environment. Installing (jupyterlab>=4,<5; jupyter_server>=2,<3)..."
  "$PYTHON_BIN" -m pip install -q "jupyterlab>=4,<5" "jupyter_server>=2,<3"
fi

JLPM="jlpm"
if ! command -v jlpm >/dev/null 2>&1; then
  JLPM="python -m jupyterlab.jlpm"
fi

if ! command -v jupyter >/dev/null 2>&1; then
  echo "ERROR: jupyter command not found (expected after installing jupyterlab)."
  echo "Try: $PYTHON_BIN -m pip install \"jupyterlab>=4,<5\""
  exit 1
fi

echo "[2/5] Installing JS dependencies"
$JLPM install

echo "[3/5] Building JupyterLab extension"
$JLPM run build

echo "[4/5] Installing Python package (editable)"
"$PYTHON_BIN" -m pip install -e "$ROOT_DIR" --no-deps

echo "[5/5] Enabling server extension and linking labextension"

PREFIX="${CONDA_PREFIX:-$("$PYTHON_BIN" -c 'import sys; print(sys.prefix)')}"

JUPYTER_CFG_DIR="$PREFIX/etc/jupyter/jupyter_server_config.d"
mkdir -p "$JUPYTER_CFG_DIR"
cp -f "$ROOT_DIR/jupyter-config/jupyter_server_config.d/jupyterlab_codex.json" "$JUPYTER_CFG_DIR/jupyterlab_codex.json"

jupyter server extension enable jupyterlab_codex --sys-prefix || true
jupyter server extension list | sed -n '1,120p' || true

LABEXT_DIR="$PREFIX/share/jupyter/labextensions"
mkdir -p "$LABEXT_DIR"
ln -sfn "$ROOT_DIR/jupyterlab_codex/labextension" "$LABEXT_DIR/jupyterlab-codex-sidebar"
jupyter labextension list
