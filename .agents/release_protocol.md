# Gradus21 Release Protocol & Lifecycle Standards

Dieses Dokument definiert das verbindliche Release-Protokoll für **Gradus21**.

## 1. Release Definition of Done
Ein Release gilt **erst dann** als abgeschlossen, wenn alle 6 Phasen erfüllt sind:
1. **Quality Gates:** Lokale Tests sind grün (`npm --prefix web run test`, `cargo check -p gradus21-core`).
2. **Version-Sync (8 Dateien):**
   - `Cargo.toml`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`
   - `web/package.json`
   - `web/src/version.ts`
   - `README.md`
   - `Cargo.lock`
3. **Changelog:** Eintrag für `## [X.Y.Z] - YYYY-MM-DD` in `CHANGELOG.md` gepflegt.
4. **Git Commit & Tag:**
   - Commit: `chore(release): bump version to X.Y.Z`
   - Tag: `git tag -a vX.Y.Z -m "Release vX.Y.Z: <Titel>"`
5. **Git Push:** `git push origin main --tags`
6. **GitHub Release:** Erstellt via `gh release create vX.Y.Z --title "vX.Y.Z — <Titel>" --notes-file <notes.md>`.

## 2. Automatisierte Ausführung via CLI-Skript
Das Repository verfügt über ein vollständig automatisiertes Release-Skript:
```bash
./scripts/release.sh <version> "<titel>"
# oder via npm
npm --prefix web run release <version> "<titel>"
```
Beispiel:
```bash
./scripts/release.sh 1.2.8 "Performance & Cryptographic Hardening"
```
Dieses Skript validiert alle Voraussetzungen, aktualisiert alle 8 Versionsstellen, extrahiert die Notes aus `CHANGELOG.md`, erstellt Tag + Commit, pusht und legt das GitHub Release an.
