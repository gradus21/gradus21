# Changelog

All notable changes to **Gradus21** are documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/).

## [1.2.14] - 2026-10-29

### Fix KDF Parameter Backwards Compatibility for Vault Unlock
- **Rückwärtskompatibilität für KDF-Parameter (Argon2id)**:
  - Behebung des Entschlüsselungsfehlers (`missing field 'memory_kib' at line 1 column 38`) beim Entsperren des Tresors auf Android und anderen Clients.
  - Rust Core (`crates/gradus21-core`): Serde-Aliasse (`#[serde(alias = "m_cost")]`, `#[serde(alias = "t_cost")]`, `#[serde(alias = "p_cost")]`) für `KdfParams` hinzugefügt, sodass bestehende lokale Tresore mit Legacy-Parametern nahtlos deserialisiert werden.
  - Web & Clients: `normalizeKdfParams`-Hilfsfunktion zur deterministischen Normalisierung von Legacy- und Standard-Parametern sowie JSON-Strings vor Übergabe an das WASM-Modul und beim Speichern im lokalen Cache.
  - Standardisierung aller Default-Fallbacks auf standardkonforme OWASP-Empfehlungen (`{ memory_kib: 19456, iterations: 2, parallelism: 1 }`).

## [1.2.13] - 2026-10-29

### Local Offline Registration with Client-Side 2FA & Multi-Platform Keyring/Biometrics
- **Vollständig offline-fähige Registrierung ohne Cloud-Zwang**:
  - Zero-Knowledge Tresorerstellung läuft bei deaktivierter Cloud-Synchronisation (`!optInCloudSync`) zu 100 % lokal ab (0 Byte Netzwerk-Traffic, keine Telemetrie, keine Abhängigkeit von Server-Verfügbarkeit).
  - Clientseitige Generierung des 2-Faktor-Authentifizierungs-Geheimnisses (RFC 6238 TOTP) mit 160 Bit kryptografischer Entropie (`crypto.getRandomValues(new Uint8Array(20))`) und sofortige Generierung des QR-Codes für Authenticator-Apps (Aegis, 2FAS, Google Authenticator).
  - Offline-Verifizierung des Bestätigungscodes direkt im Browser/Client via WebCrypto HMAC-SHA-1 mit Drift-Toleranz.
- **Plattform-native Hardware-Verankerung im Registrierungs-Wizard (Schritt 3)**:
  - **Linux Desktop (FreeDesktop Secret Service & fprintd)**:
    - Sicherung des Tresor-Hauptschlüssels (DEK) im systemeigenen Linux-Schlüsselbund (GNOME Keyring / KWallet via DBus) über das native Tauri-Modul `keyring_auth`.
    - Unterstützung für System-Entsperrung bei Desktop-Login sowie Fingerabdruck-Sensorik (`fprintd`).
    - CISO-Sicherheitshinweis im Wizard: Aufklärung über die Abhängigkeit vom Benutzer-Session-Schutz und ausdrückliche Empfehlung einer Festplattenverschlüsselung (LUKS / dm-crypt).
  - **Android (Android Keystore StrongBox / TEE)**:
    - Direkte Aktivierung der Hardware-Biometrie (Fingerabdruck / Face ID) im Registrierungsschritt via `@tauri-apps/plugin-biometric` mit AES-256-GCM und striktem PIN-Bypass-Ausschluss (`allowDeviceCredential: false`).
  - **Apple macOS / iOS (Secure Enclave & Keychain)**:
    - Hardware-gebundene Touch ID- und Face ID-Aktivierung im Apple Keychain.
  - **Web-Browser**:
    - WebAuthn PRF-Extension für browser-interne Hardware-Schlüsselableitung.
- **Intelligente Login-Erkennung & Speicherort-Transparenz**:
  - Proaktive 2FA-Code-Abfrage beim lokalen Offline-Tresor-Login anhand des gecachten Headers vor Ausführung der rechenintensiven Argon2id-Entschlüsselung.
  - Detaillierte Anzeige des lokalen Speicherpfads (`~/.local/share/de.gradus21.app/` unter Linux, `%APPDATA%` unter Windows, `~/Library/Application Support` unter macOS) samt Kopier-Button und angepasster Belehrung für native Apps.

## [1.2.12] - 2026-10-29

