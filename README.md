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

## 설치 방법 (Korean)
1) 프론트엔드 빌드
- `jlpm install`
- `jlpm build`  
  (빌드 결과는 `jupyterlab_codex/labextension`에 생성됩니다)

2) 파이썬 패키지 / 서버 확장 설치
- `python -m pip install -e .`
- 서버 확장 활성화(최초 1회):
  - `jupyter server extension enable jupyterlab_codex --sys-prefix`

3) JupyterLab 실행
- `jupyter lab`

참고
- WebSocket 엔드포인트: `/codex/ws`
- 서버 확장은 요청마다 `codex exec --json --color never -`를 실행합니다.
- 세션 히스토리는 `~/.jupyter/codex-sessions/`에 저장됩니다.
