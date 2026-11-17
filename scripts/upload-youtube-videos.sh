#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS_DIR="${GRADUS21_VIDEO_TOOLS_DIR:-$HOME/.cache/gradus21-video-tools}"
VENV_DIR="$TOOLS_DIR/.venv"

mkdir -p "$TOOLS_DIR"

PYTHON_BIN=""
if [ -x "$VENV_DIR/bin/python" ]; then
  PYTHON_BIN="$VENV_DIR/bin/python"
else
  PYTHON_BIN="python3"
fi

if ! "$PYTHON_BIN" -c "import googleapiclient, google_auth_oauthlib" 2>/dev/null; then
  echo "==> Installiere Google YouTube Data API v3 Pakete..."
  if [ -x "$VENV_DIR/bin/pip" ]; then
    "$VENV_DIR/bin/pip" install --quiet google-api-python-client google-auth-oauthlib google-auth-httplib2
  elif python3 -m venv "$VENV_DIR" 2>/dev/null && "$VENV_DIR/bin/pip" install --quiet google-api-python-client google-auth-oauthlib google-auth-httplib2; then
    PYTHON_BIN="$VENV_DIR/bin/python"
  else
    rm -rf "$VENV_DIR"
    python3 -m pip install --user --break-system-packages --quiet google-api-python-client google-auth-oauthlib google-auth-httplib2
    PYTHON_BIN="python3"
  fi
fi

"$PYTHON_BIN" "$REPO_ROOT/scripts/upload_youtube_api.py" "$@"