### Native In-App Biometric Authentication (Android Keystore / BiometricPrompt)
- **Nativer Hardware-Biometrie-Prompt direkt in der Android-App (`@tauri-apps/plugin-biometric`)**:
  - Implementierung einer nativen, hardwaregestützten Fingerabdruck- und Face-ID-Entsperrung für Android, sodass Lehrkräfte die App direkt per Sensor berühren und entsperren können, ohne den Browser zu öffnen.
  - Der Tresor-Hauptschlüssel (DEK) wird im Hardware-Sicherheitschip des Android-Geräts (`AndroidKeyStore` StrongBox/TEE) per AES-256-GCM verschlüsselt (`biometricCipher`).
  - **Sicherheitsauflage 1 (PIN-Ausschluss)**: Striktes Erzwingen von `allowDeviceCredential: false`, wodurch ein Aushebeln der biometrischen Abfrage durch den allgemeinen Geräte-PIN/Muster ausgeschlossen ist.
  - **Sicherheitsauflage 2 (KeyStore-Invalidierung)**: Bei Änderung oder Hinzufügen von biometrischen Daten in den Android-Systemeinstellungen invalidiert der Android-KeyStore den Schlüssel automatisch (`KeyPermanentlyInvalidatedException`). Die App erkennt dies, setzt den biometrischen Schnellzugriff zurück und verlangt zur erneuten Autorisierung die einmalige Eingabe des Master-Passworts.
  - **Sicherheitsauflage 3 (Root of Trust)**: Das Master-Passwort bleibt das kryptografische Fundament; der Biometrie-Slot dient als lokaler Hardware-Beschleuniger für die native App.
- **Intuitiver Entsperr- und Einrichtungs-Flow**:
  - Bei aktiver biometrischer Einrichtung auf dem gesperrten Bildschirm erscheint ein prominenter primärer Button „Mit Fingerabdruck entsperren“ (bzw. Face ID), der bei App-Start automatisch per BiometricPrompt aufgerufen werden kann.
  - Nach Erstanmeldung mit Master-Passwort oder Browser-Passkey kann die biometrische Entsperrung mit einem Klick aktiviert werden.
  - Dedizierte Statuskarte in den Einstellungen (`SettingsModal` -> Datenschutz & Speicher) zum bequemen Aktivieren oder Deaktivieren der Biometrie.
  - Vollständiger Erhalt des Browser-Passkey-Flows als alternative Anmeldeoption auf allen Plattformen.

## [1.2.11] - 2026-10-29

### Android Passkey Authentication & Resilient Dual-Channel Auth Relay
- **Sichere Passkey-Anmeldung für Android-Apps (RFC 8628 / Zero-Knowledge Relay)**:
  - Behebung des Problems, dass Passkeys in der nativen Android-App aufgrund der W3C WebAuthn Origin-Isolation in der Android-WebView (`http://tauri.localhost` vs. `gradus21.de`) fehlschlugen.
  - Aktivierung des sicheren System-Browser-Flows (`startDesktopBrowserAuth`) auf Android via `tauri-plugin-opener`, womit die biometrische Authentifizierung nahtlos über den System-Standardbrowser (Chrome / Google Passwortmanager) ausgeführt wird.
  - Entfernung der `#[cfg(desktop)]`-Beschränkung in `src-tauri/src/browser_auth.rs`, sodass mobile Plattformen den Browser-Handshake nativ ansteuern können.
  - Fehlertolerante Kapselung des lokalen Loopback-Sockets: Falls Android-Sandboxes Loopback-Sockets (`127.0.0.1`) sperren, bricht der Vorgang nicht mehr ab, sondern nutzt unterbrechungsfrei das Server-Relais.
- **Dual-Channel Übertragungs-Resilienz (`Promise.any`)**:
  - Härtung der parallelen Übertragungskanäle (Loopback-Socket und Server-Relais) via `Promise.any` im Frontend (`desktopAuth.ts`). Verbindungsabbrüche des Loopback-Listeners auf Mobilgeräten führen nicht mehr zum vorzeitigen Abbruch des Server-Relay-Pollings.
