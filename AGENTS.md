# Repository Security & Privacy Policy

이 레포지토리에서 작업할 때 다음 정책을 기본 원칙으로 적용합니다.

## 개인 정보 및 비밀값 정책

1. 코드에 인증 정보 하드코딩 금지
- 아래 항목을 절대 코드에 넣지 않습니다.
  - API 키, 액세스 토큰, 비밀키, 패스워드, 서명 키, 인증서 본문
  - `.env`, `config.toml`, `pyproject` 등에 민감값을 평문으로 저장
- 민감값은 실행 환경 변수(`$COD...`), OS 비밀 저장소, 또는 JupyterLab/로컬 보안 매커니즘을 통해 주입합니다.

2. 최소 수집 / 최소 보관
- 사용자 입력, 노트북 경로, 프롬프트에 들어갈 수 있는 데이터는 필요 범위로만 저장합니다.
- 저장되는 로그에는 민감데이터를 직접적으로 포함하지 않도록 마스킹/필터링 우선 적용을 검토합니다.
- 사용자 동의 없이 토큰, 인증 상태, 자격 증명 유사 데이터의 영구 저장은 하지 않습니다.

3. 로컬 상태 관리
- 실험용 세션 로그/상태 파일은 공개 대상 아티팩트가 아니며, 로컬 `.gitignore`로 제외합니다.
- 운영 환경에서 세션 보존 정책(보존 기간/삭제 정책)을 명시하고, 가능한 한 기본 보존 기간을 짧게 둡니다.

4. 코드 리뷰 체크리스트 (PR/커밋 전 필수)
- `rg`/유사 도구로 다음 패턴 점검:
  - `api[-_ ]?key`, `secret`, `token`, `password`, `authorization`, `bearer`, `private key`
- `/.env*`, 인증서/키 확장자(`*.pem`, `*.key`, `*.p12`, `id_*`)가 저장소에 새로 추가되지 않았는지 확인
- 세션/로그를 파일로 저장하는 경우, 보존 기간과 마스킹 규칙을 문서화

## 공개 전 고려사항

5. 패키지 공개/배포 메타
- `package.json`의 공개 설정(`private`)은 공개 배포 정책에 맞게 정리합니다.
- 저자/연락처/라이선스 정보를 실제 공개 전 정보에 맞게 정확히 설정합니다.

6. 변경 기록
- 보안/개인정보 관련 변경은 커밋 메시지/PR 본문에 간단한 목적과 영향을 적습니다.
- 위험 완화(로그 마스킹, 보존 기간 변경, 저장 위치 변경) 항목은 별도 항목으로 남깁니다.

## 예외

아래 동작은 기능상 필요해도 기본 공개/보안 정책 위배가 될 수 있으므로 변경 전 동료 리뷰를 권장합니다.
- 사용자 프롬프트/출력 내용을 원문 저장하거나 네트워크로 전송하는 로직 변경
- localStorage/IndexedDB/세션 파일에 사용자 컨텍스트를 저장하는 로직 추가
- 외부 CLI/도구 실행 경로를 하드코딩하거나, 권한 범위를 확장하는 동작 변경

## UI Language Policy

- User-facing UI labels, buttons, notices, dialogs, and system messages must always be displayed in English.
- Do not introduce Korean (or other non-English) UI strings in code changes.

## 배포 프로세스 (이 레포지토리 전용)

이 프로젝트(`jupyterlab-codex-sidebar`)는 Python 패키지(PyPI)와 JupyterLab 확장 패키지(NPM) 모두 배포해야 JupyterLab Discovery에 안정적으로 노출되고 서버 확장이 함께 동작합니다.

1) 사전 점검
- `npm`, `node`, `jlpm`, `jupyter`, `twine`, `python`(또는 `python3`)이 설치돼 있어야 함
- PyPI/NPM 계정 토큰 준비
- 현재 변경사항은 커밋/브랜치 정리 후 진행

2) 릴리스 버전 규칙
- `package.json`과 `pyproject.toml`의 버전은 항상 동일해야 함
- 동일 버전으로 재업로드 시도 불가(Python dist는 파일명 재사용 불가로 400 에러 발생)
- `x.y.z` 형식(SemVer)으로 bump

3) 권장 릴리스 명령(전체 배포)
- `./release.sh <new_version>`
- 예) `./release.sh 0.1.4`

4) 릴리스 스크립트 동작
- 버전 동기화 (`package.json`, `pyproject.toml`)
- `jlpm install`
- `jlpm run build`
- 이전 `dist/` 정리
- `python -m build` 실행 (`dist/*.tar.gz`, `dist/*.whl` 생성)
- `twine`로 PyPI 업로드
- `npm publish --access public` 실행

5) 선택 업로드
- PyPI만: `./release.sh 0.1.4 --skip-npm`
- npm만: `./release.sh 0.1.4 --skip-pypi`
- 테스트 업로드: `./release.sh 0.1.4 --repository testpypi`

6) 배포 후 확인
- PyPI: `pip index versions jupyterlab-codex-sidebar`
- npm: `npm view jupyterlab-codex-sidebar`
- 사용자 설치 확인(예): `pip install jupyterlab-codex-sidebar==<버전>`
- JupyterLab Extension Manager에서 `jupyterlab-codex-sidebar` 검색/표시 확인

7) 기존 실수 방지 규칙
- `release.sh` 실행 전 `dist/`에 남은 이전 버전 파일을 지워도 되지만, 가장 중요하게 `release.sh`는 새 버전으로만 실행해야 함
- 400 에러(duplicate file)는 대개 버전 미갱신 또는 dist 재생성 누락 때문에 발생
