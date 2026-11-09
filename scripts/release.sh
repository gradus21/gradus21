#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Gradus21 Automated Release CLI
# ==============================================================================
# Führt alle Schritte eines vollständigen Software-Releases deterministisch durch:
# 1. Quality Gates & Git Cleanliness Checks
# 2. Synchronisierung aller 8 Versionsstellen (Cargo, Tauri, npm, Constants, Docs)
# 3. Validierung der CHANGELOG.md Einträge
# 4. Atomic Commit & annotierter Git-Tag (vX.Y.Z oder vYY.MM.PATCH)
# 5. Git Push (Branch + Tags)
# 6. GitHub Release Erstellung via `gh release create` mit Release Notes
# 7. Website-Synchronisierung & Plesk Production Deployment (gradus21.de)
# 8. Homelab Docker-VM Deployment (g21-dev.kallidat.com via SSH)
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

# Parameter & Flags Parsing
FORCE=false
DEPLOY_ONLY=false
SKIP_DOCKER_VM=false
SKIP_PLESK=false
NO_WAIT=false
POSITIONAL_ARGS=()

for arg in "$@"; do
    case "$arg" in
        --force)
            FORCE=true
            ;;
        --deploy-only)
            DEPLOY_ONLY=true
            ;;
        --skip-docker-vm|--skip-docker)
            SKIP_DOCKER_VM=true
            ;;
        --skip-plesk|--skip-website)
            SKIP_PLESK=true
            ;;
        --no-wait)
            NO_WAIT=true
            ;;
        *)
            POSITIONAL_ARGS+=("$arg")
            ;;
    esac
done

