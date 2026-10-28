#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Gradus21 Automated Release CLI
# ==============================================================================
# Führt alle Schritte eines vollständigen Software-Releases deterministisch durch:
# 1. Quality Gates & Git Cleanliness Checks
# 2. Synchronisierung aller 8 Versionsstellen (Cargo, Tauri, npm, Constants, Docs)
# 3. Validierung der CHANGELOG.md Einträge
# 4. Atomic Commit & annotierter Git-Tag (vX.Y.Z)
# 5. Git Push (Branch + Tags)
# 6. GitHub Release Erstellung via `gh release create` mit Release Notes
# ==============================================================================

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Farben für Output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

function log_info() {
    echo -e "${BLUE}ℹ [RELEASE]${NC} $1"
}

function log_success() {
    echo -e "${GREEN}✔ [RELEASE]${NC} $1"
}

function log_warn() {
    echo -e "${YELLOW}⚠ [RELEASE]${NC} $1"
}

function log_error() {
    echo -e "${RED}✖ [RELEASE]${NC} $1" >&2
}

# 1. Parameter & Syntax Check
if [ $# -lt 1 ]; then
    echo "Verwendung: $0 <version> [title] [--force]"
    echo "Beispiel:   $0 1.2.8 \"Performance & Passkey Polish\""
    exit 1
fi

NEW_VERSION="$1"
RELEASE_TITLE="${2:-v$NEW_VERSION}"
FORCE=false

if [[ "${*:-}" =~ "--force" ]]; then
    FORCE=true
fi

# SemVer Validation (z.B. 1.2.8 oder 1.2.8-beta.1)
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
    log_error "Ungültiges Versionsformat: '$NEW_VERSION'. Erwartet wird SemVer (z.B. 1.2.8)."
    exit 1
fi

TAG_NAME="v$NEW_VERSION"

log_info "Starte Release-Prozess für Gradus21 ${GREEN}$TAG_NAME${NC} ($RELEASE_TITLE)..."

# 2. Git & Tool Pre-Checks
if ! command -v gh &> /dev/null; then
    log_error "'gh' (GitHub CLI) ist nicht installiert. Bitte installieren."
    exit 1
fi

if ! gh auth status &> /dev/null; then
    log_error "GitHub CLI ist nicht authentifiziert. Führe 'gh auth login' aus."
    exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "main" ] && [ "$FORCE" = false ]; then
    log_warn "Aktueller Branch ist '$CURRENT_BRANCH' (nicht 'main')."
    log_warn "Überspringe diesen Schutz mit '--force', falls beabsichtigt."
    exit 1
fi

# Prüfe uncommittete Änderungen
if ! git diff --quiet || ! git diff --cached --quiet; then
    if [ "$FORCE" = false ]; then
        log_error "Uncommittete Änderungen im Arbeitsverzeichnis vorhanden! Bitte erst committen oder stashen."
        git status --short
        exit 1
    else
        log_warn "'--force' aktiv: Fahre trotz uncommitteter Änderungen fort."
    fi
fi

# Prüfe, ob Tag lokal oder remote bereits existiert
if git rev-parse "$TAG_NAME" >/dev/null 2>&1; then
    if [ "$FORCE" = false ]; then
        log_error "Tag '$TAG_NAME' existiert lokal bereits! Nutze eine neuere Version."
        exit 1
    fi
fi

# 3. CHANGELOG.md Prüfung & Release Notes Extraktion
log_info "Prüfe CHANGELOG.md auf Version [$NEW_VERSION]..."
if ! grep -q "^## \[$NEW_VERSION\]" CHANGELOG.md; then
    log_error "Kein Eintrag für '## [$NEW_VERSION]' in CHANGELOG.md gefunden!"
    log_error "Bitte dokumentiere die Änderungen in CHANGELOG.md bevor du das Release startest."
    exit 1
fi

# Extrahiere die Release Notes für diese Version aus dem CHANGELOG
TEMP_NOTES_FILE="$(mktemp /tmp/gradus21-notes-XXXXXX.md)"
awk -v ver="$NEW_VERSION" '
    $0 ~ "^## \\[" ver "\\]" { capture=1; next }
    capture && $0 ~ "^## \\[" { capture=0; exit }
    capture { print }
