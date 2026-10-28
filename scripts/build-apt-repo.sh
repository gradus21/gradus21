#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APT_DIR="${1:-$REPO_ROOT/apt-repo}"
DEB_SOURCE_DIR="${2:-}"

echo "[APT Repo] Initializing APT repository in: $APT_DIR"
mkdir -p "$APT_DIR/pool/main/g/gradus21"
mkdir -p "$APT_DIR/dists/stable/main/binary-amd64"

# 1. Copy incoming .deb packages if a source directory was given
if [ -n "$DEB_SOURCE_DIR" ] && [ -d "$DEB_SOURCE_DIR" ]; then
  echo "[APT Repo] Copying .deb packages from $DEB_SOURCE_DIR..."
  find "$DEB_SOURCE_DIR" -name "*.deb" -exec cp -v {} "$APT_DIR/pool/main/g/gradus21/" \;
fi

# Ensure at least one .deb package exists
DEB_COUNT=$(find "$APT_DIR/pool" -name "*.deb" | wc -l)
if [ "$DEB_COUNT" -eq 0 ]; then
  echo "[APT Repo] Error: No .deb files found in $APT_DIR/pool!" >&2
  exit 1
fi
echo "[APT Repo] Found $DEB_COUNT .deb package(s) in pool."

# 2. Build Packages and Packages.gz
cd "$APT_DIR"
dpkg-scanpackages --multiversion pool/main > dists/stable/main/binary-amd64/Packages
gzip -9c dists/stable/main/binary-amd64/Packages > dists/stable/main/binary-amd64/Packages.gz

# 3. Build dists/stable/Release using apt-ftparchive
apt-ftparchive \
  -o APT::FTPArchive::Release::Origin="Gradus21" \
  -o APT::FTPArchive::Release::Label="Gradus21 Official APT Repository" \
  -o APT::FTPArchive::Release::Suite="stable" \
  -o APT::FTPArchive::Release::Codename="stable" \
  -o APT::FTPArchive::Release::Architectures="amd64" \
  -o APT::FTPArchive::Release::Components="main" \
  -o APT::FTPArchive::Release::Description="Gradus21 Official APT Repository for Debian, Ubuntu and Pop!_OS" \
  release dists/stable > dists/stable/Release

# 4. GPG Signing (InRelease and Release.gpg)
if [ -n "${GPG_PRIVATE_KEY:-}" ]; then
  echo "[APT Repo] Importing GPG private key..."
  echo "$GPG_PRIVATE_KEY" | gpg --batch --import 2>/dev/null || true
fi

KEY_ID="admin@gradus21.de"
if gpg --list-secret-keys "$KEY_ID" >/dev/null 2>&1; then
  echo "[APT Repo] Signing Release with GPG key ($KEY_ID)..."
  gpg --batch --yes -u "$KEY_ID" --clearsign -o dists/stable/InRelease dists/stable/Release
  gpg --batch --yes -u "$KEY_ID" -abs -o dists/stable/Release.gpg dists/stable/Release
  echo "[APT Repo] InRelease and Release.gpg successfully created."
else
  echo "[APT Repo] Warning: GPG key for $KEY_ID not found in keyring. Skipping cryptographic signature."
fi

# 5. Public GPG Key
if [ -f "$REPO_ROOT/docs/gradus21-release-signing.asc" ]; then
  cp "$REPO_ROOT/docs/gradus21-release-signing.asc" "$APT_DIR/KEY.gpg"
  cp "$REPO_ROOT/docs/gradus21-release-signing.asc" "$APT_DIR/gradus21.asc"
fi

# 6. Generate modern HTML landing page
LATEST_DEB=$(ls -t "$APT_DIR"/pool/main/g/gradus21/*.deb | head -n 1)
LATEST_VERSION="latest"
if [ -n "$LATEST_DEB" ]; then
  LATEST_VERSION=$(dpkg-deb -f "$LATEST_DEB" Version || echo "latest")
fi

cat <<HTML > "$APT_DIR/index.html"
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gradus21 — Offizielles APT Repository (Linux)</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --primary: #6366f1;
      --primary-light: #818cf8;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --code-bg: #0b1120;
    }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      background-color: var(--bg);
      color: var(--text);
      display: flex;
      justify-content: center;
      padding: 40px 20px;
    }
    .container {
      max-width: 760px;
      width: 100%;
    }
    .header {
      text-align: center;
      margin-bottom: 36px;
    }
    .logo-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 9999px;
      color: var(--primary-light);
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    h1 {
      font-size: 32px;
      font-weight: 800;
      margin: 0 0 10px 0;
      letter-spacing: -0.5px;
    }
    p.lead {
      color: var(--text-muted);
      font-size: 16px;
      margin: 0;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 28px;
      margin-bottom: 24px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
    }
    h2 {
      font-size: 18px;
      font-weight: 700;
      margin: 0 0 16px 0;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .step-num {
      width: 24px;
      height: 24px;
      background: var(--primary);
      color: white;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
    }
    pre {
      background: var(--code-bg);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      padding: 16px;
      overflow-x: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      line-height: 1.5;
      color: #38bdf8;
      margin: 10px 0;
    }
    .hint {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 8px;
    }
    .footer {
      text-align: center;
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 40px;
    }
    .footer a {
      color: var(--primary-light);
      text-decoration: none;
    }
    .footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo-badge">Offizielles Linux Repository</div>
      <h1>Gradus21 APT Repository</h1>
      <p class="lead">Automatische Updates für Debian, Ubuntu, Pop!_OS und Linux Mint (Version ${LATEST_VERSION})</p>
    </div>

    <div class="card">
      <h2><span class="step-num">1</span> GPG-Schlüssel importieren</h2>
      <p style="font-size: 14px; color: var(--text-muted);">Importiere den kryptografischen Release-Schlüssel von Gradus21 in deinen System-Keyring:</p>
      <pre>sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://gradus21.github.io/gradus21/KEY.gpg | sudo gpg --dearmor -o /etc/apt/keyrings/gradus21.gpg
sudo chmod a+r /etc/apt/keyrings/gradus21.gpg</pre>
    </div>

    <div class="card">
      <h2><span class="step-num">2</span> Paketquelle hinzufügen</h2>
      <p style="font-size: 14px; color: var(--text-muted);">Trage das offizielle Gradus21 Repository in deine APT-Quellen ein:</p>
      <pre>echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/gradus21.gpg] https://gradus21.github.io/gradus21 stable main" \
  | sudo tee /etc/apt/sources.list.d/gradus21.list</pre>
    </div>

    <div class="card">
      <h2><span class="step-num">3</span> Installieren &amp; Aktualisieren</h2>
      <p style="font-size: 14px; color: var(--text-muted);">Aktualisiere die Paketlisten und installiere Gradus21:</p>
      <pre>sudo apt update
sudo apt install gradus21</pre>
      <div class="hint">Von nun an wird Gradus21 bei jedem regulären <code>sudo apt update &amp;&amp; sudo apt upgrade</code> automatisch mitaktualisiert.</div>
    </div>

    <div class="footer">
      Gradus21 &bull; Zero-Knowledge E2EE Notenverwaltung &bull;
      <a href="https://gradus21.app" target="_blank">gradus21.app</a> &bull;
      <a href="https://github.com/gradus21/gradus21" target="_blank">GitHub Repository</a>
    </div>
  </div>
</body>
</html>
HTML

echo "[APT Repo] Successfully generated APT repository in $APT_DIR!"
