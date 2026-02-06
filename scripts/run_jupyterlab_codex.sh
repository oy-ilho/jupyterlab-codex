#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[1/6] Installing JS dependencies"
jlpm install

echo "[2/6] Building JupyterLab extension"
jlpm run build

echo "[3/6] Installing Python package (editable)"
python -m pip install -e "$ROOT_DIR"

echo "[4/6] Enabling server extension"
jupyter server extension enable jupyterlab_codex --sys-prefix

PREFIX="${CONDA_PREFIX:-$(python -c 'import sys; print(sys.prefix)')}"
LABEXT_DIR="$PREFIX/share/jupyter/labextensions"
mkdir -p "$LABEXT_DIR"

echo "[5/6] Linking labextension into $LABEXT_DIR"
ln -sfn "$ROOT_DIR/jupyterlab_codex/labextension" "$LABEXT_DIR/jupyterlab-codex"

echo "[6/6] Current labextension status"
jupyter labextension list

echo "Starting JupyterLab..."
exec jupyter lab --no-browser --ServerApp.open_browser=False "$@"
