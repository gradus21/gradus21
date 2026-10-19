# Changelog

All notable changes to **Gradus21** are documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-20 (Production Release)

### Added
- **German & EU Legal Compliance & Privacy Hardening**:
  - Full self-hosting of web fonts (`web/public/fonts/`), eliminating Google Fonts CDN queries to comply with GDPR Art. 6 / LG München I.
  - Docker-configurable Impressum (§ 5 DDG) via backend `GET /api/legal/info` and `LEGAL_*` environment variables in `docker-compose.yml`.
  - Comprehensive DSGVO privacy policy (Art. 13 DSGVO) and TDDDG § 25 declaration for local storage.
  - Interactive Schul-Datenschutz Leitfaden für Lehrkräfte (clarifying duty of care, headmaster approvals, and state school laws).
  - Ready-to-sign Auftragsverarbeitungsvertrag (AVV gem. Art. 28 DSGVO) with exhaustive TOM (Art. 32 DSGVO) documentation and one-click copy & print/PDF export.
  - Persistent compliance footer on lock/login screen and in main application workspace.
- **True WebAuthn Cryptography (`webauthn-rs`) & Multi-Passkey Support**:
  - Configurable Relying Party ID (`RP_ID`), RP Name, and allowed origins (`WEBAUTHN_RP_ID`, `WEBAUTHN_RP_NAME`, `WEBAUTHN_RP_ORIGIN`, `WEBAUTHN_ALLOWED_ORIGINS`).
  - Challenge-response verification via `webauthn-rs` (`/api/auth/passkey/register/start`, `finish`, `/api/auth/passkey/login/start`, `finish`).
  - Multi-passkey management per teacher account with `user_passkeys` database table (1:n relation), hardware PRF extension support, device renaming, and individual key revocation.
  - Interactive device management UI in `VaultLockAndAuthModal` and passkey counter badges in Admin Panel.
- **Granular E2EE Envelopes per Class Dataset (`entity_type = 'class_dataset'`) & OCC**:
  - Each class (`ClassroomSubjectDataset`) is encrypted in its own AES-256-GCM envelope bound to `owner_user_id` and `dataset.id` via AAD.
  - Grade and assessment entries in Class A only trigger re-encryption and synchronization of Class A's envelope, dramatically reducing bandwidth and CPU usage.
  - Automatic client migration: legacy monolithic `workspace` envelopes are unpacked, mapped to canonical UUIDs, and persisted as granular envelopes upon loading.
  - Dedicated deletion endpoint support: removing a class invokes `DELETE /api/envelopes/:id` for that exact class ID.
  - Optimistic Concurrency Control (OCC) with `expected_version` and `409 Conflict` resolution without silent data loss.
- **Frontend Architecture & Modularization**:
  - Monolithic `App.tsx` decomposed from 4,060 lines into clean domain components and custom hooks (< 450 lines).
  - Modularized views in `web/src/views/` (`ClassMatrixView`, `SpeedGradingView`, `Student360View`, `GradingConfiguratorView`).
  - Encapsulated lifecycle and synchronization logic in `useVaultWorkspaceSync`, calculation in `useClassroomCalculations`, shortcuts in `useKeyboardShortcuts`, and guide in `useInteractiveGuide`.

## [0.1.0] - 2026-10-18 (Alpha Release)

### Added
- **Rust/WebAssembly Calculation Engine (`crates/gradus21-core/src/grading.rs`)**:
  - 100% client-side calculation of category averages, proportional empty-category scaling (`scale_empty_categories`), lowest-score dropping (`drop_lowest_count`), and overall student & class summaries.
  - Modular grading scales: German `1.0–6.0` with `+/-` tendencies (`1+` down to `6`), German Oberstufe `0–15` points (MSS), and `US Letter Grades (A+ to F)`.
  - Interactive grading curve threshold builder (`custom_thresholds`) and Binnendifferenzierung (`G` / `M` / `E` student levels with configurable percentage threshold offsets).
  - Target grade "What-If" simulator (`simulate_needed_score_in_category` / `simulate_needed_score_v2`).
- **Zero-Knowledge E2EE Cryptographic Core (`crates/gradus21-core/src/crypto.rs`)**:
  - Client-side `Argon2id` master key derivation (`19 MiB`, 2 iterations, OWASP min) + `HKDF-SHA256` domain separation (`wrapping_key` & `auth_hash`).
  - `AES-256-GCM` authenticated envelope encryption bound to `owner_user_id` and `entity_id` via Additional Authenticated Data (AAD).
  - 24-character Emergency Recovery Key (`Notfall-Wiederherstellungscode`) wrapping and unwrapping of the Data Encryption Key (`DEK`).
- **Axum Sync & Auth Backend (`crates/gradus21-server/src/main.rs`)**:
  - Multi-tenant envelope storage with strict `owner_user_id` scoping (`resolve_tenant_envelope_id`).
  - Password registration/login, RFC 6238 TOTP 2FA setup & verification, WebAuthn/Passkey challenge & credential registration, and Zero-Knowledge emergency password recovery.
- **React 18 + TypeScript + Tailwind CSS Workspace (`web/`)**:
  - 4 integrated workspace modes: *Gesamt-Matrix*, *Speed-Grading*, *Schüler:innen-360°-Akte*, and *Visueller Gewichtungs-Baukasten*.
  - Native `.xlsx` drag-and-drop importer and multi-sheet `.xlsx` exporter + print-ready A4 parent & conference reports.
  - Class Management Modal for editing existing classes, archiving/deleting students, and adjusting test counts per category.
  - Cross-device synchronized user settings (4 color themes, dark/light mode, favorite presets, progressive disclosure toggles).
