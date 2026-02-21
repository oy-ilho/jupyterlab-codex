#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./release.sh [version] [--skip-pypi] [--skip-npm] [--repository <name>]

Examples:
  ./release.sh
  ./release.sh 0.1.4
  ./release.sh 0.1.4 --repository testpypi
  ./release.sh --skip-pypi
  ./release.sh --skip-npm

Description:
  - Uses current versions in package.json and pyproject.toml (no version bump)
  - Optionally validates that [version] matches current version
  - Runs jlpm install and jlpm build
  - Builds Python distribution (dist/*)
  - Uploads to PyPI using twine (unless --skip-pypi)
  - Publishes to npm (unless --skip-npm)
EOF
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

EXPECTED_VERSION=""
SKIP_PYPI=0
SKIP_NPM=0
PYPI_REPO="pypi"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-pypi)
      SKIP_PYPI=1
      shift
      ;;
    --skip-npm)
      SKIP_NPM=1
      shift
      ;;
    --repository)
      if [[ $# -lt 2 ]]; then
        echo "ERROR: --repository requires one argument." >&2
        exit 1
      fi
      PYPI_REPO="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --*)
      echo "ERROR: Unknown option: $1" >&2
      usage
      exit 1
      ;;
    *)
      if [[ -z "$EXPECTED_VERSION" ]]; then
        EXPECTED_VERSION="$1"
        shift
      else
        echo "ERROR: Multiple version arguments provided." >&2
        usage
        exit 1
      fi
      ;;
  esac
done

if [[ -n "$EXPECTED_VERSION" ]] && ! [[ "$EXPECTED_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$ ]]; then
  echo "ERROR: Version must follow SemVer format x.y.z or x.y.z-prerelease (examples: 0.1.4, 0.1.4-dev)." >&2
  exit 1
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: '$1' is required but not found in PATH." >&2
    exit 1
  fi
}

if command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
else
  echo "ERROR: python (or python3) is required but not found in PATH." >&2
  exit 1
fi

require_cmd node
require_cmd jlpm
require_cmd jupyter
require_cmd npm

if "${PYTHON_BIN}" -m twine --help >/dev/null 2>&1; then
  TWINE_BIN=("${PYTHON_BIN}" -m twine)
elif command -v twine >/dev/null 2>&1; then
  TWINE_BIN=(twine)
else
  TWINE_BIN=()
fi

CURRENT_PACKAGE_VERSION="$(node -p "require('./package.json').version")"
CURRENT_PYTHON_VERSION="$("$PYTHON_BIN" - <<'PY'
import pathlib, re

text = pathlib.Path("pyproject.toml").read_text()
match = re.search(r'^version\s*=\s*"([^"]+)"', text, re.M)
if not match:
    raise SystemExit("version not found in pyproject.toml")
print(match.group(1))
PY
)"

if [[ "$CURRENT_PACKAGE_VERSION" != "$CURRENT_PYTHON_VERSION" ]]; then
  echo "ERROR: Version mismatch between package.json ($CURRENT_PACKAGE_VERSION) and pyproject.toml ($CURRENT_PYTHON_VERSION)." >&2
  echo "       Sync versions first, then run release.sh again." >&2
  exit 1
fi

RELEASE_VERSION="$CURRENT_PACKAGE_VERSION"

if [[ -n "$EXPECTED_VERSION" && "$EXPECTED_VERSION" != "$RELEASE_VERSION" ]]; then
  echo "ERROR: Requested version '$EXPECTED_VERSION' does not match current version '$RELEASE_VERSION'." >&2
  echo "       This script does not change versions; update files first if needed." >&2
  exit 1
fi

if [[ "$RELEASE_VERSION" =~ -dev(\.[0-9A-Za-z-]+)*$ ]]; then
  CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  if [[ "$CURRENT_BRANCH" == "HEAD" || -z "$CURRENT_BRANCH" ]]; then
    echo "ERROR: Cannot determine current git branch. '-dev' releases require branch 'develop'." >&2
    exit 1
  fi
  if [[ "$CURRENT_BRANCH" != "develop" ]]; then
    echo "ERROR: '-dev' version is allowed only on branch 'develop' (current: '$CURRENT_BRANCH')." >&2
    exit 1
  fi
fi

"$PYTHON_BIN" - <<'PY' "$RELEASE_VERSION"
import sys

release_version = sys.argv[1]
try:
    from packaging.version import Version
except Exception:
    try:
        from setuptools._vendor.packaging.version import Version
    except Exception as exc:
        raise SystemExit(
            "ERROR: Unable to validate Python package version (missing packaging module)."
        ) from exc

try:
    Version(release_version)
except Exception as exc:
    raise SystemExit(
        f"ERROR: Version '{release_version}' is not valid for Python packaging (PEP 440)."
    ) from exc
PY

echo "[1/5] Using release version: $RELEASE_VERSION"

echo "[2/5] Cleaning previous artifacts"
rm -rf dist

echo "[3/5] Installing JS dependencies and building frontend"
jlpm install
jlpm run build

echo "[4/5] Building Python distributions"
"$PYTHON_BIN" -m pip install -q build >/dev/null 2>&1
"$PYTHON_BIN" -m build
if [[ "$SKIP_PYPI" -eq 0 ]]; then
  "$PYTHON_BIN" -m twine check dist/*
fi

if [[ "$SKIP_PYPI" -eq 0 ]]; then
  echo "[5/5] Uploading to PyPI (${PYPI_REPO})"
  if [[ ${#TWINE_BIN[@]} -eq 0 ]]; then
    echo "ERROR: twine is required for PyPI upload. Install it with: $PYTHON_BIN -m pip install twine" >&2
    exit 1
  fi
  "${TWINE_BIN[@]}" upload --repository "${PYPI_REPO}" dist/*
else
  echo "[5/5] Skipping PyPI upload (--skip-pypi)"
fi

if [[ "$SKIP_NPM" -eq 0 ]]; then
  echo "[extra] Ensuring npm authentication"
  if ! npm whoami >/dev/null 2>&1; then
    echo "  - npm login required. Starting interactive login..."
    npm login
  else
    echo "  - npm login already active."
  fi

  echo "[extra] Publishing to npm"
  npm publish --access public
else
  echo "[extra] Skipping npm publish (--skip-npm)"
fi

echo "Release completed for version: $RELEASE_VERSION"
echo "Git status:"
git status --short
