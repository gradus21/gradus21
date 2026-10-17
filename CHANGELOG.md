# Changelog

All notable changes to **BTE NotenFlow** are documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-18 (Alpha Release)

### Added
- **Rust/WebAssembly Calculation Engine (`crates/notenflow-core/src/grading.rs`)**:
  - 100% client-side calculation of category averages, proportional empty-category scaling (`scale_empty_categories`), lowest-score dropping (`drop_lowest_count`), and overall student & class summaries.
  - Modular grading scales: German `1.0–6.0` with `+/-` tendencies (`1+` down to `6`), German Oberstufe `0–15` points (MSS), and `US Letter Grades (A+ to F)`.
  - Interactive grading curve threshold builder (`custom_thresholds`) and Binnendifferenzierung (`G` / `M` / `E` student levels with configurable percentage threshold offsets).
  - Target grade "What-If" simulator (`simulate_needed_score_in_category`).
- **Zero-Knowledge E2EE Cryptographic Core (`crates/notenflow-core/src/crypto.rs`)**:
  - Client-side `Argon2id` master key derivation (`64 MiB`, 3 iterations) + `HKDF-SHA256` domain separation (`wrapping_key` & `auth_hash`).
  - `AES-256-GCM` authenticated envelope encryption bound to `owner_user_id` and `entity_id` via Additional Authenticated Data (AAD).
  - 24-character Emergency Recovery Key (`Notfall-Wiederherstellungscode`) wrapping and unwrapping of the Data Encryption Key (`DEK`).
- **Axum Sync & Auth Backend (`crates/notenflow-server/src/main.rs`)**:
  - Multi-tenant envelope storage with strict `owner_user_id` scoping (`resolve_tenant_envelope_id`).
  - Password registration/login, RFC 6238 TOTP 2FA setup & verification, WebAuthn/Passkey challenge & credential registration, and Zero-Knowledge emergency password recovery.
- **React 18 + TypeScript + Tailwind CSS Workspace (`web/`)**:
  - 4 integrated workspace modes: *Gesamt-Matrix*, *Speed-Grading*, *Schüler-360°-Akte*, and *Visueller Gewichtungs-Baukasten*.
  - Native `.xlsx` drag-and-drop importer and multi-sheet `.xlsx` exporter + print-ready A4 parent & conference reports.
  - Class Management Modal for editing existing classes, archiving/deleting students, and adjusting test counts per category.
  - Cross-device synchronized user settings (4 color themes, dark/light mode, favorite presets, progressive disclosure toggles).