- **Plattform-Weiche & UI-Klarheit**:
  - Korrektur der Plattform-Weiche in `VaultLockAndAuthModal.tsx` von `isDesktopTauri()` auf `isTauri()`, damit alle nativen Apps den optimierten Browser-Passkey-Flow nutzen.
  - Harmonische Textmeldungen („App erfolgreich entsperrt“) für Desktop und mobile Endgeräte.
  - Klarer Schutzhinweis bei versuchter Passkey-Neuregistrierung in der nativen App mit Verweis auf die Registrierung im Web-Browser.
- **Nutzungsbedingungen (Terms of Service)**:
  - Konkretisierung der Altersgrenze (ab 18 Jahren) gemäß den Google Play Console Richtlinien für Bildungs-Apps.

## [1.2.10] - 2026-10-28

### Desktop Auto-Updater Integration & Multiplatform Manifest Delivery
- **In-App Auto-Update Benachrichtigung und manuelle Prüfung**:
  - Automatischer Update-Check beim Start der Desktop-App via `tauri-plugin-updater` mit dezentem Benachrichtigungs-Banner (`UpdateNotificationBanner`) direkt unter dem App-Header.
  - Dedizierte Statuskarte im Einstellungs-Dialog (`SettingsModal`) mit Anzeige der aktuellen Version, Button "Nach Updates suchen", Fortschrittsbalken beim Download und Hinweisen für Linux-Installationen (.deb vs. AppImage).
- **Automatisierte Erzeugung und Verteilung von `latest.json` im Release-Prozess**:
  - Aktivierung von `bundle.createUpdaterArtifacts: true` in `src-tauri/tauri.conf.json`, damit Tauri v2 bei Builds die signierten Update-Archive (`.tar.gz`, `.nsis.zip`) und Minisign-Signaturen (`.sig`) generiert.
  - Neues Automatisierungs-Skript `scripts/update-updater-manifest.mjs`, das nach Abschluss der CI/CD-Jobs (Linux, Windows, macOS) die plattformspezifischen Signaturen aggregiert und `latest.json` im GitHub-Release veröffentlicht und aktualisiert.
  - Erweiterung von `.github/workflows/desktop-release.yml` und `apple-release.yml` um den Upload von Updater-Archiven (`*.tar.gz*`, `*.zip*`) und den automatischen Manifest-Upload.

- **Offizielles Linux APT-Repository (GitHub Pages)**:
  - Vollständiges Debian/Ubuntu/Pop!_OS APT-Repository auf `https://gradus21.github.io/gradus21/` mit kryptografischer GPG-Signierung (`InRelease`, `Release.gpg`), `Packages.gz` und Landing-Page.
  - Automatisierte Verteilung neuer `.deb`-Versionen über GitHub Actions via `scripts/build-apt-repo.sh` und `scripts/deploy-apt-repo.sh`.
  - Nahtlose System-Aktualisierung für Linux-Benutzer direkt über `sudo apt update && sudo apt upgrade`.

## [1.2.9] - 2026-10-28

### Security Hardening & Dynamic Passkey RP Configuration
- **Klartext-Schutz für PRF-Passkeys & Plattform-sensitives Fallback**:
  - Auf Hardware-PRF-fähigen Systemen (Desktop, Android, moderne Browser) wird beim Master-Passwort-Login strikt verhindert, dass unverschlüsselte Geräte-Schlüssel (`passkeySecretB64`) im HTML5-`localStorage` abgelegt werden. Der Zero-Knowledge-Schutz im Sicherheitschip bleibt vollständig erhalten.
  - Geräte ohne PRF (wie native iOS/iPadOS WKWebViews) erhalten weiterhin gezielt ihren lokalen Fallback-Schlüssel, werden jedoch lokal explizit als non-PRF markiert (`prfSupported: false`).
- **Backend Härtung für WebAuthn Discoverable Credentials & Rate-Limiting**:
  - `POST /api/auth/passkey/login/start` ohne E-Mail-Angabe gibt nun standardmäßig ein leeres `allowCredentials`-Array (`&[]`) zurück, anstatt die Credential-IDs aller Benutzer im System preiszugeben.
  - Implementierung eines globalen Rate-Limitings für usernameless Passkey-Login-Aufrufe (`passkey_start:discoverable`).
  - Strikte Validierung der erwarteten Benutzer-ID (`expected_user_id`) in `passkey_login_finish`, um Mismatches zwischen aufgerufenem Account und vorgelegtem Passkey abzuweisen.
  - Nur kryptografisch durch den WebAuthn-Challenge-Handshake verifizierte Credential-IDs werden mit Benutzerkonten in der Datenbank abgeglichen.
