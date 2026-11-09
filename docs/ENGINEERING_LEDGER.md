# Gradus21 Engineering Ledger & Architektur-Invarianten

Dieses Dokument verhindert das **„Whack-a-Mole“-Muster** (bei dem ein Fix an Stelle A ein Folgeproblem an Stelle B sichtbar macht oder Aufrufer C vergessen wird).

**Grundregel für alle Änderungen an Gradus21:**
> **Invarianten gehören an die Modul-Grenze (Single Source of Truth), niemals in einzelne Aufrufer (Call-Sites).**
> Wenn eine Sicherheits- oder Konsistenzregel verletzt werden *kann*, weil ein Aufrufer die „falsche“ Hilfsfunktion wählt oder einen Aufräumschritt vergisst, ist die API falsch geschnitten.

---

## 1. Warum wir uns im Kreis gedreht haben (Root-Cause-Analyse)

| Themenbereich | Was bisher passiert ist (Symptom-Patching) | Warum es im nächsten Audit wieder auftauchte | Saubere Architekturlösung (By Construction) |
| :--- | :--- | :--- | :--- |
| **TOTP / 2FA** | Neben `verify_totp_code` wurde eine zweite Funktion `verify_totp_code_once` eingeführt und nur in 2 von 5 Endpunkten (`login`, `rotate_recovery_key`) aufgerufen. Im Frontend blieb `verifyTotpCode` zustandslos. | Weil die unsichere Funktion `pub fn verify_totp_code` weiter öffentlich existierte, nutzten `enable_2fa`, `reconfigure_2fa` und `disable_2fa` sie weiterhin. | **Nur noch eine öffentliche Funktion:** `verify_totp_code` wird privat (`fn`). Öffentlich existiert im Backend **nur** `pub fn verify_user_totp(user_id, secret, code)` (immer mit Replay-Schutz + Rate-Limit-Kopplung) und im Frontend `verifyTotpCodeOnce(userScope, secret, code)`. |
| **Envelope-Sync & OCC** | Versionsprüfung (`expected_version`) und DB-/RAM-Updates wurden einzeln in `upsert_envelope`, `batch_sync_envelopes` und `sync_envelope_to_pg_checked` gepflegt. | `expected_version: None` überschrieb bestehende Envelopes; bei Teil-Batch-Fehlern liefen PostgreSQL und `mem_envelopes` auseinander; `sync_envelope_to_pg` blieb als toter Code zurück. | **Zentrale Methode `state.apply_envelope_batch_atomic(...)`:** Prüft alle Vorbedingungen (`None` nur erlaubt, wenn Envelope noch nicht existiert; `Some(v)` muss `existing.version` entsprechen), führt alle PG-Schreibvorgänge in **einer** SQL-Transaktion (`pool.begin()`) aus und aktualisiert `mem_envelopes` erst nach erfolgreichem Commit. |
| **User- & Account-Lifecycle** | `DELETE /api/envelopes` (`envelopes.rs`) und `DELETE /api/admin/users/{id}` (`admin.rs`) hatten jeweils eigenen Lösch-Code. | In `envelopes.rs` wurden `delete_all_passkeys_for_user_from_pg` und `clear_totp_replay_state` ergänzt, in `admin.rs` aber vergessen. | **Zentrale Methode `state.delete_user_completely(user_id)`:** Räumt an **einer** Stelle PG (`envelopes`, `passkeys`, `users`) und alle RAM-Maps (`mem_users`, `mem_passkeys`, `mem_envelopes`, `reg_challenges`, `auth_challenges`, `totp_replay`) auf. |
| **Krypto-Metadaten (`DEK` / `Recovery`)** | `passkey_register_finish` diente sowohl als Erst-Setup für Passkey-Only-Konten als auch zum Hinzufügen weiterer Passkeys. | `kdf_salt` hatte ein `if u.kdf_salt.is_empty()`, aber `encrypted_dek` und `recovery_auth_key_hash` wurden ohne Passwortprüfung überschrieben. | **Strikte Invariante am `UserRecord`:** Bestehende `kdf_salt`-, `encrypted_dek`-, `recovery_encrypted_dek`- und `recovery_auth_key_hash`-Werte dürfen **niemals** durch Passkey-Registrierung überschrieben werden – Änderungen daran sind ausschließlich über kryptografisch autorisierte Endpunkte (`change-password`, `recover`, `rotate-recovery-key`) erlaubt. |
| **LocalStorage `classEnvelopes`** | `localStorage.setItem(cacheKey, ...)` wurde an mehreren Stellen in `useVaultWorkspaceSync.ts` händisch gemerged (`{ ...parsedOld.classEnvelopes, ... }`). | Gelöschte Klassen blieben nach `download_remote` oder `handleRestoreSnapshot` in `parsedOld.classEnvelopes` stehen („Zombie-Klassen“). | **Einziger Cache-Writer `syncClassEnvelopesCache(...)`:** Filtert `classEnvelopes` bei jedem Schreibvorgang strikt gegen die aktuelle `datasets`-Liste (`validClassIds`) und kapselt das Leeren von Cache + Versions-Refs bei Reset/Restore in einer Funktion `clearLocalVaultWorkspaceCache(userId)`. |
| **Server-Backup & Disk-Persistenz** | `persist_to_disk` (`state.rs`) und `perform_backup_snapshot` (`admin.rs`) bauten jeweils ihren eigenen Snapshot-Serializer. | `persist_to_disk` wurde auf Zero-Clone-Referenzen umgestellt, während `perform_backup_snapshot` weiterhin alle 5 `HashMap`s klonte. | **Gemeinsame Methode `state.serialize_full_snapshot_json()`:** Serialisiert alle 5 Maps per Referenz (`&HashMap`) ohne Klonen für sowohl `persist_to_disk` als auch `perform_backup_snapshot`. |

