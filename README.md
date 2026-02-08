# JupyterLab Codex Sidebar

JupyterLab 4 우측 사이드바에서 Codex CLI(`codex exec --json`)를 채팅 UI로 사용할 수 있게 해주는 확장입니다.

구성은 아래 2개로 나뉩니다.
- 프론트엔드: JupyterLab prebuilt 확장(React)
- 백엔드: Jupyter Server 확장(WebSocket: `/codex/ws`)

백엔드는 요청마다 로컬의 `codex` 실행 파일을 서브프로세스로 호출하고(JSONL 이벤트 스트리밍), UI가 이를 받아 채팅처럼 렌더링합니다.

## 주요 기능
- 노트북 경로 기준으로 스레드(세션) 분리
- 모델 / Reasoning Effort / 샌드박스 권한을 UI에서 선택
- 활성 셀 텍스트를 프롬프트에 포함할지 선택
- `.ipynb` ↔ `.py`(Jupytext paired) 워크플로우를 전제로 동작(페어링된 `.py`가 없으면 실행이 비활성화됨)
- 세션 로그 저장: `~/.jupyter/codex-sessions/`
- (가능한 경우) Codex 사용량 스냅샷 표시: `~/.codex/sessions/` 를 best-effort로 스캔

## 요구 사항
- Python 3.9+
- JupyterLab 4 / Jupyter Server
- Codex CLI 설치 및 인증 완료(터미널에서 `codex exec`가 동작해야 함)
- (소스에서 빌드 시) Node.js + `jlpm` + `jupyter labextension` 명령 사용 가능

## 설치/실행
### 빠른 실행(권장)
아래 스크립트는 “개발/로컬 실행”에 필요한 과정을 한 번에 수행합니다.

```bash
bash scripts/run_jupyterlab_codex.sh
```

스크립트가 하는 일(요약):
- JS 의존성 설치(`jlpm install`) 및 빌드(`jlpm build`)
- 파이썬 패키지 editable 설치(`python -m pip install -e .`)
- 서버 확장 활성화용 config 스니펫 설치 + enable
- labextension을 현재 파이썬 환경의 `share/jupyter/labextensions/`에 symlink
- `jupyter lab` 실행

추가로 JupyterLab 옵션을 넘기고 싶다면, 스크립트 뒤에 그대로 붙이면 됩니다.

```bash
bash scripts/run_jupyterlab_codex.sh --ServerApp.port=8888
```

### 수동 설치(개발/로컬)
1) 프론트엔드 빌드

```bash
jlpm install
jlpm build
```

2) 파이썬 패키지 설치

```bash
python -m pip install -e .
```

3) 서버 확장 활성화(최초 1회)

```bash
PREFIX="${CONDA_PREFIX:-$(python -c 'import sys; print(sys.prefix)')}"
mkdir -p "$PREFIX/etc/jupyter/jupyter_server_config.d"
cp jupyter-config/jupyter_server_config.d/jupyterlab_codex.json \
  "$PREFIX/etc/jupyter/jupyter_server_config.d/jupyterlab_codex.json"

# 필요 시(또는 확인용)
jupyter server extension enable jupyterlab_codex --sys-prefix || true
jupyter server extension list | sed -n '1,120p' || true
```

4) labextension 링크(Editable 설치에서 필요)

```bash
PREFIX="${CONDA_PREFIX:-$(python -c 'import sys; print(sys.prefix)')}"
mkdir -p "$PREFIX/share/jupyter/labextensions"
ln -sfn "$(pwd)/jupyterlab_codex/labextension" "$PREFIX/share/jupyter/labextensions/jupyterlab-codex"
jupyter labextension list
```

5) JupyterLab 실행

```bash
jupyter lab
```

## 사용 방법
1) JupyterLab을 실행한 뒤 노트북을 열면, 우측 사이드바에 `Codex` 패널이 나타납니다.
2) 메시지를 입력하고 전송하면 서버가 `codex exec --json ...` 를 실행하고 결과를 스트리밍합니다.
3) Settings에서 아래 옵션을 조정할 수 있습니다.
- Auto-save before send: 전송 전에 노트북을 자동 저장
- Include active cell: 활성 셀 텍스트를 프롬프트에 포함
- Include active cell output: 활성 셀 output(텍스트 위주)을 프롬프트에 포함
- Model / Reasoning Effort / Permission(샌드박스)

## 설정(옵션)
서버 측 기본값은 환경 변수로도 지정할 수 있습니다.
- `JUPYTERLAB_CODEX_MODEL`: 모델을 명시하지 않았을 때 기본 모델로 사용
- `JUPYTERLAB_CODEX_SANDBOX`: 샌드박스 기본값(기본: `workspace-write`)

참고: UI에서 모델/권한을 명시적으로 선택하면, 해당 값이 요청에 포함되어 CLI 인자로 전달됩니다.

## 데이터/경로
- WebSocket 엔드포인트: `/codex/ws`
- 세션 로그: `~/.jupyter/codex-sessions/*.jsonl` 및 `*.meta.json`
- 사용량 스냅샷(best-effort): `~/.codex/sessions/**/*.jsonl` 의 최근 로그를 일부 스캔

## 트러블슈팅
- 사이드바가 보이지 않음:
  - `jupyter labextension list` 에서 `jupyterlab-codex`가 잡히는지 확인
  - editable 설치라면 “labextension 링크” 단계가 빠졌는지 확인
- WebSocket이 `disconnected`로만 표시됨:
  - `jupyter server extension list` 에서 `jupyterlab_codex`가 enabled인지 확인
  - 서버 로그에 에러가 없는지 확인
- `codex` 실행 파일을 찾지 못함:
  - 터미널에서 `codex exec --help` 가 동작하는지 확인
  - PATH/가상환경을 정리한 뒤 JupyterLab 서버를 재시작

## 개발 메모
- `jlpm watch`: 프론트엔드 자동 빌드/갱신
- 주요 코드 위치:
  - UI: `src/panel.tsx`
  - 서버: `jupyterlab_codex/handlers.py`, `jupyterlab_codex/runner.py`

## 아키텍처(요약 플로우)
```
[UI (JupyterLab Sidebar)]
   |
   | WebSocket: /codex/ws
   v
[CodexWSHandler (Jupyter Server)]
   |
   v
[CodexRunner]
  - subprocess: codex exec --json --color never --skip-git-repo-check ...
   |
   v
[UI 출력 렌더링]
```