- **Bereinigung und dynamische Docker-Konfiguration von WebAuthn RP Origins**:
  - Unverschlüsselte HTTP-Localhost-Origins werden in `create_webauthn()` in Produktionsumgebungen standardmäßig nicht mehr als vertrauenswürdige RP-Origins registriert.
  - Dynamische Erzeugung der Endpunkte `/.well-known/webauthn` anhand der Umgebungsvariablen `WEBAUTHN_RP_ORIGIN` und `WEBAUTHN_ALLOWED_ORIGINS` für vollkommen flexible Self-Hosting-Deployments (Docker/MDM/Schulen).

## [1.2.8] - 2026-10-28

### Native iOS Passkey & Cross-Device Decryption Fixes
- **Behebung der Passkey-Entschlüsselungsschleife auf Nicht-PRF-Geräten (iOS / WebKit / Softkeys)**:
  - Bei Passkey-Authentifizierung ohne hardwareseitige PRF-Extension (wie unter Apple iOS WKWebView / Keychain) wird für die DEK-Entschlüsselung nun prioritär der lokal mit dem Geräteschlüssel verpackte Tresorschlüssel (`localEntry.passkeyEncryptedDek`) verwendet. Zuvor überschrieb der Server-Ciphertext (der von einem anderen Gerät verschlüsselt wurde) den lokalen Schlüssel, wodurch die Entschlüsselung trotz erfolgreicher biometrischer Authentifizierung scheiterte und immer wieder nach dem Master-Passwort verlangte.
  - Implementierung eines mehrstufigen Kandidaten- und Encoding-Fallback-Verfahrens (Base64 / Base64URL) für `wasm_unwrap_dek_with_passkey`.
  - Exakte Zuordnung des lokalen Passkey-Eintrags anhand der vom Authenticator nach der Assertion zurückgegebenen `credentialId`.
  - Universelles lokales DEK-Wrapping beim Master-Passwort-Login auch bei serverseitigen PRF-Schlüsseln, um plattformunabhängige Entsperrung auf Nicht-PRF-Geräten zu garantieren.
- **Registrierung nativer Tauri-Origins für WebAuthn RP**:
  - Automatische Validierung nativer App-Schemes (`tauri://localhost`, `tauri://localhost/`, `https://tauri.localhost` etc.) im Rust-Backend (`create_webauthn`), um Origin-Mismatch-Fehler in mobilen WebViews zu verhindern.

## [1.2.7] - 2026-10-27

### Zero-Knowledge Passkey Resilience & Error Diagnostics
- **Behebung des `ReferenceError` bei Passkey-Wrapping (`unlocked.dek_b64`)**:
  - Korrektur einer Variablenreferenz (`unwrapped.dek_b64` -> `unlocked.dek_b64`) bei der Ableitung und Speicherung des lokalen Geräte-Passkeys im `VaultLockAndAuthModal`. Dies verhinderte, dass Benutzer nach erfolgreicher Passworteingabe irrtümlich mit *"Das eingegebene Passwort stimmt leider nicht"* abgewiesen wurden.
- **Präzise Fehlerdiagnostik im Tresor- und Authentifizierungs-Modal**:
  - Differenzierte Fehleranzeige bei echten Initialisierungs-, WASM- oder Netzwerkfehlern anstelle pauschaler Fehlermeldungen bei Passkey-Entsperrung und Passwort-Login.
- **Type-Check-Absicherung der Web-Builds**:
  - `npm run build` und `npm run build:client` führen vor dem Vite-Bundling nun strikt `tsc -b` aus.

## [1.2.6] - 2026-10-27

### iOS Native Passkey & WASM Engine Hardening
- **iOS Associated Domains & Passkey-Entitlements (`Entitlements.plist`)**:
  - Konfiguration von `com.apple.developer.associated-domains` mit `webcredentials:gradus21.app` in `src-tauri/Entitlements.plist` und Einbindung in `tauri.conf.json` (`bundle.iOS.entitlements`). Dies autorisiert die native WKWebView für WebAuthn RP-ID `gradus21.app` passend zum App Store Distribution Provisioning Profile und behebt die Fehlermeldung *"The origin of the document is not authorized for the provided RP ID"*.
