# Gradus21 (`v1.0.0`)

> **Gradus21** — Zero-Knowledge E2EE & 100 % Client-Side Rust/WebAssembly Notenverwaltung & pädagogische Didaktik für Lehrkräfte.
>
> 🚀 **Status: Version `1.0.0` (Production Release)**  
> Vollständig DSGVO-konform, Zero-Knowledge verschlüsselt, FIDO2/Passkey-gesichert und bereit für den produktiven Schuleinsatz.

---

## 🎯 Warum Gradus21? (Didaktik & Notenverwaltung neu gedacht)

Viele Lehrkräfte verwalten ihre Klassenlisten, Punktetabellen, Gewichtungen (`50% LNW / 30% Mündlich / 20% Tests`) und Binnendifferenzierungen (`G` / `M` / `E`) in komplexen Tabellenkalkulationen wie Excel. Sobald ein Kind krank ist (`K` / Attest), unterjährig die Schule wechselt, eine Streichnote greift oder eine leere Kategorie (z. B. am Halbjahresanfang noch keine Klassenarbeit geschrieben) proportional hochskaliert werden muss, brechen klassische Tabellenformeln wie `=MITTELWERT(...)` zusammen oder führen zu `#DIV/0!`-Fehlern.

**Gradus21** löst dieses Problem durch:
1. **100 % Client-Side Rust/WASM Rechenkern (`gradus21-core`)**: Jede Durchschnittsberechnung, proportionale Kategorien-Skalierung, Streichnote, Was-wäre-wenn-Simulation und Binnendifferenzierung (`G`/`M`/`E`) läuft deterministisch in WebAssembly direkt im Browser.
2. **Zero-Knowledge Ende-zu-Ende-Verschlüsselung (E2EE Envelope Architecture)**: Schüler:innendaten und Noten verlassen das Endgerät ausschließlich als `AES-256-GCM`-Chiffretext. Der Server (`gradus21-server`) sieht niemals Klartext-Namen oder Noten.
3. **Pädagogische Ergonomie ohne Formel-Bastelei**: 4 spezialisierte Arbeitsmodi (*Gesamt-Matrix*, *Speed-Grading*, *Schüler:innen-360°-Akte*, *Visueller Gewichtungs-Baukasten*).
4. **Schulweite Administration & Vorlagen**: Globale Notenvorlagen, SMTP-Einladungs- & Benachrichtigungssystem und zeitgesteuerte Snapshot-Backups mit automatischer Retention.

---

## ✨ Funktionsumfang in Version `1.0.0`

### 1. Vier vernetzte Arbeitsmodi
- **📊 Gesamt-Matrix**:
  - Übersicht aller Schüler:innen inkl. Niveaustufe (`G` / `M` / `E`), Einzelprüfungen, **Kategorie-Durchschnitten (`Ø LNW`, `Ø Mündl`, `Ø Tests`)**, berechnetem **Gesamtschnitt** und editierbarer **Zeugnisnote (Override)**.
  - Umschaltbare Zellen-Darstellung (`Prozent + Note`, `Nur Prozent`, `Nur Note`) und Halbjahres-Filter (`1. Halbjahr`, `2. Halbjahr`, `Gesamtjahr`).
  - **Klassenzimmer-Beamer-Schutz („Namen ausblenden“)** per 1-Klick für unbedenkliche Projektion im Unterricht.
- **⚡ Speed-Grading (Fokus-Erfassung)**:
  - Tastatur-optimierte Schnellerfassung (`Enter` / `Pfeiltasten` / `K` für entschuldigt / Attest) wahlweise in **Prozent (`%`)** oder **Rohpunkten (`Pkt.`)**.
  - Live-Notenspiegel (Notenverteilung `1` bis `6` + Klassenschnitt) und direkter Notenschlüssel-Tuner.
- **🎓 Schüler:innen-360°-Akte (Elterngespräch & Beratung)**:
  - Stärken-/Schwächen-Profil je Kategorie im Vergleich zum Klassenschnitt.
  - **Interaktiver „Was-wäre-wenn“-Ziel-Simulator (v2)**: Berechnet per Rust-WASM für alle 3 Gewichtungsmodi (*Kategorien-Töpfe*, *Freie Faktoren*, *Punktesammler*) exakt, wie viel Prozent oder Punkte in der nächsten Prüfung nötig sind, um eine Wunschnote zu halten oder zu erreichen.
  - Pädagogisches Gutachten & Zeugnisnoten-Festlegung mit Begründung.
