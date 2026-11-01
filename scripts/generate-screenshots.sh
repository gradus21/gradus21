#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PORT=4180
python3 -m http.server $PORT --directory "$REPO_ROOT/web/dist" >/dev/null 2>&1 &
SERVER_PID=$!

trap "kill $SERVER_PID 2>/dev/null || true" EXIT
sleep 1

DEST="$REPO_ROOT/fastlane/screenshots/de-DE"
mkdir -p "$DEST"

CHROME="/snap/bin/chromium"

echo "Capturing iPhone 6.7\" (1290x2796) screenshots..."
$CHROME --headless --disable-gpu --hide-scrollbars \
  --user-agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" \
  --force-device-scale-factor=3 \
  --window-size=430,932 \
  --screenshot="$DEST/1_iPhone67_Matrix.png" "http://localhost:$PORT/#matrix"

$CHROME --headless --disable-gpu --hide-scrollbars \
  --user-agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" \
  --force-device-scale-factor=3 \
  --window-size=430,932 \
  --screenshot="$DEST/2_iPhone67_SpeedGrading.png" "http://localhost:$PORT/#speed"

$CHROME --headless --disable-gpu --hide-scrollbars \
  --user-agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" \
  --force-device-scale-factor=3 \
  --window-size=430,932 \
  --screenshot="$DEST/3_iPhone67_Student360.png" "http://localhost:$PORT/#student360"

echo "Capturing iPad 13\" (2048x2732) screenshots..."
$CHROME --headless --disable-gpu --hide-scrollbars \
  --user-agent="Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" \
  --force-device-scale-factor=2 \
  --window-size=1024,1366 \
  --screenshot="$DEST/1_iPadPro_Matrix.png" "http://localhost:$PORT/#matrix"

$CHROME --headless --disable-gpu --hide-scrollbars \
  --user-agent="Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" \
  --force-device-scale-factor=2 \
  --window-size=1024,1366 \
  --screenshot="$DEST/2_iPadPro_SpeedGrading.png" "http://localhost:$PORT/#speed"

$CHROME --headless --disable-gpu --hide-scrollbars \
  --user-agent="Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" \
  --force-device-scale-factor=2 \
  --window-size=1024,1366 \
  --screenshot="$DEST/3_iPadPro_Student360.png" "http://localhost:$PORT/#student360"

echo "Capturing Mac Desktop (2880x1800) screenshots..."
$CHROME --headless --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 \
  --window-size=1440,900 \
  --screenshot="$DEST/1_Mac_Matrix.png" "http://localhost:$PORT/#matrix"

$CHROME --headless --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 \
  --window-size=1440,900 \
  --screenshot="$DEST/2_Mac_SpeedGrading.png" "http://localhost:$PORT/#speed"

$CHROME --headless --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 \
  --window-size=1440,900 \
  --screenshot="$DEST/3_Mac_Student360.png" "http://localhost:$PORT/#student360"

chmod +x "$REPO_ROOT/scripts/generate-screenshots.sh"
echo "Screenshots generated successfully in $DEST"
ls -lh "$DEST"