- **Robuster Cross-Platform WASM-Loader (`ensureWasmLoaded`)**:
  - Implementierung eines universellen WebAssembly-Loaders mit direktem `ArrayBuffer`-Fallback für mobile WebViews. Beseitigt `TypeError`-Abbrüche bei `WebAssembly.instantiateStreaming` unter `tauri://`-Custom-Schemes auf iOS und stellt sicher, dass die kryptografische Engine vor Entschlüsselungsaufrufen initialisiert ist.
- **Transparente Fehlerdiagnose im Login-Modal**:
  - Bei Fehlschlägen der lokalen Entschlüsselung werden echte WASM- bzw. Initialisierungsfehler transparent angezeigt, anstatt sie blind als falsches Passwort zu deklarieren.

## [1.2.5] - 2026-10-27
- **Deterministische Server-URL-Auflösung (`getServerUrl`)**:
  - Standalone-Clients (wie iOS WKWebView oder Tauri Desktop) leiten API-Anfragen nicht mehr fehlerhaft an lokale Hostnamen (`localhost`, `127.0.0.1`, `tauri`) weiter, sondern greifen zuverlässig auf die Produktivumgebung `https://gradus21.app` zu.
- **Zero-Knowledge Fehlerdiagnose & Netzwerk-Transparenz**:
  - Behebt ein Problem im `VaultLockAndAuthModal`, bei dem Verbindungsabbrüche beim KDF-Salt-Abruf oder WASM-Fehler auf Neugeräten irrtümlich als *"Das eingegebene Passwort stimmt leider nicht"* gemeldet wurden. Bei Nichterreichbarkeit des Servers oder internen Fehlern wird nun die tatsächliche Ursache verständlich ausgewiesen.
- **iOS & Mobile Tastatur-Sanitisierung**:
  - Deaktivierung von `autoCapitalize`, `autoCorrect` und `spellCheck` bei E-Mail- und Passwort-Eingaben zur Vermeidung stiller iOS-Tastaturverfälschungen. E-Mail-Adressen werden vor der KDF-Ableitung deterministisch getrimmt und kleingeschrieben.
  - Standardisierung des Argon2id-KDF-Parameter-Fallbacks auf `{ memory_kib: 19456, iterations: 2, parallelism: 1 }`.

### Passkey & Apple App Site Association
- **Apple Associated Domains Support**:
  - Bereitstellung von `/.well-known/apple-app-site-association` mit `application/json` und `webcredentials`-Verknüpfung für App-ID `5X3CWU4583.de.gradus21.app`.
- **Benutzerführung bei WebAuthn-Restriktionen**:
  - Differenzierte Benutzerführung im Login-Dialog, falls das Betriebssystem WebAuthn in embedded WebViews einschränkt, inklusive direktem Hinweis auf Master-Passwort-Login oder Nutzung im Safari-Browser.

## [1.2.4] - 2026-10-26

### Desktop Passkey System-Browser Flow (RFC 8252)
- **Zero-Knowledge Loopback-Authentifizierung für Linux & Desktop-Clients**:
  - Implementierung eines flüchtigen, lokalen Loopback-HTTP-Servers (`127.0.0.1:0`) in Tauri für sichere Passkey-Authentifizierung.
  - Behebt die WebKitGTK-Einschränkung unter Linux, wo embedded WebViews keine native WebAuthn-Schnittstelle (`window.PublicKeyCredential`) bereitstellen: Erkennt automatisch nicht verfügbares lokales WebAuthn und delegiert den Login nahtlos an den Standardbrowser des Betriebssystems.
  - Volle Unterstützung für synchronisierte Plattform-Passkeys (Google Password Manager, 1Password, Bitwarden, iCloud Keychain, Smartphone via QR-Code) sowie Hardware-Sicherheitsschlüssel (FIDO2 / YubiKey) mit vollständiger WebAuthn PRF-Extension zur Ableitung des Tresorschlüssels.
  - Ende-zu-Ende-Transitverschlüsselung (AES-256-GCM) zwischen Browser und Desktop-App mit Einmal-Transitschlüssel im URL-Fragment (`#transit_key=...`), sodass sensible Schlüssel zu keinem Zeitpunkt Server-Logs oder die Prozessliste exponieren.
  - Automatischer Fensterfokus (`window.set_focus()`) nach erfolgreichem Login und ansprechende Erfolgsseite im Browser mit Option zum Schließen des Tabs.