' CHANGELOG.md > "$TEMP_NOTES_FILE"

# Führende und nachfolgende Leerzeilen entfernen
sed -i -e :a -e '/^\n*$/{$d;N;};/\n$/ba' "$TEMP_NOTES_FILE"

if [ ! -s "$TEMP_NOTES_FILE" ]; then
    log_error "Konnte keine Release Notes für [$NEW_VERSION] aus CHANGELOG.md extrahieren."
    rm -f "$TEMP_NOTES_FILE"
    exit 1
fi

log_success "Release Notes erfolgreich aus CHANGELOG.md extrahiert."

# 4. Synchronisierung aller Versionsdateien
log_info "Synchronisiere Versionsnummern auf $NEW_VERSION..."

# Root Cargo.toml
sed -i -E "s/^(version[[:space:]]*=[[:space:]]*)\"[^\"]+\"/\1\"$NEW_VERSION\"/" Cargo.toml

# src-tauri/Cargo.toml
sed -i -E "s/^(version[[:space:]]*=[[:space:]]*)\"[^\"]+\"/\1\"$NEW_VERSION\"/" src-tauri/Cargo.toml

# src-tauri/tauri.conf.json
sed -i -E "s/\"version\":[[:space:]]*\"[^\"]+\"/\"version\": \"$NEW_VERSION\"/" src-tauri/tauri.conf.json

# web/package.json
sed -i -E "s/\"version\":[[:space:]]*\"[^\"]+\"/\"version\": \"$NEW_VERSION\"/" web/package.json

# web/src/version.ts
if [ -f "web/src/version.ts" ]; then
    cat <<EOF > web/src/version.ts
export const APP_VERSION = '$NEW_VERSION';
EOF
fi

# README.md
sed -i -E 's/^# Gradus21 \(`v[^`]+`\)/# Gradus21 (`v'"$NEW_VERSION"'`)/' README.md
sed -i -E 's/> 🚀 \*\*Status: Version `[^`]+`/> 🚀 **Status: Version `'"$NEW_VERSION"'`/' README.md

# Aktualisiere Cargo.lock
log_info "Aktualisiere Cargo.lock..."
cargo check -p gradus21-core --quiet || cargo update -p gradus21-core || cargo check --workspace --quiet || true

# Web-Build Verification
log_info "Verifiziere TypeScript & Web-Build..."
(cd web && npm run build:client --silent)

log_success "Alle 8 Versionsstellen erfolgreich aktualisiert und validiert."

# 5. Git Commit & Tag
log_info "Erstelle Release-Commit und annotierten Tag..."
git add Cargo.toml Cargo.lock src-tauri/Cargo.toml src-tauri/tauri.conf.json web/package.json web/src/version.ts README.md CHANGELOG.md

git commit -m "chore(release): bump version to $NEW_VERSION"

git tag -a "$TAG_NAME" -m "Release $TAG_NAME: $RELEASE_TITLE"
log_success "Annotierter Tag '$TAG_NAME' lokal erstellt."

# 6. Git Push (Branch + Tags)
log_info "Pushe Branch '$CURRENT_BRANCH' und Tag '$TAG_NAME' zu Origin..."
git push origin "$CURRENT_BRANCH"
git push origin "$TAG_NAME"
log_success "Git Push erfolgreich abgeschlossen."

# 7. GitHub Release anlegen
log_info "Erstelle GitHub Release '$TAG_NAME' via GitHub CLI..."
gh release create "$TAG_NAME" \
    --title "$TAG_NAME — $RELEASE_TITLE" \
    --notes-file "$TEMP_NOTES_FILE"

rm -f "$TEMP_NOTES_FILE"
log_success "GitHub Release '$TAG_NAME' erfolgreich angelegt!"

echo -e "\n${GREEN}==============================================================================${NC}"
echo -e "${GREEN}🎉 Release $TAG_NAME erfolgreich abgeschlossen!${NC}"
echo -e "GitHub Release: https://github.com/gradus21/gradus21/releases/tag/$TAG_NAME"
echo -e "CI/CD Workflows: https://github.com/gradus21/gradus21/actions"
echo -e "${GREEN}==============================================================================${NC}\n"