---

## 2. Verbindliche System-Invarianten (Checkliste vor jedem Commit)

### Invariante I-1: TOTP ist immer Replay-geschützt (One-Time Use)
- **Regel:** Ein 6-stelliger TOTP-Code darf pro `(user_id, 30s-Zeitschritt)` **höchstens einmal** akzeptiert werden – egal ob beim Login, beim Aktivieren/Deaktivieren von 2FA, beim Neukonfigurieren oder bei der Recovery-Key-Rotation.
- **Technische Durchsetzung:**
  - In [`crates/gradus21-server/src/totp.rs`](file:///home/julian/coding/gradus21/crates/gradus21-server/src/totp.rs) gibt es **keine** öffentliche zustandslose Verifikationsfunktion mehr.
  - Die einzige öffentliche Funktion heißt `pub fn verify_totp_code_once(user_id: Uuid, secret_base32: &str, code: &str) -> bool`.
  - Im Frontend ([`web/src/utils/totp.ts`](file:///home/julian/coding/gradus21/web/src/utils/totp.ts)) speichert `verifyTotpCode` bei Übergabe einer `replayScopeKey` (oder standardmäßig pro Secret-Fingerprint) den zuletzt akzeptierten `timeStep` in `sessionStorage` und weist jeden Schritt `<= lastStep` ab.
  - Beim Deaktivieren von 2FA ([`disable_2fa`](file:///home/julian/coding/gradus21/crates/gradus21-server/src/routes/auth.rs)) rotiert der Server sofort `totp_secret_server_encrypted` auf ein frisches TOTP-Secret und liefert `totp_secret_base32` + `totp_setup_uri` zurück, damit alte Authenticator-Einträge ungültig werden und eine sofortige Neueinrichtung ohne Stale-Secret funktioniert.
  - Im Frontend ([`VaultLockAndAuthModal.tsx`](file:///home/julian/coding/gradus21/web/src/components/VaultLockAndAuthModal.tsx), [`CryptoEnvelopeInspector.tsx`](file:///home/julian/coding/gradus21/web/src/components/vault/CryptoEnvelopeInspector.tsx), [`vaultSyncHelpers.ts`](file:///home/julian/coding/gradus21/web/src/hooks/vaultSyncHelpers.ts)) unterbindet `handleVerify2FA` zwingend den nativen HTML-Form-Reload (`e.preventDefault()`), synchronisiert `totpEnabled` sofort via `persistEncryptedSessionCredentialsToCache` in `localStorage` und gleicht `409 Conflict` von `GET /api/auth/2fa/setup` automatisch auf `totpEnabled: true` ab.

### Invariante I-2: Sensible Konto-Mutationen erfordern Re-Authentifizierung + Rate-Limiting
- **Regel:** Kein Endpunkt darf Passwort-Hashes, Recovery-Keys, 2FA-Status oder die Konto-E-Mail-Adresse allein auf Basis eines 7-Tage-JWTs ändern.
- **Technische Durchsetzung:**
  - `passkey_register_finish` beschreibt `kdf_salt`, `encrypted_dek`, `recovery_encrypted_dek` und `recovery_auth_key_hash` ausschließlich dann, wenn das jeweilige Feld noch leer ist (Initial-Setup eines Passkey-Only-Kontos).
  - `update_user_email` unterliegt `check_auth_rate_limit`, nutzt `state.is_test_or_production_env()` für die Pflicht zur E-Mail-Code-Verifikation und verlangt bei gesetztem `auth_key_hash` die Bestätigung durch `auth_key_b64`.

### Invariante I-3: Atomare Envelope-Persistenz & Strikte Optimistic Concurrency Control (OCC)
- **Regel:**
  1. Existiert ein Envelope auf dem Server bereits (`existing.is_some()`), **muss** `expected_version` mit `Some(existing.version)` übereinstimmen (`None` bei existierendem Envelope = `409 Conflict`).
  2. PostgreSQL und `state.mem_envelopes` dürfen niemals unterschiedliche Versionen desselben Envelopes halten.
- **Technische Durchsetzung:**
  - `upsert_envelope` delegiert intern an dieselbe atomare Batch-Logik wie `batch_sync_envelopes` (ein Einzel-Upsert ist ein Batch der Länge 1!).
  - Bei aktivem PostgreSQL läuft der gesamte Batch in einer einzigen SQL-Transaktion (`let mut tx = pool.begin().await?`). Schlägt ein einziges Envelope fehl (`Conflict` oder `DbError`), rollt PostgreSQL automatisch alle bisherigen Änderungen des Batches zurück und `mem_envelopes` bleibt unverändert.

### Invariante I-4: Vollständiger User-Lifecycle-Purge an einer Stelle
- **Regel:** Das Löschen eines Benutzers (egal ob durch Selbstlöschung via `DELETE /api/envelopes` oder durch einen Admin via `DELETE /api/admin/users/{id}`) muss identisch alle abhängigen Daten in PostgreSQL und im RAM entfernen.
- **Technische Durchsetzung:**
  - Eine einzige Funktion `delete_user_account_everywhere(state: &AppState, user_id: Uuid)` löscht Passkeys, Envelopes, den User-Datensatz, offene WebAuthn-Challenges und den TOTP-Replay-Status.

### Invariante I-5: `localStorage.classEnvelopes` ist eine reine Projektion von `datasets`
- **Regel:**
  1. Im lokalen Browser-Cache (`gradus21_e2ee_user_vault_v3_<userId>`) dürfen unter `classEnvelopes` ausschließlich Klassen-UUIDs liegen, die aktuell im `datasets`-State vorhanden sind.
  2. Nach einer Richtungs- oder Merge-Reconciliation (`executeReconciliation`) dürfen im lokalen Cache (`syncedEnvelopes`) niemals veraltete Remote-Ciphertexte (`remoteEnv.encrypted_payload`) für gemergte oder lokal hochgeladene Klassen abgelegt werden. Bei `strategy === 'merge'` oder `upload_local` werden alle Klassen immer frisch mit dem aktiven DEK verschlüsselt und bei unvollständigem Upload `dirty: true` markiert. Stale Remote-Envelopes werden nur bei explizitem `download_remote` übernommen.
- **Technische Durchsetzung:**
  - Beim Auto-Save wird `parsedOld.classEnvelopes` vor dem Merge auf `new Set(datasets.map(d => ensureValidUuid(d.id)))` gefiltert.
  - Beim Snapshot-Restore (`handleRestoreSnapshot`) werden `classEnvelopes`, `envelopeVersionsRef` und `lastSerializedPerClassRef` über einen gemeinsamen Helper geleert.
  - In [`useVaultWorkspaceSync.ts`](file:///home/julian/coding/gradus21/web/src/hooks/useVaultWorkspaceSync.ts) verschlüsselt `executeReconciliation` gemergte Klassen immer frisch via `wasm_encrypt_envelope(...)` und verhindert das Einschleusen alter Remote-Ciphertexte in den lokalen Cache.

### Invariante I-6: Live-Synchronisation von Session-Claims & System-Grenzwächtern (Restore / Recovery / Relay)
- **Regel:**
  1. Kein authentifizierter Request darf sich auf veraltete Rollen- oder E-Mail-Felder (`is_admin`, `email`) aus einem bis zu 7 Tage alten JWT verlassen.
  2. Kein Backup-Restore (`restore_backup`) darf das System ohne mindestens einen aktiven Administrator (`is_admin && is_active`) hinterlassen oder Tabellen außerhalb der SQL-Transaktion überschreiben.
  3. Kein Passwort-Recovery (`recover_password`) darf ein aktiviertes 2FA (`totp_enabled`) ohne gültigen Einmal-TOTP-Code umgehen.
  4. Unauthentifizierte Handshake-/Loopback-Puffer (`desktop_relay_sessions`, `browser_auth.rs`) und Dateinamen-Parameter (`export_backup_file`) müssen strikte Größen- und Zeichen-Whitelists am Funktionseingang erzwingen.
- **Technische Durchsetzung:**
  - [`authenticate_request`](file:///home/julian/coding/gradus21/crates/gradus21-server/src/middleware.rs) überschreibt `claims.is_admin` und `claims.email` bei jedem Request live aus `state.mem_users`.
  - [`restore_backup`](file:///home/julian/coding/gradus21/crates/gradus21-server/src/admin.rs) prüft vor jeder DB-/RAM-Mutation `restored_users.values().any(|u| u.is_admin && u.is_active)` und führt auch `system_settings`- und `grading_templates`-Updates innerhalb derselben SQL-Transaktion `tx` aus.
  - [`recover_password`](file:///home/julian/coding/gradus21/crates/gradus21-server/src/routes/auth.rs) prüft bei `existing_user.totp_enabled` verpflichtend `totp::verify_totp_code_once`.

### Invariante I-7: Konto-Aussperrungsschutz (Anti-Lockout), WebAuthn-Counter-Integrität & universelle Map-/Batch-Obergrenzen
- **Regel:**
  1. Weder Administrator:innen (`update_user_status`, `delete_user`, `restore_backup`) noch Benutzer:innen selbst (`delete_user_passkey_by_id`, `delete_passkey`) dürfen eine Aktion ausführen, durch die ein aktives Konto ohne jeglichen primären Anmeldefaktor (`auth_key_hash.is_empty() && passkeys_count == 0`) oder die Instanz ohne aktiven Admin (`is_admin && is_active`) zurückbleibt.
  2. Jede erfolgreiche WebAuthn-Authentifizierung (`passkey_login_finish`) muss das gespeicherte `Passkey`-Objekt über `Passkey::update_credential(&auth_result)` fortschreiben, damit die Hardware-Clone-Detection von `webauthn-rs` aktiv bleibt.
  3. **Alle** flüchtigen In-Memory-Maps (`AUTH_RATE_LIMITS`, `TOTP_LAST_USED_STEP`, `DESKTOP_RELAY_SESSIONS`, `reg_challenges`, `auth_challenges`, `mem_email_verifications`) sowie Batch-/IPC-Endpunkte (`apply_envelope_upserts` max. 500 Elemente, `native_save_file` max. 32 MiB Base64) erzwingen feste Kapazitäts- und Größenobergrenzen.
- **Technische Durchsetzung:**
  - [`delete_user_passkey_by_id`](file:///home/julian/coding/gradus21/crates/gradus21-server/src/routes/passkey.rs) und [`delete_passkey`](file:///home/julian/coding/gradus21/crates/gradus21-server/src/routes/passkey.rs) verweigern das Löschen des letzten Passkeys, wenn `user.auth_key_hash.is_empty()` ist (`400 Bad Request`).
  - [`passkey_login_finish`](file:///home/julian/coding/gradus21/crates/gradus21-server/src/routes/passkey.rs) ruft `pk.update_credential(&auth_result)` auf und serialisiert das aktualisierte `Passkey`-Struct zurück nach `passkey_data`.
  - `reg_challenges`, `auth_challenges` und `mem_email_verifications` weisen neue Einträge ab `len() >= 2048` mit `429 Too Many Requests` ab; `LAST_USED_TOTP_STEP` bereinigt abgelaufene Zeitfenster ab `len() >= 2048`; [`apply_envelope_upserts`](file:///home/julian/coding/gradus21/crates/gradus21-server/src/routes/envelopes.rs) begrenzt Batches auf `<= 500` Envelopes und `entity_type` auf `1..=64` Zeichen; [`keyring_auth.rs`](file:///home/julian/coding/gradus21/src-tauri/src/keyring_auth.rs) beschränkt OS-Schlüsselbund-Zugriffe strikt auf den Namespace `de.gradus21.*`.

### Invariante I-8: Reverse-Proxy-, Client-IP- & Netzwerk-Boundary-Integrität
- **Regel:**
  1. IP-basiertes Rate-Limiting hinter einem Reverse-Proxy darf niemals durch vom Client mitgesendete `X-Forwarded-For`-Präfixe umgehbar sein.
  2. Nginx-Unter-`location`-Blöcke mit eigenem `add_header` müssen die zentralen Security-Header (`X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Referrer-Policy`) explizit mitführen; `/.well-known/` wird dynamisch vom Rust-Backend bedient.
  3. Ausgehende Netzwerk-Transports (SMTP) müssen ein hartes Timeout (`10s`) besitzen, und interne Container-Ports (`postgres`, `server`) binden standardmäßig auf `127.0.0.1`.
  4. Alle Client-seitigen Netzwerk-Anfragen zum Backend (`web/src/hooks/useVaultWorkspaceSync.ts`, `web/src/components/VaultLockAndAuthModal.tsx`, `vaultSyncHelpers.ts`, `legalConfig.ts`) müssen über `fetchWithTimeout` mit maximal 8 Sekunden Timeout (`AbortSignal.timeout`) laufen, um hängende Verbindungen bei NAT-Loopback-Problemen oder Android Private DNS (DoT)-Stalls sofort kontrolliert abzubrechen.
- **Technische Durchsetzung:**
  - [`extract_client_ip`](file:///home/julian/coding/gradus21/crates/gradus21-server/src/middleware.rs) priorisiert `X-Real-IP` und wertet bei `X-Forwarded-For` ausschließlich das letzte (vom Proxy angehängte) Element (`.split(',').next_back()`) aus.
  - [`invite_user`](file:///home/julian/coding/gradus21/crates/gradus21-server/src/admin.rs) konstruiert `invite_url` ausschließlich aus vertrauenswürdigen Server-Origins (`PUBLIC_APP_URL` / `WEBAUTHN_RP_ORIGIN` / `WEBAUTHN_ALLOWED_ORIGINS` / `CORS_ALLOWED_ORIGIN`) und ignoriert ungeprüfte `Host`-/ `X-Forwarded-Host`-Header; [`download_backup`](file:///home/julian/coding/gradus21/crates/gradus21-server/src/admin.rs) erzwingt dieselbe strikte `[A-Za-z0-9._-]` + `.json`-Whitelist wie `export_backup_file`.
  - [`web/nginx.conf`](file:///home/julian/coding/gradus21/web/nginx.conf) leitet `/.well-known/` an `http://server:8080/.well-known/` weiter und setzt die Security-Header in allen Unter-Locations mit `always`.
  - [`send_email_internal`](file:///home/julian/coding/gradus21/crates/gradus21-server/src/admin.rs) setzt `.timeout(Some(Duration::from_secs(10)))` auf allen `AsyncSmtpTransport`-Buildern; [`docker-compose.yml`](file:///home/julian/coding/gradus21/docker-compose.yml) bindet `server` auf `${API_BIND_IP:-127.0.0.1}:${API_PORT:-8080}:8080`.
  - [`web/src/utils/apiConfig.ts`](file:///home/julian/coding/gradus21/web/src/utils/apiConfig.ts) exportiert `fetchWithTimeout(input, init, timeoutMs = 8000)`, bindet optionale Aufrufer-Signale sauber an und wirft bei Zeitüberschreitung sofort `TimeoutError`, wodurch `isPolling` freigegeben und blockierte UI-Zustände verhindert werden.

---

## 3. Audit-Historie & Status-Protokoll

| Runde | Datum | Gefundene Punkte | Hauptursache | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Audit #1** | 2026-11-08 | 15 Findings (Auth-Timing, TOTP-Replay bei Login/Recovery, OCC-SQL-Race, PBKDF2-Upgrade, Tauri-CSP/Loopback, Auto-Save-Diffing, WASM-Prewarm) | Historisch gewachsene Einzel-Implementierungen aus Protokoll v1/v2/v3 | **15/15 umgesetzt** |
| **Audit #2 (Follow-up)** | 2026-11-08 | 12 Findings (davon 5 Must-fix: TOTP-Replay bei 2FA-Disable/Reconfigure, Teil-Batch-Sync ohne Transaktion, Passkey-Register überschreibt `recovery_auth_key_hash`, `expected_version: null` überschreibt Bestand, Zombie-Klassen im `localStorage`) | Fixes aus Audit #1 wurden an einzelnen Aufrufern statt als zentrale Modul-Invariante eingebaut | **12/12 strukturell über Invarianten `I-1` bis `I-5` konsolidiert** |
| **Audit #3 (Follow-up)** | 2026-11-08 | 7 Findings (`I-1` bis `I-5` hielten zu 100 % ohne Regression; verbleibend: Stale `is_admin` im JWT nach Admin-Degradierung, fehlender Last-Admin-Check in `restore_backup`, 2FA-Pflicht bei `recover_password`, Größen-/Zeichenlimits in Desktop-Relay & Tauri-Loopback) | Statische JWT-Claims statt Live-Sync aus `mem_users` + fehlende Vorbedingung bei Full-Restore | **7/7 über Invariante `I-6` konsolidiert** |
| **Audit #4 (Follow-up)** | 2026-11-08 | 6 Findings (`I-1` bis `I-6` hielten zu 100 % ohne Regression; verbleibend: Erzwungene Step-Up-Auth bei `update_user_email`, At-Rest-Verschlüsselung von `smtp_config.password`, Prüfung auf `is_admin && is_active` beim Schutz des letzten Admins, Verhinderung von Re-Promotion degradierter Bootstrap-Admins beim Login, 6-stellige Ziffernpflicht in `verify_email_confirm`, CSV/Excel-Formula-Injection-Schutz) | Optionale Bedingung bei `update_user_email` + fehlender `is_active`-Filter beim Admin-Lockout-Check | **6/6 konsolidiert & durch Unit-Tests abgesichert** |
| **Audit #5 (Follow-up)** | 2026-11-08 | 5 Findings (`I-1` bis `I-6` hielten zu 100 % ohne Regression; 0 Must-fix; verbleibend: Passkey-only Anti-Lockout beim Löschen des letzten Passkeys, `Passkey::update_credential` Sign-Counter-Fortschreibung, Kapazitätsgrenzen `2048` für Challenge-/Verifikations-Maps, Batch-Obergrenze `500` in `apply_envelope_upserts`, `32 MiB` Limit in `native_save_file`) | Fehlende Selbst-Aussperrungsprüfung bei Passkey-only-Konten + unbegrenzte Challenge-Maps | **5/5 über Invariante `I-7` konsolidiert & getestet** |
| **Audit #6 (Follow-up)** | 2026-11-08 | 4 Findings (`I-1` bis `I-7` hielten zu 100 % ohne Regression; 0 Must-fix; verbleibend: `extract_client_ip` Spoofing-Schutz via `X-Real-IP` / letztes `X-Forwarded-For`, Nginx Security-Header-Vererbung & dynamisches `/.well-known/`, `10s` SMTP-Timeout, `127.0.0.1` Default-Bind in `docker-compose.yml`) | Reverse-Proxy- & Container-Netzwerkgrenzen außerhalb der Rust-Business-Logik | **4/4 über Invariante `I-8` konsolidiert & getestet** |
| **Audit #7 (Follow-up)** | 2026-11-08 | 3 Findings (`I-1` bis `I-8` hielten zu 100 % ohne Regression; 0 Must-fix; verbleibend: Host-Header-Injection-Schutz in `invite_user`, strikte `[A-Za-z0-9._-]` + `.json` Whitelist in `download_backup`, Millisekunden-/Kollisionsschutz bei `perform_backup_snapshot`) | Ungeprüfter `Origin`/`Host`-Header bei Einladungs-URLs & ältere Blacklist in `download_backup` | **3/3 unter `I-6` & `I-8` konsolidiert & getestet** |
| **Audit #8 (Follow-up)** | 2026-11-08 | 2 Findings (`I-1` bis `I-8` hielten zu 100 % ohne Regression; 0 Must-fix; verbleibend: Keyring-IPC-Namespace-Isolierung auf `de.gradus21.*` in `src-tauri`, automatisches Pruning abgelaufener TOTP-Steps in `LAST_USED_TOTP_STEP` ab 2048 Einträgen) | Fehlende Service-Namensprüfung im Desktop-Keyring-Wrapper | **2/2 unter `I-7` konsolidiert & getestet** |
| **Audit #9 (Finaler Verifikations-Audit)** | 2026-11-08 | **0 Findings** (`0` Must-fix, `0` Should-fix, `0` Nice-to-have; alle 8 Architektur-Invarianten `I-1` bis `I-8` halten zu 100 % ohne Regression) | — | **Vollständig abgenommen (Clean Sign-Off)** |
| **Audit #10 (Ponytail Quality Audit & Release 26.11.3)** | 2026-11-09 | 9 Findings (Intelligenter Merge Vorrang lokaler Daten, Reconciliation Dialog-Loop & Cache-Sync, Noten-Exporte über alle Eingabemodi, 0% Gewicht für leere Kategorien bei Skalierung, Summary-gestützte Hintergrund-Sync-Bandbreitenreduktion, Bereinigung toter `storageAdapter`, Drop-Lowest-Simulator) | Lokale Precedence-Inversion beim Merge, fehlender Summary-Vorabcheck beim Polling, Notenfilter beschränkte sich auf `percent_value` | **9/9 behoben, Invarianten I-3/I-5 gehärtet, 204 Web- & 43 Rust-Tests grün** |
| **Audit #11 (Client Timeout Hardening & DoT/Hairpin Resilienz)** | 2026-11-09 | 1 Finding (Fehlende Request-Timeouts in Client-API-Calls führten bei WLAN NAT-Hairpin-/DoT-Drops zu 120s Polling-Locks) | Unbounded `fetch()`-Calls in `useVaultWorkspaceSync.ts` und Auth-Modals | **Behoben via `fetchWithTimeout(..., 8000)`, Invariante I-8 erweitert, 207 Web- & 43 Rust-Tests grün** |
| **Audit #12 (Reconciliation Cache Poisoning Fix)** | 2026-11-09 | 1 Finding (Intelligenter Merge überschrieb lokale Änderungen im Cache mit altem Server-Ciphertext `remoteEnv.encrypted_payload`) | Falscher Fallback im Cache-Update von `executeReconciliation` | **Behoben: Fresh DEK-Encryption bei `merge` & `upload_local`, Invariante I-5 gehärtet, 208 Web-Tests grün** |