### Web-Client & UI/UX Optimierungen
- **Desktop-Autorisierungsmodus im Tresor-Modal (`VaultLockAndAuthModal`)**:
  - Erkennt Desktop-Autorisierungsanfragen (`?desktop_auth=1`) und überträgt die entsperrte Session inklusive des via WASM entschlüsselten DEK automatisch an die Desktop-App.
  - Bereitstellung einer 1-Klick-Direktfreigabe für Benutzer, die im Browser bereits angemeldet sind (*„Desktop-App jetzt direkt entsperren“*).
  - Intelligenter Button in der Desktop-App: Zeigt bei fehlendem WebAuthn im WebView direkt *„Mit Passkey im Browser anmelden“* (inkl. Abbrechen-Option während des Wartezustands).

## [1.2.3] - 2026-10-26

### Multiplattform Native Clients & Tauri v2 Scaffolding
- **Native Desktop- & Tablet-Clients (Tauri v2 Architecture)**:
  - Vollständiges Scaffolding und Multiplatform-Packaging für **Windows** (`.exe` NSIS-Setup, `.msi` Schul-IT Silent-Installer & `.msix` Store-Paket), **macOS** (Universal `.dmg` mit nativer Unterstützung für Apple Silicon M1–M4 & Intel Core), **Linux** (`.deb` für Debian/Ubuntu & `.AppImage` Universal-Binary), **Apple iPadOS & iOS** (Xcode-Projekt & TestFlight-Integration) sowie **Android** (`.apk` & `.aab` für Tablets & Google Play).
  - Neuer Standalone-Client-Modus (`VITE_STANDALONE_CLIENT`) mit austauschbarem Storage-Adapter für native Dateisysteme/SQLite und Admin-Code-Splitting.
  - In-App Auto-Updater mit kryptografischer Minisign-Signaturprüfung (`dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWdu...`) und Linux GPG-Paketsignierung.
  - Einstellungsdialog um Server-URL-Konfiguration, Offline-2FA-TOTP und iOS-App-Icon-Generierung erweitert.

