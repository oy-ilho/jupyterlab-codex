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
PREFIX="${CONDA_PREFIX:-$(python -c 'import sys; print(sys.prefix)')}"

# `jupyter server extension enable <name>` only toggles extensions that are already present in
# `jpserver_extensions`. Install a config snippet so the extension is discoverable, then enable it.
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
