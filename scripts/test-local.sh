#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ "$(uname -s)" == "Linux" ]]; then
  REQUIRED_LIBS=(
    "webkit2gtk-4.1"
    "dbus-1"
    "ayatana-appindicator3-0.1"
    "librsvg-2.0"
  )
  MISSING_LIBS=()
  for lib in "${REQUIRED_LIBS[@]}"; do
    if ! pkg-config --exists "$lib" 2>/dev/null; then
      MISSING_LIBS+=("$lib")
    fi
  done

  if (( ${#MISSING_LIBS[@]} > 0 )); then
    echo "Fehlende Linux-Systembibliotheken für Tauri (${MISSING_LIBS[*]})." >&2
    echo "Bitte einmalig installieren mit:" >&2
    echo "  sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev libdbus-1-dev libayatana-appindicator3-dev librsvg2-dev patchelf" >&2
    exit 1
  fi
fi

echo "==> [1/4] Rust Workspace Check (cargo check --workspace)"
cargo check --workspace

echo "==> [2/4] Rust Workspace Tests (cargo test --workspace)"
cargo test --workspace

echo "==> [3/4] Frontend Tests (npm --prefix web test)"
npm --prefix web test

echo "==> [4/4] Frontend Build (npm --prefix web run build)"
npm --prefix web run build

echo "Alle lokalen Rust- und Frontend-Checks erfolgreich abgeschlossen."
