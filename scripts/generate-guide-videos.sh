#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS_DIR="${GRADUS21_VIDEO_TOOLS_DIR:-$HOME/.cache/gradus21-video-tools}"
VENV_DIR="$TOOLS_DIR/.venv"
NODE_DIR="$TOOLS_DIR/node"
PORT="${GUIDE_PORT:-4185}"

mkdir -p "$TOOLS_DIR" "$NODE_DIR"

echo "==> [1/4] Prüfe Python TTS-Umgebung (edge-tts)..."
EDGE_TTS_PYTHON=""
if [ -x "$VENV_DIR/bin/python" ] && "$VENV_DIR/bin/python" -c "import edge_tts" 2>/dev/null; then
  EDGE_TTS_PYTHON="$VENV_DIR/bin/python"
elif python3 -c "import edge_tts" 2>/dev/null; then
  EDGE_TTS_PYTHON="python3"
else
  rm -rf "$VENV_DIR"
  if python3 -m venv "$VENV_DIR" 2>/dev/null && "$VENV_DIR/bin/pip" install --quiet --upgrade pip edge-tts; then
    EDGE_TTS_PYTHON="$VENV_DIR/bin/python"
  else
    rm -rf "$VENV_DIR"
    echo "    (python3-venv nicht verfügbar, installiere edge-tts per pip --user --break-system-packages)"
    python3 -m pip install --user --break-system-packages --quiet edge-tts
    EDGE_TTS_PYTHON="python3"
  fi
fi

echo "==> [2/4] Prüfe Node Video-Werkzeuge (playwright, ffmpeg-static, ffprobe-static)..."
if [ ! -f "$NODE_DIR/package.json" ]; then
  cat > "$NODE_DIR/package.json" <<'EOF'
{
  "name": "gradus21-video-tools",
  "private": true
}
EOF
fi

if [ ! -d "$NODE_DIR/node_modules/playwright" ] || \
   [ ! -d "$NODE_DIR/node_modules/ffmpeg-static" ] || \
   [ ! -d "$NODE_DIR/node_modules/ffprobe-static" ]; then
  npm --prefix "$NODE_DIR" install --no-audit --no-fund playwright ffmpeg-static ffprobe-static
fi

if ! ls "$HOME/.cache/ms-playwright"/chromium-* >/dev/null 2>&1; then
  echo "    Installiere Playwright Chromium..."
  "$NODE_DIR/node_modules/.bin/playwright" install chromium
fi

echo "==> [3/4] Baue aktuelles Gradus21-Frontend..."
npm --prefix "$REPO_ROOT/web" run build

echo "==> [4/4] Starte lokalen Server auf Port $PORT und produziere Videos..."
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$REPO_ROOT/web/dist" >/dev/null 2>&1 &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

for _ in $(seq 1 40); do
  if python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:$PORT/', timeout=1)" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

NODE_PATH="$NODE_DIR/node_modules" \
TOOLS_DIR="$TOOLS_DIR" \
EDGE_TTS_PYTHON="$EDGE_TTS_PYTHON" \
GUIDE_BASE_URL="http://127.0.0.1:$PORT" \
node "$REPO_ROOT/scripts/record-guide-videos.mjs" "$@"
