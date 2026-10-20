# Changelog

All notable changes to **Gradus21** are documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/).

## [1.1.2] - 2026-10-20

### Fixes & Synchronization Improvements
- **Multi-Device Real-Time Synchronization & Auto-Renewal (#13)**:
  - Resolved `cloudSyncEnabled` reverting to `local_only` upon connection drop or server session expiration.
  - Transparent silent token renewal (`renewTokenIfNeeded`) using client-side derived `authKeyB64` upon receiving HTTP 401 Unauthorized, eliminating jarring session loss and alerts.
  - Real-time background sync polling (12s interval) active exclusively on focused tabs (`visibilitychange` / `window.focus`), ensuring remote grade modifications propagate seamlessly across devices without manual refreshes.
  - Synchronized singleton settings envelope versions between tenant-scoped UUID and static UUID `00000000-0000-4000-8000-000000000002`.
  - Empty starter classes (`class_starter_...` with 0 students and 0 grades) are filtered out from reconciliation warnings to streamline multi-device initial onboarding.

### Security & Privacy (DSGVO / GDPR)
- **Account Self-Purge (`DELETE /api/users/me`) (#14)**:
  - Full self-service data erasure pursuant to Art. 17 DSGVO ("Right to be Forgotten"). Users can permanently purge their account, credentials, and encrypted envelopes directly from privacy settings.
- **Email Verification Flow Hardening (#15)**:
  - Added cryptographic constant-time comparison (`subtle::ConstantTimeEq`) for verification codes to eliminate timing attacks.
  - Implemented brute-force rate limits (maximum 5 attempts per code, 60s cooldown per address, 15-minute expiration).

### Quality & Performance
- **Refactoring & Cleanups**:
  - Addressed Rust clippy lints (`clippy::type_complexity`, `clippy::unnecessary_sort_by`) in `gradus21-server`.
  - Maintained 100% test pass rate across Rust workspace (20 tests) and TypeScript type checks.

## [1.1.1] - 2026-10-20

### Security & Hardening
- **WebAuthn Handshake Enforcement & Legacy Bypass Elimination (#8)**:
  - Decommissioned unauthenticated passkey login route (`POST /api/auth/passkey/login`).
  - Strict two-stage WebAuthn cryptographic verification using `webauthn-rs` (`/start` with server challenge + `/finish` verifying assertion response).
  - Cross-device Passkey Onboarding: Passkey login start response delivers `passkey_prf_salt_b64` to newly added devices to allow hardware-bound PRF key unwrapping for synced passkeys (iCloud Keychain, 1Password, Google Password Manager) without password prompts.
- **CORS Hardening & Whitelist Fallback (#11)**:
  - Removed insecure wildcard `allow_origin(Any)` fallback on unconfigured servers.
  - CORS origin now defaults to `WEBAUTHN_RP_ORIGIN` and `WEBAUTHN_ALLOWED_ORIGINS` alongside explicit localhost origins.
  - Documented `CORS_ALLOWED_ORIGIN` in `.env.example` and `docker-compose.yml`.

### Architecture & Data Integrity
- **Optimistic Concurrency Control (OCC 409) 3-Way Merge & Zero-Loss Guarantee (#9)**:
  - Resolved silent grade overwrite on concurrency conflict.
  - Implemented field-granular 3-way merge (`mergeClassroomDatasets`) across students, categories, assessments, and grade entries.
  - Automatic Conflict Vault Copy: On true grade collisions between two active devices, the local version is retained and a separate conflict snapshot (`<Klasse> (Lokale Noten-Kopie)`) is created to ensure zero data loss.

### Performance & Storage
- **School Drive Mirroring Optimization & Retention Rotation (#10)**:
  - Harmonized local backup filename to `gradus21_vault_backup_<userId>.gradus21` (matching architectural documentation and README).
  - Debounced auto-save (350 ms) exclusively updates the atomic `latest` mirror, shifting timestamped snapshots to a 15-minute interval or manual export to relieve slow school network shares (SMB/NFS) and USB drives.
  - Automated retention rotation: Cleans up historical backup files exceeding a threshold of 20 snapshots per vault.

### Documentation & Consistency
- **Unified Release Versioning v1.1.1 (#12)**:
  - Synchronized documentation, handbooks, mock window titles, and workspace configurations across `README.md`, `ARCHITECTURE_AND_REVIEW_GUIDE.md`, and `gradus21-website`.

## [1.1.0] - 2026-10-20

### Added
- **Opt-In Cloud Sync & School Privacy First Architecture**:
  - Cloud synchronisation is now strictly **Opt-In** and disabled by default. All teacher, class, and grade data remain 100% locally on the device unless explicitly activated.
  - Interactive **AVV-Confirmation Modal**: When opting into cloud sync, a confirmation dialog verifies whether an Auftragsverarbeitungsvertrag (AVV gem. Art. 28 DSGVO) is already in place. If not, the interactive school privacy guide and prefilled AVV contract are automatically opened.
  - Granular Cloud Purge: When deactivating cloud sync, teachers can immediately purge all remote encrypted envelopes via `DELETE /api/envelopes` with a single click.
- **Automated Local School Share Mirror (HTML5 Directory Handle API)**:
  - Added support for persistent local folder mirroring (`localBackupStorage.ts`). Teachers can connect a dedicated folder on their school network share (Netzlaufwerk) or encrypted USB drive.
  - Gradus21 automatically writes an encrypted, zero-knowledge backup mirror (`.gradus21`) to the connected directory upon every grade modification.
  - Automated browser storage persistence request (`navigator.storage.persist()`) prevents browser cache eviction across system restarts.
- **Full PWA Offline Support & Service Worker Caching**:
  - Implemented offline Service Worker (`sw.js`) and PWA web app manifest (`manifest.json`).
  - Gradus21 caches the entire application shell, WebAssembly calculation core, and local fonts, allowing full offline usage in network-dead classrooms without WLAN.
- **Direct Offline Backup Restore on Lock & Login Screen**:
  - Added a one-click restore link (*„Aus verschlüsseltem Noten-Backup (.gradus21) wiederherstellen“*) directly to the lock and login modal.
  - Allows seamless device migration in pure offline mode without prior server setup.
- **Interactive Demo Guide v2**:
  - Updated Chapter 6 with offline resilience, school storage mirror configuration, and opt-in steps.
  - 1-Click Demo Class: Added instant demo class creation (English 6 with 12 students and sample grades) directly inside the setup wizard.
  - Non-blocking guide overlays (`pointer-events-none` on backdrop) so teachers can freely interact with wizard modals during the walkthrough.

### Security & Hardening
- **Passkey WebAuthn Abort & Cancellation Safeguard**:
  - Fixed an authentication bypass where cancelling or closing a third-party password manager dialog (Bitwarden, 1Password, etc.) fell back to cached local secrets.
  - Strict abort handling for `AbortError`, `NotAllowedError`, `SecurityError`, and dismissed modals (`assertion === null`), guaranteeing that the vault stays locked unless biometrics or PIN are confirmed.
- **Identical Legal & AVV Documentation**:
  - Synchronized legal agreement text, contract clauses (§ 1–6), technical and organizational measures (TOMs), and Leipzig server specs 1:1 between `LegalModal.tsx`, server templates, and `gradus21-website/avv.html`.

### Changed & Polished
- **Branding Alignment**:
  - Replaced legacy developer badge `BTE v2` in the application header with the official `E2EE` badge matching the website.
- **Settings UI Polish**:
  - Standardized tab bar heights, icons (`shrink-0`), padding, and visual hierarchy across all configuration sections.

## [1.0.1] - 2026-10-20

### Added
- **Website Integration (`https://gradus21.de`)**:
  - Integrated direct links to the official website and product documentation `gradus21.de` in the lock screen, the workspace footer, the application header logo, and the Impressum dialog.

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
- **Admin Control Panel & School Governance**:
  - Dedicated 4-tab administrative dashboard (`UserManagementTab`, `CentralTemplatesTab`, `MailTemplatesTab`, `BackupConfigTab`).
  - Teacher invitation flow via secure one-time tokens, user activation/deactivation, and demotion safeguards for the last remaining admin.
  - Central global grading scales and weighting presets deployment, derivation, and custom overrides.
  - SMTP notification system with configurable email templates (invitation, password reset, security alert), auto-submitted headers, and real-time delivery logs.
  - Automated snapshot backups via cron schedules (`0 2 * * *`), automatic retention rotation, and atomic restoration with client-cache invalidation.
- **Rebranding & Corporate Identity**:
  - Complete rebranding from *BTE NotenFlow* to **Gradus21** across crates (`gradus21-core`, `gradus21-server`), frontend, API routes, and documentation.
  - High-resolution SVG/PNG assets, light & dark theme logos, modern favicon, and polished visual styling.
  - WCAG-compliant high-contrast dark mode and adaptive 44px touch targets for iPad/tablet browsers.
- **Interactive Onboarding & Guided Demo Tour**:
  - Built-in 10-chapter interactive walkthrough (`InteractiveDemoGuide`, `useInteractiveGuide`) explaining the four workspace modes, binnendifferentiation, and zero-knowledge encryption directly within the live UI.
- **Authentication & Zero-Knowledge Key Management**:
  - Integrated 4-step registration wizard guiding teachers through master password setup, RFC 6238 TOTP 2FA, 24-character emergency recovery code generation, and optional WebAuthn passkey registration.
  - Password manager compatibility (Bitwarden, 1Password, Apple Keychain) with explicit autocomplete annotations (`username`, `current-password`, `new-password`, `one-time-code`).
  - Browser-side emergency recovery key rotation (`handleRotateRecoveryKey`) with instant DEK re-wrapping.
  - Hardware PRF (Pseudo-Random Function) extension support for biometric passkeys.
- **Grading Engine & UX Optimizations**:
  - Scale-Aware Direct Grading with instant parsing of German `1+` to `6`, Oberstufe MSS points `0-15`, and US letter grades `A+` to `F`.
  - Target Grade Simulator v2 ("Was-wäre-wenn") in Rust/WASM across all three calculation modes (*Kategorien-Töpfe*, *Freie Faktoren*, *Punktesammler*).
  - Dynamic lazy-loading of XLSX processing libraries to minimize initial bundle loading time.
  - Rust 2024 edition support in multi-stage Docker build (`rust:bookworm`).
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
