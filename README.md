# JupyterLab Codex Sidebar

JupyterLab 4 extension that provides a chat-style sidebar UI backed by the Codex CLI
(`codex exec --json`) and a Jupyter Server extension for streaming I/O.

## Goals
- Chat-style sidebar in the right panel
- Bidirectional communication with Codex CLI
- Jupytext paired notebooks workflow (edit the paired `.py` file)
- File-change detection with user-confirmed reload

## Local development (scaffold)
1) Frontend
- `jlpm install`
- `jlpm build` (builds a prebuilt labextension into `jupyterlab_codex/labextension`)

2) Python package / server extension
- `python -m pip install -e .`
- Enable the server extension (once):
  - `jupyter server extension enable jupyterlab_codex --sys-prefix`

3) Run JupyterLab
- `jupyter lab`

Notes
- The WebSocket endpoint is `/codex/ws`.
- The server extension launches `codex exec --json --color never -` per request.
- Session history is stored under `~/.jupyter/codex-sessions/`.
