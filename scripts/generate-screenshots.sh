#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PORT=4180
python3 -m http.server $PORT --directory "$REPO_ROOT/web/dist" >/dev/null 2>&1 &
SERVER_PID=$!

trap "kill $SERVER_PID 2>/dev/null || true" EXIT
sleep 2

DEST_IOS="$REPO_ROOT/fastlane/screenshots_ios/de-DE"
DEST_MAC="$REPO_ROOT/fastlane/screenshots_mac/de-DE"
mkdir -p "$DEST_IOS" "$DEST_MAC"

CHROME="/snap/bin/chromium"

COMMON_FLAGS="--headless --disable-gpu --hide-scrollbars --virtual-time-budget=3000"

echo "Capturing iPhone 6.7\" (1290x2796) screenshots..."
$CHROME $COMMON_FLAGS \
  --user-agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" \
  --force-device-scale-factor=3 \
  --window-size=430,932 \
  --screenshot="$DEST_IOS/1_iPhone67_Matrix.png" "http://localhost:$PORT/?demo=1#matrix"

$CHROME $COMMON_FLAGS \
  --user-agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" \
  --force-device-scale-factor=3 \
  --window-size=430,932 \
  --screenshot="$DEST_IOS/2_iPhone67_SpeedGrading.png" "http://localhost:$PORT/?demo=1#speed"

$CHROME $COMMON_FLAGS \
  --user-agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" \
  --force-device-scale-factor=3 \
  --window-size=430,932 \
  --screenshot="$DEST_IOS/3_iPhone67_Student360.png" "http://localhost:$PORT/?demo=1#student360"

echo "Capturing iPad 13\" (2048x2732) screenshots..."
$CHROME $COMMON_FLAGS \
  --user-agent="Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" \
  --force-device-scale-factor=2 \
  --window-size=1024,1366 \
  --screenshot="$DEST_IOS/1_iPadPro_Matrix.png" "http://localhost:$PORT/?demo=1#matrix"

$CHROME $COMMON_FLAGS \
  --user-agent="Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" \
  --force-device-scale-factor=2 \
  --window-size=1024,1366 \
  --screenshot="$DEST_IOS/2_iPadPro_SpeedGrading.png" "http://localhost:$PORT/?demo=1#speed"

$CHROME $COMMON_FLAGS \
  --user-agent="Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" \
  --force-device-scale-factor=2 \
  --window-size=1024,1366 \
  --screenshot="$DEST_IOS/3_iPadPro_Student360.png" "http://localhost:$PORT/?demo=1#student360"

echo "Capturing Mac Desktop (2880x1800) screenshots..."
$CHROME $COMMON_FLAGS \
  --force-device-scale-factor=2 \
  --window-size=1440,900 \
  --screenshot="$DEST_MAC/1_Mac_Matrix.png" "http://localhost:$PORT/?demo=1#matrix"

$CHROME $COMMON_FLAGS \
  --force-device-scale-factor=2 \
  --window-size=1440,900 \
  --screenshot="$DEST_MAC/2_Mac_SpeedGrading.png" "http://localhost:$PORT/?demo=1#speed"

$CHROME $COMMON_FLAGS \
  --force-device-scale-factor=2 \
  --window-size=1440,900 \
  --screenshot="$DEST_MAC/3_Mac_Student360.png" "http://localhost:$PORT/?demo=1#student360"

echo "Screenshots generated successfully in $DEST_IOS and $DEST_MAC"
