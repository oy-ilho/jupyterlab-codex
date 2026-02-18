#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  ./release.sh <new_version> [--skip-pypi] [--skip-npm] [--repository <name>]

Examples:
  ./release.sh 0.1.4
  ./release.sh 0.1.4 --repository testpypi
  ./release.sh 0.1.4 --skip-pypi
  ./release.sh 0.1.4 --skip-npm

Description:
  - Updates version in package.json and pyproject.toml
  - Runs jlpm install and jlpm build
  - Builds Python distribution (dist/*)
  - Uploads to PyPI using twine (unless --skip-pypi)
  - Publishes to npm (unless --skip-npm)
EOF
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if [[ $# -lt 1 ]]; then
  usage
  exit 1
fi

NEW_VERSION=""
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
      if [[ -z "$NEW_VERSION" ]]; then
        NEW_VERSION="$1"
        shift
      else
        echo "ERROR: Multiple version arguments provided." >&2
        usage
        exit 1
      fi
      ;;
  esac
done

if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: Version must follow SemVer format x.y.z (example: 0.1.4)." >&2
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

if [[ "$NEW_VERSION" == "$CURRENT_PACKAGE_VERSION" && "$NEW_VERSION" == "$CURRENT_PYTHON_VERSION" ]]; then
  echo "ERROR: Both package.json and pyproject.toml are already at version $NEW_VERSION. Nothing to update."
  exit 1
fi

echo "[1/6] Updating versions"
"$PYTHON_BIN" - <<PY
import json
import pathlib
import re
import sys

new_version = sys.argv[1]

package_json = pathlib.Path("package.json")
data = json.loads(package_json.read_text())
data["version"] = new_version
package_json.write_text(json.dumps(data, indent=2) + "\n")

pyproject = pathlib.Path("pyproject.toml")
text = pyproject.read_text()
new_text, count = re.subn(
    r'^version\s*=\s*"[^"]+"',
    f'version = "{new_version}"',
    text,
    count=1,
    flags=re.M,
)
if count != 1:
    raise SystemExit("failed to update version in pyproject.toml")
pyproject.write_text(new_text)
PY
"$NEW_VERSION"

echo "  - package.json: $CURRENT_PACKAGE_VERSION -> $NEW_VERSION"
echo "  - pyproject.toml: $CURRENT_PYTHON_VERSION -> $NEW_VERSION"

echo "[2/6] Cleaning previous artifacts"
rm -rf dist

echo "[3/6] Installing JS dependencies and building frontend"
jlpm install
jlpm run build

echo "[4/6] Building Python distributions"
"$PYTHON_BIN" -m pip install -q build >/dev/null 2>&1
"$PYTHON_BIN" -m build
if [[ "$SKIP_PYPI" -eq 0 ]]; then
  "$PYTHON_BIN" -m twine check dist/*
fi

if [[ "$SKIP_PYPI" -eq 0 ]]; then
  echo "[5/6] Uploading to PyPI (${PYPI_REPO})"
  if [[ ${#TWINE_BIN[@]} -eq 0 ]]; then
    echo "ERROR: twine is required for PyPI upload. Install it with: $PYTHON_BIN -m pip install twine" >&2
    exit 1
  fi
  "${TWINE_BIN[@]}" upload --repository "${PYPI_REPO}" dist/*
else
  echo "[5/6] Skipping PyPI upload (--skip-pypi)"
fi

if [[ "$SKIP_NPM" -eq 0 ]]; then
  echo "[6/6] Publishing to npm"
  npm publish --access public
else
  echo "[6/6] Skipping npm publish (--skip-npm)"
fi

echo "Release completed for version: $NEW_VERSION"
echo "Git status:"
git status --short
