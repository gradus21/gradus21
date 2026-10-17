# BTE NotenFlow (`v0.1.0-alpha`)

> **Better Than Excel NotenFlow** — Zero-Knowledge E2EE & 100 % Client-Side Rust/WebAssembly Notenverwaltung für Lehrkräfte.
>
> ⚠️ **Status: Version `0.1.0` (Alpha Release)**  
> Dieses System befindet sich im Alpha-Stadium und dient als vollständiger, funktionsfähiger Referenz-Prototyp für Architektur-, Sicherheits- und UX-Reviews vor einem produktiven Schuleinsatz.

---

## 🎯 Warum „Better Than Excel“?

Viele Lehrkräfte verwalten ihre Klassenlisten, Punktetabellen, Gewichtungen (`50% LNW / 30% Mündlich / 20% Tests`) und Binnendifferenzierungen (`G` / `M` / `E`) in komplexen Excel-Arbeitsmappen. Sobald ein Kind krank ist (`K`), unterjährig die Schule wechselt, eine Streichnote greift oder eine leere Kategorie (z. B. am Halbjahresanfang noch keine Klassenarbeit geschrieben) proportional hochskaliert werden muss, brechen klassische Excel-Formeln wie `=MITTELWERT(...)` zusammen oder führen zu `#DIV/0!`-Fehlern.

**BTE NotenFlow** löst dieses Problem durch:
1. **100 % Client-Side Rust/WASM Rechenkern (`notenflow-core`)**: Jede Durchschnittsberechnung, proportionale Kategorien-Skalierung, Streichnote, Was-wäre-wenn-Simulation und Binnendifferenzierung (`G`/`M`/`E`) läuft deterministisch in WebAssembly direkt im Browser.
2. **Zero-Knowledge Ende-zu-Ende-Verschlüsselung (E2EE Envelope Architecture)**: Schülerdaten und Noten verlassen das Endgerät ausschließlich als `AES-256-GCM`-Chiffretext. Der Server (`notenflow-server`) sieht niemals Klartext-Namen oder Noten.
3. **Pädagogische Ergonomie ohne Formel-Bastelei**: 4 spezialisierte Arbeitsmodi (*Gesamt-Matrix*, *Speed-Grading*, *Schüler-360°-Akte*, *Visueller Gewichtungs-Baukasten*).

---

## ✨ Funktionsumfang in Version `0.1.0` (Alpha)

### 1. Vier vernetzte Arbeitsmodi
- **📊 Gesamt-Matrix**:
  - Übersicht aller Schülerinnen und Schüler inkl. Niveaustufe (`G` / `M` / `E`), Einzelprüfungen, **Kategorie-Durchschnitten (`Ø LNW`, `Ø Mündl`, `Ø Tests`)**, berechnetem **Gesamtschnitt** und editierbarer **Zeugnisnote (Override)**.
  - Umschaltbare Zellen-Darstellung (`Prozent + Note`, `Nur Prozent`, `Nur Note`) und Halbjahres-Filter (`1. Halbjahr`, `2. Halbjahr`, `Gesamtjahr`).
  - **Klassenzimmer-Beamer-Schutz („Namen ausblenden“)** per 1-Klick.
- **⚡ Speed-Grading (Fokus-Erfassung)**:
  - Tastatur-optimierte Schnellerfassung (`Enter` / `Pfeiltasten` / `K` für entschuldigt / Attest) wahlweise in **Prozent (`%`)** oder **Rohpunkten (`Pkt.`)**.
  - Live-Notenspiegel (Notenverteilung `1` bis `6` + Klassenschnitt) und direkter Notenschlüssel-Tuner.
- **🎓 Schüler-360°-Akte (Elterngespräch & Beratung)**:
  - Stärken-/Schwächen-Profil je Kategorie im Vergleich zum Klassenschnitt.
  - **Interaktiver „Was-wäre-wenn“-Ziel-Simulator**: Berechnet per Rust-WASM exakt, wie viel Prozent in der nächsten Prüfung nötig sind, um eine Wunschnote zu halten oder zu erreichen.
  - Pädagogisches Gutachten & Zeugnisnoten-Festlegung mit Begründung.
- **🎛️ Visueller Gewichtungs-Baukasten (ohne Excel-Formeln)**:
  - **Skalen-Auswahl**: Klassische Schulnoten `1–6` (mit `+/-` Tendenzen `1+` bis `6`), gymnasiale Oberstufe (`0–15 MSS-Punkte`) oder `US Letter Grades (A+ bis F)`.
  - **Berechnungs-Modelle**: *Kategorien-Töpfe (Buckets)*, *Freie Faktoren (`1x`, `2x`)* oder *Punktesammler (Total Points)*.
  - **Individuelle Kategorien & Eigene Vorlagen**: Beliebige Kategorien anlegen, umbenennen, gewichten, Streichnoten festlegen und als eigene Vorlage synchronisiert speichern.
  - **Notenschlüssel-Editor („Welche Prozent entsprechen welcher Note?“)**: 4 Vorlagen (*Sek-I Standard*, *IHK 50%-Hürde*, *Pädagogisch Mild*, *Streng*) + stufenlose Regler & Zahleneingaben für Note 1 bis 5 inkl. 16er-Feinstufen-Übersicht (`1+` bis `6`).
  - **Binnendifferenzierung (`G` / `M` / `E` Niveaustufen)**: Ein-/Ausschalter, Vorlagen und individuelle Prozent-Verschiebungen für Grundlegendes (`G`), Mittleres (`M`) und Erweitertes (`E`) Niveau inkl. **Live-Vergleichstabelle (`G` vs. `M` vs. `E`)**.