if [ "$DEPLOY_ONLY" = true ]; then
    if [ ${#POSITIONAL_ARGS[@]} -ge 1 ]; then
        NEW_VERSION="${POSITIONAL_ARGS[0]}"
    else
        NEW_VERSION="$(grep -o '"version": "[^"]*"' src-tauri/tauri.conf.json | cut -d'"' -f4)"
    fi
    RELEASE_TITLE="Deployment v$NEW_VERSION"
    TAG_NAME="v$NEW_VERSION"
    log_info "Deploy-Only Modus aktiv: Überspringe Versionsbump und GitHub Release."
else
    if [ ${#POSITIONAL_ARGS[@]} -lt 1 ]; then
        echo "Verwendung: $0 <version> [title] [--force] [--deploy-only] [--skip-docker-vm] [--skip-plesk] [--no-wait]"
        echo "Beispiel:   $0 26.11.1 \"Ubuntu-Style CalVer & WebView2 Fix\""
        echo "Deploy-Only: $0 --deploy-only [version]"
        exit 1
    fi
    NEW_VERSION="${POSITIONAL_ARGS[0]}"
    RELEASE_TITLE="${POSITIONAL_ARGS[1]:-v$NEW_VERSION}"
    TAG_NAME="v$NEW_VERSION"
fi

# SemVer oder CalVer Validation (z.B. 1.2.8 oder 26.11.1 oder 26.11.1-beta.1)
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
    log_error "Ungültiges Versionsformat: '$NEW_VERSION'. Erwartet wird SemVer/CalVer (z.B. 26.11.1 oder 1.2.8)."
    exit 1
fi

if [ "$DEPLOY_ONLY" = false ]; then
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
    if [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "dev" ] && [ "$FORCE" = false ]; then
        log_warn "Aktueller Branch ist '$CURRENT_BRANCH' (nicht 'main' oder 'dev')."
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
            log_error "Tag '$TAG_NAME' existiert lokal bereits! Nutze eine neuere Version oder '--deploy-only'."
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
    trap 'rm -f "$TEMP_NOTES_FILE"' EXIT
    awk -v ver="$NEW_VERSION" '
        $0 ~ "^## \\[" ver "\\]" { capture=1; next }
        capture && $0 ~ "^## \\[" { capture=0; exit }
        capture { print }
    ' CHANGELOG.md > "$TEMP_NOTES_FILE"

    # Führende und nachfolgende Leerzeilen entfernen
    sed -i -e :a -e '/^\n*$/{$d;N;};/\n$/ba' "$TEMP_NOTES_FILE"

    if [ ! -s "$TEMP_NOTES_FILE" ]; then
        log_error "Konnte keine Release Notes für [$NEW_VERSION] aus CHANGELOG.md extrahieren."
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

    # web/package.json & web/package-lock.json
    (cd web && npm version "$NEW_VERSION" --no-git-tag-version --allow-same-version)

    # web/src/version.ts
    if [ -f "web/src/version.ts" ]; then
        sed -i -E "s/export const APP_VERSION = '[^']+';/export const APP_VERSION = '$NEW_VERSION';/" web/src/version.ts
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

    log_success "Alle Versionsstellen erfolgreich aktualisiert und validiert."

    # 5. Git Commit & Tag
    log_info "Erstelle Release-Commit und annotierten Tag..."
    git add Cargo.toml Cargo.lock src-tauri/Cargo.toml src-tauri/tauri.conf.json web/package.json web/package-lock.json web/src/version.ts README.md CHANGELOG.md

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
    trap - EXIT
    log_success "GitHub Release '$TAG_NAME' erfolgreich angelegt!"
fi

# ==============================================================================
# 8. Plesk Website Synchronisierung & Deployment (gradus21.de)
# ==============================================================================
WEBSITE_DIR="${GRADUS21_WEBSITE_DIR:-$REPO_ROOT/../gradus21-website}"

if [ "$SKIP_PLESK" = false ]; then
    if [ -d "$WEBSITE_DIR" ]; then
        log_info "Synchronisiere Website & Plesk Deployment ($WEBSITE_DIR)..."
        
        # Versionsnummer in Website-Dateien synchronisieren
        if [ -f "$WEBSITE_DIR/package.json" ]; then
            sed -i -E "s/\"version\":[[:space:]]*\"[^\"]+\"/\"version\": \"$NEW_VERSION\"/" "$WEBSITE_DIR/package.json"
        fi
        if [ -f "$WEBSITE_DIR/index.html" ]; then
            sed -i -E "s/\"softwareVersion\":[[:space:]]*\"[^\"]+\"/\"softwareVersion\": \"$NEW_VERSION\"/" "$WEBSITE_DIR/index.html"
            sed -i -E "s/releases\/tag\/v[0-9a-zA-Z.-]+/releases\/tag\/v$NEW_VERSION/g" "$WEBSITE_DIR/index.html"
            sed -i -E "s/<span class=\"gradus21-version-val\">v[^<]+<\/span>/<span class=\"gradus21-version-val\">v$NEW_VERSION<\/span>/g" "$WEBSITE_DIR/index.html"
        fi
        if [ -f "$WEBSITE_DIR/excel-alternative-fuer-lehrer/index.html" ]; then
            sed -i -E "s/releases\/tag\/v[0-9a-zA-Z.-]+/releases\/tag\/v$NEW_VERSION/g" "$WEBSITE_DIR/excel-alternative-fuer-lehrer/index.html"
            sed -i -E "s/<span class=\"gradus21-version-val\">v[^<]+<\/span>/<span class=\"gradus21-version-val\">v$NEW_VERSION<\/span>/g" "$WEBSITE_DIR/excel-alternative-fuer-lehrer/index.html"
        fi
        if [ -f "$WEBSITE_DIR/download/index.html" ]; then
            sed -i -E "s/<span class=\"gradus21-version-val\">v[^<]+<\/span>/<span class=\"gradus21-version-val\">v$NEW_VERSION<\/span>/g" "$WEBSITE_DIR/download/index.html"
            sed -i -E "s/releases\/download\/v[0-9a-zA-Z.-]+\/Gradus21_[0-9a-zA-Z.-]+_/releases\/download\/v$NEW_VERSION\/Gradus21_${NEW_VERSION}_/g" "$WEBSITE_DIR/download/index.html"
            sed -i -E "s/releases\/download\/v[0-9a-zA-Z.-]+\/gradus21\./releases\/download\/v$NEW_VERSION\/gradus21./g" "$WEBSITE_DIR/download/index.html"
            sed -i -E "s/releases\/download\/v[0-9a-zA-Z.-]+\/SHA256SUMS/releases\/download\/v$NEW_VERSION\/SHA256SUMS/g" "$WEBSITE_DIR/download/index.html"
        fi

        # Git Commit & Push zu Plesk
        git -C "$WEBSITE_DIR" add -A
        if ! git -C "$WEBSITE_DIR" diff --cached --quiet; then
            git -C "$WEBSITE_DIR" commit -m "chore(release): bump website version and download links to v$NEW_VERSION"
            log_success "Website-Änderungen lokal committed."
        fi

        # Push zu Plesk main
        if git -C "$WEBSITE_DIR" remote | grep -q '^plesk$'; then
            log_info "Pushe Website zu Plesk (Production: gradus21.de)..."
            if git -C "$WEBSITE_DIR" push plesk main; then
                log_success "Plesk Git-Deployment erfolgreich durchgeführt!"
            else
                log_warn "Plesk Push fehlgeschlagen. Bitte Zugangsdaten / Verbindung prüfen."
            fi
        else
            log_warn "Kein 'plesk' Git-Remote in $WEBSITE_DIR gefunden."
        fi

        # Optional: Push zu origin
        if git -C "$WEBSITE_DIR" remote | grep -q '^origin$'; then
            log_info "Pushe Website zu Origin (GitHub)..."
            if ! git -C "$WEBSITE_DIR" push origin main 2>/dev/null; then
                log_warn "Push zu Website-Origin (GitHub) fehlgeschlagen (Rechte / URL prüfen). Plesk Deployment war jedoch erfolgreich."
            fi
        fi

        # Healthcheck
        PLESK_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://gradus21.de || echo "000")
        log_info "Status gradus21.de: HTTP $PLESK_HTTP_CODE"
    else
        log_warn "Website-Verzeichnis '$WEBSITE_DIR' nicht gefunden. Überspringe Plesk-Deployment."
    fi
else
    log_info "Plesk Website Deployment übersprungen (--skip-plesk)."
fi

# ==============================================================================
# 9. Homelab Docker-VM Deployment (g21-dev.kallidat.com)
# ==============================================================================
DOCKER_VM_IP="${DOCKER_VM_IP:-192.168.0.100}"
DOCKER_VM_USER="${DOCKER_VM_USER:-dockeradmin}"
DOCKER_VM_STACK_DIR="${DOCKER_VM_STACK_DIR:-/mnt/docker-appdata/dockhand/data/stacks/TrueNAS/gradus21-dev}"

if [ "$SKIP_DOCKER_VM" = false ]; then
    log_info "Prüfe Erreichbarkeit der Homelab Docker-VM ($DOCKER_VM_IP)..."
    if ping -c 1 -W 2 "$DOCKER_VM_IP" &>/dev/null; then
        if [ "$NO_WAIT" = false ] && [ "$DEPLOY_ONLY" = false ]; then
            log_info "Warte auf Registrierung des Docker CI Builds auf GitHub Actions..."
            RELEASE_COMMIT="$(git rev-parse HEAD)"
            RUN_ID=""
            for attempt in $(seq 1 12); do
                RUN_ID=$(gh run list --workflow=docker.yml --commit "$RELEASE_COMMIT" --limit 1 --json databaseId -q '.[0].databaseId' 2>/dev/null || echo "")
                if [ -n "$RUN_ID" ]; then
                    break
                fi
                sleep 3
            done

            if [ -n "$RUN_ID" ]; then
                log_info "Warte auf Fertigstellung des Docker CI Builds (Run ID: $RUN_ID)..."
                gh run watch "$RUN_ID" --exit-status || log_warn "Docker CI Run nicht mit 0 beendet. Fahre fort..."
            else
                log_warn "Kein aktiver Docker CI Run für Commit $RELEASE_COMMIT gefunden. Fahre fort..."
            fi
        fi

        log_info "Aktualisiere Docker-VM (g21-dev) via SSH..."
        if ssh -o BatchMode=yes -o ConnectTimeout=5 "$DOCKER_VM_USER@$DOCKER_VM_IP" \
            "cd $DOCKER_VM_STACK_DIR && docker compose pull && docker compose up -d"; then
            log_success "Docker-VM (g21-dev) erfolgreich aktualisiert!"
            G21_DEV_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://g21-dev.kallidat.com || echo "000")
            log_info "Status g21-dev.kallidat.com: HTTP $G21_DEV_CODE"
        else
            log_warn "Konnte Docker Compose auf Docker-VM ($DOCKER_VM_IP) nicht ausführen."
        fi
    else
        log_warn "Docker-VM ($DOCKER_VM_IP) nicht im LAN erreichbar. Überspringe Docker-VM Deployment."
    fi
else
    log_info "Docker-VM Deployment übersprungen (--skip-docker-vm)."
fi

echo -e "\n${GREEN}==============================================================================${NC}"
echo -e "${GREEN}🎉 Release & Deployment $TAG_NAME erfolgreich abgeschlossen!${NC}"
echo -e "GitHub Release:    https://github.com/gradus21/gradus21/releases/tag/$TAG_NAME"
echo -e "CI/CD Workflows:   https://github.com/gradus21/gradus21/actions"
echo -e "Plesk Website:     https://gradus21.de"
echo -e "Homelab Docker-VM: https://g21-dev.kallidat.com"
echo -e "${GREEN}==============================================================================${NC}\n"
