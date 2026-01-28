# JupyterLab Codex Sidebar

Codex CLI(`codex exec --json`)와 연동되는 채팅형 사이드바 UI를 제공하는 JupyterLab 4 확장입니다.
서버 확장을 통해 Codex CLI와의 양방향 스트리밍 통신을 지원합니다.

## 목표
- 오른쪽 사이드바에 채팅형 UI 제공
- Codex CLI와의 양방향 통신
- Jupytext paired 노트북 워크플로우(.ipynb ↔ .py)
- 파일 변경 감지 시 사용자 확인 후 reload

## 설치 방법
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

## 참고
- WebSocket 엔드포인트: `/codex/ws`
- 서버 확장은 요청마다 `codex exec --json --color never -`를 실행합니다.
- 세션 히스토리는 `~/.jupyter/codex-sessions/`에 저장됩니다.

## 플로우
아래는 코드 기반의 전체 플로우(데이터/제어 흐름) 요약입니다.

```
[사용자 입력]
   |
   v
[JupyterLab Codex 사이드바 UI]
  - ReactWidget/CodexPanel
  - 메시지 입력, 첨부 셀 텍스트 옵션
   |
   | WebSocket: /codex/ws
   v
[CodexWSHandler (서버)]
  - start_session / send / cancel / end_session
   |
   | build_prompt(session + selection)
   v
[SessionStore]
  - ~/.jupyter/codex-sessions/*.jsonl
  - meta.json 갱신
   |
   v
[CodexRunner]
  - subprocess: `codex exec --json --color never -`
   |
   | stdout JSONL events
   v
[event_to_text]
   |
   v
[WebSocket output]
   |
   v
[UI 메시지 렌더링]
  - assistant/system/user 메시지 누적
```

### 보조 플로우 (파일 변경 감지)
```
[Notebook fileChanged]
   |
   v
[Dialog: "Reload?"]
   | (승인)
   v
[context.revert()]
```