### Sicherheits- & Infrastruktur-Hardening
- **Sichere Datenbank-Bindung (Docker)**:
  - PostgreSQL-Port in `docker-compose.yml` strikt an `127.0.0.1` gebunden (`127.0.0.1:5432:5432`), um versehentliche externe Exposition im Schulnetzwerk auszuschließen (schließt #36).
- **Session- & Account-Sicherheit**:
  - Deaktivierte Benutzerkonten werden in der Passwort-Wiederherstellung und in aktiven Sitzungen sofort und strikt blockiert (schließt #33).
- **Dependency- & Build-Aktualisierung**:
  - Vite 7 & Vitest Upgrades zur Behebung von Supply-Chain-Warnungen; Peer-Dependencies für `@vitejs/plugin-react` harmonisiert (schließt #34, #35).

### Bugfixes & PWA Mobile WebAuthn Resiliency
- **PWA WebAuthn & Passkey Biometrie-Unterstützung**:
  - Legacy Apple Meta-Tag `<meta name="apple-mobile-web-app-capable" content="yes" />` entfernt, wodurch iOS PWA-Installationen nicht mehr in den isolierten WebClip-Container gezwungen werden, sondern als vollwertige W3C Standalone Web-App mit vollem Zugriff auf WebAuthn und iCloud-Schlüsselbund agieren.
  - W3C Manifest (`manifest.json`) um kanonische `"id": "/"` erweitert, um deterministische PWA-Identität und Storage Partitioning über Installationen hinweg sicherzustellen.
- **Passkey Unlock & User-Activation Timeout Fix**:
  - Redundanten, asynchronen API-Aufruf (`fetch('/api/auth/salt')`) unmittelbar vor `navigator.credentials.get()` eliminiert. Verhindert das Verfallen der transienten Benutzerinteraktion (User Activation) auf mobilen Browsern und Standalone PWAs, was zuvor zu `NotAllowedError` führte.
  - Unterstützung für Discoverable Credentials (Usernameless Passkey Login) auf der Startseite: Authentifizierung kann nun auch ohne vorab eingetippte E-Mail initiiert werden, sofern der Passkey auf dem Gerät registriert ist.
  - Persistierung der letzten Login-E-Mail (`getLastLoginEmail` / `saveLastLoginEmail`) im lokalen Speicher, um bei erneutem Entsperren oder nach PWA-Neuinstallation sofort die korrekte Identität vorauszufüllen.
- **Automatischer Passkey-Cache-Sync im Zero-Knowledge Tresor**:
  - Beim regulären Passwort-Login im PWA-Modus werden servergespeicherte Passkey-Metadaten nun automatisch in den PWA-eigenen `localStorage` synchronisiert (`saveLocalPasskeyStoreEntry`), sodass nachfolgende Entsperrungen direkt biometrisch via Passkey erfolgen können.
  - Präzise Fehlerdifferenzierung: Unterscheidet explizit zwischen Benutzerabbruch (`AbortError` / Signal) und Berechtigungs-/Plattformauthentifikator-Fehlern (`NotAllowedError`).

### Versioning & Dokumentation
- Bumped workspace version across Cargo workspace, Web client, WASM bindings und Dokumentation auf `v1.2.3`.

## [1.2.2] - 2026-10-22

### Sicherheits- & Löschprüfungen (Context-Aware Delete Safety)
- **Kontextsensitive Bestätigungsmodale für Prüfungen (Assessments)**:
  - Direktes, unbestätigtes Löschen von Leistungsnachweisen und Prüfungen vollständig durch ein fokussiertes Sicherheitsmodal (`assessmentPendingDelete`) ersetzt.
  - Ermittelt dynamisch die Anzahl bereits gepflegter Noteneinträge (`raw_points`, `percent_value`, `direct_grade_value`, `comment`).
  - Zeigt bei vorhandenen Noten einen deutlichen Warnhinweis inklusive genauer Notenzahl an, um versehentlichen Datenverlust im Unterrichtsalltag unmissverständlich auszuschließen.
- **Kategorie-Löschschutz mit Noten- & Prüfungsprüfung (Grading Configurator & Class Management)**:
  - Sichere Bestätigungsdialoge beim Entfernen von Notenkategorien in `ClassManagementModal` und `GradingConfiguratorView`.
  - Prüft zugeordnete Prüfungen sowie bestehende Noteneinträge im Kontext und informiert transparent darüber, dass Prüfungen und Noten in eine verbleibende Fallback-Kategorie übertragen werden.
  - Verhindert das Entfernen der letzten verbleibenden Kategorie.
- **Klassen-Löschung mit Live-Datenmetriken**:
  - `confirmDeleteClass` um Live-Metriken-Badges erweitert (`X Schüler:innen`, `Y Prüfungen`, `Z Noteneinträge`).
  - Zeigt eine klare Warnmeldung mit Zusammenfassung des Umfangs vor der endgültigen Löschung einer Klasse an.
- **Vorlagen-Löschschutz**:
  - Eigene Notenvorlagen in `SettingsModal` verfügen nun über eine dedizierte Bestätigungsabfrage vor dem Entfernen.
- **Code-Qualität & Bereinigung**:
  - Unerreichbaren toten Code in `ClassMatrixView.tsx` (verwaistes `showNewAssessmentForm`-State und Formular-Markup) bereinigt.
  - Vollständige Testabdeckung in `ClassManagementModal.test.tsx` für alle Sicherheits- und Kontextprüfungen ergänzt (52 Tests erfolgreich).

### Versioning & Dokumentation
- Bumped workspace version across Cargo workspace, Web client, WASM bindings und Dokumentation auf `v1.2.2`.

## [1.2.1] - 2026-10-21

### Bugfixes & Synchronization Resiliency
- **Multi-Tenant Server Isolation & Zero-Knowledge Collision Fix**:
  - Implemented composite tenant isolation (`tenant_env_key(&owner_id, &envelope_id)`) across in-memory state, disk persistence (`data/vault_store.json`), and PostgreSQL (`PRIMARY KEY (owner_user_id, id)` with upsert).
  - Preserved canonical UUIDs as AAD context to guarantee client-side WASM authenticated decryption (`wasm_decrypt_envelope`) without mismatch.
  - Eliminated `403 Forbidden ("Zugriff verweigert")` errors occurring when multiple tenants save shared default templates (e.g. demo classes or singleton settings `00000000-0000-4000-8000-000000000002`).
  - Added unit test `test_singleton_settings_envelope_tenant_isolation_in_batch_sync` verifying multi-tenant isolation and OCC version incrementing.
- **Continuous Cloud-Sync Indicator & Debounced Autosave**:
  - Synchronized registration opt-in state so newly created accounts immediately enter the dashboard with active `Cloud-Sync (E2EE)` (`synced`) status without requiring manual page reload.
  - Resolved regression where any edit in grade matrix or classroom views caused the sync badge to drop to `Offline (Lokal)`.

### Legal Compliance & Transparency (DSGVO / GDPR)
- **Nutzungsbedingungen & Speicherhinweise**:
  - Introduced dedicated `TermsOfServiceModal` with structured terms covering zero-knowledge architecture, local-first storage, school deployment compliance, and intellectual property.
  - Introduced `StorageNoticeModal` detailing browser-side storage (IndexedDB / localStorage) and zero-knowledge encrypted cloud transit.
  - Added dynamic legal configuration (`legalConfig.ts`) with custom URL overrides (`VITE_TERMS_URL`, `VITE_PRIVACY_URL`, `VITE_IMPRINT_URL`) and integrated links in `AppHeader`, `SettingsModal`, `LegalModal`, and `VaultRegistrationWizard`.
  - Added comprehensive test suites (`TermsOfServiceModal.test.tsx`, `StorageNoticeModal.test.tsx`, `legalConfig.test.ts`, `VaultRegistrationWizard.test.tsx`).

### Versioning, Infrastructure & Documentation
- Migrated GitHub repository to the official `Gradus21` organization and updated Docker container registry image paths in `docker-compose.yml`.
- Bumped workspace version across Cargo workspace, Web client, WASM bindings, and architecture documentation to `v1.2.1`.

## [1.2.0] - 2026-10-21

### Mobile, iPad & Responsive Touch Experience
- **Adaptive Touch Target Architecture (WCAG & Apple HIG Compliance)**:
  - Enforced a minimum 44×44px interactive target size on coarse pointer devices (iPads, Android tablets, smartphones) while preserving compact layout density for table cells and indicator dots.
  - Excluded `.step-dot` and `.compact-touch` indicators from artificial dimension stretching to prevent distorted tour pagination dots.
- **Universal Mobile Icon Centering**:
  - Global CSS rule (`index.css`) and explicit Tailwind utility classes guaranteeing absolute horizontal and vertical centering (`inline-flex items-center justify-center`) for all icon-only buttons.
  - Responsive text collapse support: All buttons with label spans collapsing on smaller viewports (`hidden sm:inline`, `hidden md:inline`, `hidden lg:inline`, `hidden xl:inline`) maintain centered icon alignment.
  - Aligned modal close controls across `InteractiveDemoGuide`, `WelcomeGuideBanner`, `GuideChapterSelectModal`, `LegalModal`, `AdminModal`, `ExportConfigModal`, `EmailVerificationModal`, `ClassManagementModal`, and `SettingsModal`.
- **iOS Safari & Mobile Usability Hardening**:
  - Auto-zoom prevention: Input font sizes clamped to 16px on mobile viewports to prevent iOS Safari from zooming into the viewport on touch focus.
  - Instant decimal keypad (`inputMode="decimal"`) automatically engaged on touch devices for fast single-handed points and percentage grade entry.
  - Touch hover bypass (`@media (hover: none)`): Contextual actions (such as *o.B.* / without grade and student archive toggles) remain immediately accessible without hover requirements.
  - Native iOS safe-area support (`env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`) for iPhones with dynamic island and home indicator bars.

### CI/CD & Build Pipeline Hardening
- **Automated WASM Build Integration**:
  - Added automated `wasm-pack` compilation for `crates/gradus21-core` prior to `npm run build` in GitHub Actions CI workflow, preventing missing bundle artifacts in headless environments.

### Versioning & Documentation
- Bumped workspace version across Cargo workspace, Web client, WASM bindings, and architecture documentation to `v1.2.0`.

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