- **🎛️ Visueller Gewichtungs-Baukasten (ohne Formel-Bastelei)**:
  - **Skalen-Auswahl**: Klassische Schulnoten `1–6` (mit `+/-` Tendenzen `1+` bis `6`), gymnasiale Oberstufe (`0–15 MSS-Punkte`) oder `US Letter Grades (A+ bis F)`.
  - **Berechnungs-Modelle**: *Kategorien-Töpfe (Buckets)*, *Freie Faktoren (`1x`, `2x`)* oder *Punktesammler (Total Points)*.
  - **Individuelle Kategorien & Eigene Vorlagen**: Beliebige Kategorien anlegen, umbenennen, gewichten, Streichnoten festlegen und als eigene oder globale Vorlage synchronisiert speichern.
  - **Notenschlüssel-Editor („Welche Prozent entsprechen welcher Note?“)**: 4 Vorlagen (*Sek-I Standard*, *IHK 50%-Hürde*, *Pädagogisch Mild*, *Streng*) + stufenlose Regler & Zahleneingaben für Note 1 bis 5 inkl. 16er-Feinstufen-Übersicht (`1+` bis `6`).
  - **Binnendifferenzierung (`G` / `M` / `E` Niveaustufen)**: Ein-/Ausschalter, Vorlagen und individuelle Prozent-Verschiebungen für Grundlegendes (`G`), Mittleres (`M`) und Erweitertes (`E`) Niveau inkl. **Live-Vergleichstabelle (`G` vs. `M` vs. `E`)**.

### 2. Klassenverwaltung, Excel-Migration & Druck-Exporte
- **Nativer `.xlsx` Drag-and-Drop-Assistent**: Importiert bestehende Excel-Notenlisten automatisch inkl. Schüler:innenstamm, Niveaustufen (`G`/`M`/`E`) und vorhandenen Tests.
- **Bestehende Klassen flexibel bearbeiten**: Schüler:innen unterjährig hinzufügen, **archivieren** (z. B. bei Schulwechsel ohne Datenverlust) oder löschen; Anzahl der Leistungsnachweise/Tests je Kategorie per `+/-` anpassen.
- **Konferenz- & Elterngesprächs-Exporte**: Mehrblättriger `.xlsx`-Export sowie druckfertige A4-Berichte (Klassenkonferenz-Bogen & Einzel-Elternsprechtagsbogen).

### 3. Zero-Knowledge E2EE Security & Multi-User-Isolation
- **Argon2id + HKDF-SHA256 + AES-256-GCM Envelope Encryption**:
  - Das Passwort der Lehrkraft leitet lokal im Browser den *Master Key* ab (`Argon2id` mit `19 MiB`, 2 Runden, OWASP Minimum).
  - Der *Data Encryption Key (DEK)* wird lokal gewrappt (`encrypted_dek`); der Server speichert ausschließlich verschlüsselte Envelopes.
- **Strikte Mandantentrennung (Multi-Tenancy)**:
  - Jedes Lehrkraft-Konto besitzt eine eigene `user_id`, eigenen `kdf_salt`, eigenen `DEK` sowie strikt nach `owner_user_id` getrennte Server-Envelopes und isolierten Browser-Cache.
- **Passkey (WebAuthn / FIDO2)** mit PRF-Hardware-Entschlüsselungsunterstützung, **TOTP 2FA (RFC 6238 QR-Code + Manuelles Base32-Setup)** und **24-stelliger Notfall-Wiederherstellungscode (`Recovery Key`)**.

### 4. Schulweite Administration & Enterprise-Readiness
- **Benutzer:innenverwaltung & Rollen**: Lehrkräfte einladen, aktivieren/deaktivieren, Admin-Rollen zuweisen (mit Schutz vor Demotion des letzten Admins).
- **Zentrale Vorlagen**: Schulweite Notenschlüssel & Gewichtungs-Presets bereitstellen, anpassen oder ableiten.
- **E-Mail-Vorlagensystem (SMTP)**: Anpassbare Vorlagen für Einladungen, Passwort-Resets und Inaktivitätswarnungen.
- **Atomare Snapshot-Backups & Retention**: Manuelle oder zeitgesteuerte Cron-Backups mit automatischer Bereinigung alter Stände.
- **Design-System**: 4 Farbwelten (*Teal*, *Indigo*, *Sage*, *Terracotta*) sowie System-, Hell- und Dunkelmodus.

---

## 🏗️ Projekt-Architektur