### 2. Klassenverwaltung, Excel-Migration & Druck-Exporte
- **Nativer `.xlsx` Drag-and-Drop-Assistent**: Importiert bestehende Excel-Notenlisten automatisch inkl. Schülerstamm, Niveaustufen (`G`/`M`/`E`) und vorhandenen Tests.
- **Bestehende Klassen flexibel bearbeiten**: Schüler unterjährig hinzufügen, **archivieren** (z. B. bei Schulwechsel ohne Datenverlust) oder löschen; Anzahl der Leistungsnachweise/Tests je Kategorie per `+/-` anpassen.
- **Konferenz- & Elterngesprächs-Exporte**: Mehrblättriger `.xlsx`-Export sowie druckfertige A4-Berichte (Klassenkonferenz-Bogen & Einzel-Elternsprechtagsbogen).

### 3. Zero-Knowledge E2EE Security & Multi-User-Isolation
- **Argon2id + HKDF-SHA256 + AES-256-GCM Envelope Encryption**:
  - Das Passwort der Lehrkraft leitet lokal im Browser den *Master Key* ab.
  - Der *Data Encryption Key (DEK)* wird lokal gewrappt (`encrypted_dek`); der Server speichert ausschließlich verschlüsselte Envelopes.
- **Strikte Mandantentrennung (Multi-Tenancy)**:
  - Jedes Lehrkraft-Konto besitzt eine eigene `user_id`, eigenen `kdf_salt`, eigenen `DEK` sowie strikt nach `owner_user_id` getrennte Server-Envelopes und isolierten `localStorage`-Cache.
- **Passkey (WebAuthn / FIDO2)**, **TOTP 2FA (RFC 6238 QR-Code + Manuelles Base32-Setup)** und **24-stelliger Notfall-Wiederherstellungscode (`Recovery Key`)**.

---

## 🏗️ Projekt-Architektur

```text
bte-notenflow/
├── Cargo.toml                        # Rust Workspace (v0.1.0)
├── crates/
│   ├── notenflow-core/               # Shared Rust Library + WebAssembly Bindings
│   │   └── src/
│   │       ├── crypto.rs             # Argon2id, HKDF-SHA256, AES-256-GCM, Recovery Key Wrapping
│   │       ├── grading.rs            # 100% Client-Side Grading Engine (Buckets, G/M/E, Simulator)
│   │       ├── wasm.rs               # wasm-bindgen Exports für den Browser
│   │       └── lib.rs
│   └── notenflow-server/             # Rust Axum REST API & Zero-Knowledge Sync Backend
│       └── src/
│           └── main.rs               # Auth, TOTP 2FA, Passkey, Recovery, Tenant-Isolated Envelopes
├── migrations/
│   └── 001_initial_schema.sql
├── web/                              # React 18 + TypeScript + Tailwind CSS + Vite Frontend
│   └── src/
│       ├── App.tsx                   # Hauptanwendung (4 Arbeitsmodi + Live-WASM-Integration)
│       ├── components/
│       │   ├── ClassManagementModal.tsx
│       │   ├── ClassSetupAndExcelWizard.tsx
│       │   ├── ExportAndPrintHelpers.ts
│       │   ├── FlowRibbonLogo.tsx
│       │   ├── SettingsModal.tsx
│       │   └── VaultLockAndAuthModal.tsx
│       ├── data/
│       │   └── demoClasses.ts
│       └── wasm-pkg/                 # Kompilierte Rust->WASM Artefakte (notenflow-core)
└── docs/
    └── ARCHITECTURE_AND_REVIEW_GUIDE.md
```

---

## 🚀 Schnellstart (Lokale Entwicklung)

### Voraussetzungen
- **Rust** (`rustup`, `cargo`, `wasm32-unknown-unknown` Target, optional `wasm-pack` bei Änderungen an `notenflow-core`)
- **Node.js** (`>= 20.x`) & `npm`

### 1. Rust Unit-Tests & Kryptografie-/Rechenkern prüfen
```bash
cargo test --workspace
```

### 2. Backend-Server (`notenflow-server`) auf Port `8080` starten
```bash
cargo run -p notenflow-server
```
*(Persistiert verschlüsselte Envelopes lokal unter `./data/vault_store.json` oder optional in PostgreSQL via `DATABASE_URL`).*

### 3. Frontend (`web/`) auf Port `5173` starten
```bash
cd web
npm install
npm run dev
```
Öffne anschließend **`http://localhost:5173`** im Browser.

### Optional: WebAssembly-Kern nach Änderungen an `crates/notenflow-core` neu bauen
```bash
wasm-pack build crates/notenflow-core --target web --out-dir ../../web/src/wasm-pkg
rm -f web/src/wasm-pkg/.gitignore
```

---

## 📋 Alpha `0.1.0` Review-Fokus

Eine detaillierte technische Dokumentation aller Architekturentscheidungen, Berechnungsformeln und offenen Prüfpunkte für das Code- und Security-Review befindet sich in:
👉 **[`docs/ARCHITECTURE_AND_REVIEW_GUIDE.md`](docs/ARCHITECTURE_AND_REVIEW_GUIDE.md)**

---

## 📄 Lizenz

MIT License — Copyright (c) 2026 Julian Kallidat
