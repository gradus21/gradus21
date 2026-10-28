#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK_DIR="$(mktemp -d /tmp/gradus21-gh-pages-XXXXXX)"
REPO_SLUG="${GITHUB_REPOSITORY:-gradus21/gradus21}"

echo "[Deploy APT] Setting up gh-pages working directory in $WORK_DIR..."

AUTH_REMOTE="https://github.com/${REPO_SLUG}.git"
if [ -n "${GH_TOKEN:-}" ]; then
  AUTH_REMOTE="https://x-access-token:${GH_TOKEN}@github.com/${REPO_SLUG}.git"
elif [ -n "${GITHUB_TOKEN:-}" ]; then
  AUTH_REMOTE="https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO_SLUG}.git"
fi

# 1. Clone gh-pages branch or initialize orphan branch
if git ls-remote --heads "$AUTH_REMOTE" gh-pages | grep -q 'refs/heads/gh-pages'; then
  echo "[Deploy APT] Cloning existing gh-pages branch..."
  git clone --branch gh-pages --depth 1 "$AUTH_REMOTE" "$WORK_DIR"
else
  echo "[Deploy APT] Initializing new orphan gh-pages branch..."
  cd "$WORK_DIR"
  git init -b gh-pages
  git remote add origin "$AUTH_REMOTE"
fi

cd "$WORK_DIR"
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"

# 2. Gather .deb packages
mkdir -p "$WORK_DIR/pool/main/g/gradus21"

# Download .deb packages from existing GitHub releases if available
if command -v gh >/dev/null 2>&1; then
  echo "[Deploy APT] Fetching recent .deb releases from GitHub..."
  for tag in $(gh release list -L 5 --json tagName -q '.[].tagName' 2>/dev/null || true); do
    gh release download "$tag" -p "*.deb" --dir "$WORK_DIR/pool/main/g/gradus21" 2>/dev/null || true
  done
fi

# Copy newly built deb packages from local build if present
if [ -d "$REPO_ROOT/target/release/bundle/deb" ]; then
  find "$REPO_ROOT/target/release/bundle/deb" -name "*.deb" -exec cp -u {} "$WORK_DIR/pool/main/g/gradus21/" \;
fi

# If pool is still empty, check /tmp/Gradus21_*.deb
if [ "$(find "$WORK_DIR/pool" -name "*.deb" | wc -l)" -eq 0 ]; then
  find /tmp -maxdepth 1 -name "Gradus21*.deb" -exec cp -u {} "$WORK_DIR/pool/main/g/gradus21/" \; 2>/dev/null || true
fi

# 3. Build APT repository
bash "$REPO_ROOT/scripts/build-apt-repo.sh" "$WORK_DIR"

# 4. Commit and push
cd "$WORK_DIR"
# Tell GitHub Pages not to process with Jekyll
touch .nojekyll

git add -A
if git diff --cached --quiet; then
  echo "[Deploy APT] No changes to commit in APT repository."
else
  COMMIT_MSG="chore(apt): update APT repository for ${GITHUB_REF_NAME:-v1.2.10} [skip ci]"
  git commit -m "$COMMIT_MSG"
  echo "[Deploy APT] Pushing gh-pages to origin..."
  git push -u origin gh-pages
  echo "[Deploy APT] Successfully pushed gh-pages branch!"
fi

rm -rf "$WORK_DIR"
echo "[Deploy APT] Deployment finished."