```text
gradus21/
├── Cargo.toml                        # Rust Workspace (v1.0.0)
├── crates/
│   ├── gradus21-core/                # Shared Rust Library + WebAssembly Bindings
│   │   └── src/
│   │       ├── crypto.rs             # Argon2id, HKDF-SHA256, AES-256-GCM, Recovery Key Wrapping
│   │       ├── grading.rs            # 100% Client-Side Grading Engine (Buckets, G/M/E, Simulator v2)
│   │       ├── wasm.rs               # wasm-bindgen Exports für den Browser
│   │       └── lib.rs
│   └── gradus21-server/              # Rust Axum REST API & Zero-Knowledge Sync Backend
│       └── src/
│           ├── admin.rs              # Administration, Global Templates, Mail-System, Snapshots
│           └── main.rs               # Auth, TOTP 2FA, Passkey, Recovery, Tenant-Isolated Envelopes
├── migrations/
│   └── 001_initial_schema.sql        # PostgreSQL E2EE Envelope Schema
├── web/                              # React 18 + TypeScript + Tailwind CSS + Vite Frontend
│   └── src/
│       ├── App.tsx                   # Hauptanwendung (4 Arbeitsmodi + Live-WASM-Integration)
│       ├── components/
│       │   ├── ClassManagementModal.tsx
│       │   ├── ClassSetupAndExcelWizard.tsx
│       │   ├── ExportAndPrintHelpers.ts
│       │   ├── FlowRibbonLogo.tsx
│       │   ├── SettingsModal.tsx
│       │   ├── VaultLockAndAuthModal.tsx
│       │   └── admin/
│       │       ├── AdminModal.tsx
│       │       ├── BackupConfigTab.tsx
│       │       ├── CentralTemplatesTab.tsx
│       │       ├── MailTemplatesTab.tsx
│       │       ├── SmtpConfigTab.tsx
│       │       └── UserManagementTab.tsx
│       ├── data/
│       │   └── demoClasses.ts
│       └── wasm-pkg/                 # Kompilierte Rust->WASM Artefakte (gradus21-core)
└── docs/
    └── ARCHITECTURE_AND_REVIEW_GUIDE.md
```

---

## 🚀 Schnellstart (Lokale Entwicklung)

### Voraussetzungen
- **Rust** (`rustup`, `cargo`, `wasm32-unknown-unknown` Target, optional `wasm-pack` bei Änderungen an `gradus21-core`)
- **Node.js** (`>= 20.x`) & `npm`

### 1. Rust Unit-Tests & Kryptografie-/Rechenkern prüfen
```bash
cargo test --workspace
```

### 2. Backend-Server (`gradus21-server`) auf Port `8080` starten
```bash
cargo run -p gradus21-server
```
*(Persistiert verschlüsselte Envelopes lokal unter `./data/vault_store.json` oder optional in PostgreSQL via `DATABASE_URL`).*

### 3. Frontend (`web/`) auf Port `5173` starten
```bash
cd web
npm install
npm run dev
```
Öffne anschließend **`http://localhost:5173`** im Browser.

### Optional: WebAssembly-Kern nach Änderungen an `crates/gradus21-core` neu bauen
```bash
wasm-pack build crates/gradus21-core --target web --out-dir ../../web/src/wasm-pkg
rm -f web/src/wasm-pkg/.gitignore
```

---

## 🐳 Docker Deployment (Prebuilt Images für kleine Systeme & Server)

Für Server, VPS oder ressourcenschwächere Mini-PCs/Home-Server (wie Raspberry Pi, Docker-VM, NAS) stehen vorkompilierte Multi-Arch-Images (`linux/amd64` und `linux/arm64`) auf GitHub Packages (GHCR) bereit, sodass **kein lokales Kompilieren von Rust/WASM/Node** nötig ist:

```bash
# 1. Konfiguration vorbereiten
cp .env.example .env

# 2. Vorgebaute Images von GHCR pullen & Stack starten
docker compose pull
docker compose up -d
```

- **Frontend (Web UI)**: `http://localhost:3080`
- **Backend API**: `http://localhost:8080`
- **PostgreSQL**: `localhost:5435`

*Hinweis: Wenn Sie den Code lokal verändern und selbst bauen möchten, nutzen Sie wie gewohnt `docker compose up -d --build`.*

---

## 📋 Alpha `0.1.0` Review-Fokus

Eine detaillierte technische Dokumentation aller Architekturentscheidungen, Berechnungsformeln und offenen Prüfpunkte für das Code- und Security-Review befindet sich in:
👉 **[`docs/ARCHITECTURE_AND_REVIEW_GUIDE.md`](docs/ARCHITECTURE_AND_REVIEW_GUIDE.md)**

---

## 📄 Lizenz

MIT License — Copyright (c) 2026 Julian Kallidat
