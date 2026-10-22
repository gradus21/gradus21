# 🍎 Apple Developer & Headless CI/CD Setup Guide (iOS, iPadOS & macOS)

Dieses Dokument beschreibt die Einrichtung und Funktionsweise des vollständig automatisierten, **headless Build- und Release-Prozesses** für Gradus21 auf GitHub Actions (`macos-14` Apple Silicon Runner).

Da der Entwicklungsrechner auf Linux (Pop!_OS 24.04 LTS) läuft, werden **keine lokalen Macs oder Xcode-Installationen benötigt**. Alle Builds, Signierungen, Notarisierungen und TestFlight-Uploads finden isoliert und kryptografisch geschützt in der GitHub Actions CI/CD-Pipeline statt.

---

## 🔒 1. Sicherheitsarchitektur & Zertifikate

- **Private Keys verbleiben strikt geheim:** Weder `.p8`-API-Keys noch `.p12`-Zertifikate oder Passwörter werden jemals in das Git-Repository eingecheckt.
- **GitHub Secrets Isolation:** GitHub Actions Secrets sind verschlüsselt und für Forks oder externe Pull Requests unzugänglich.
- **Zero-Trust Signierung:** Der GitHub Actions Runner importiert das Zertifikat temporär in eine flüchtige macOS-Keychain (`build.keychain`), signiert das Binary und löscht die Keychain nach Abschluss des Jobs unwiderruflich.

---

## 🔑 2. Benötigte GitHub Repository Secrets

Gehe in deinem GitHub-Repository auf:  
👉 **Settings** ➔ **Secrets and variables** ➔ **Actions** ➔ **New repository secret**

| Secret Name | Beschreibung | Beispiel / Format |
|---|---|---|
| `APP_STORE_CONNECT_API_KEY_P8` | Privater API-Schlüssel (.p8) von App Store Connect | `-----BEGIN PRIVATE KEY-----\nMIGTAgEAMBMG...` |
| `APP_STORE_CONNECT_KEY_ID` | Die 10-stellige Key-ID des API-Schlüssels | z. B. `2X9R4HXF34` |
| `APP_STORE_CONNECT_ISSUER_ID` | Die Issuer-UUID deines Apple Developer Accounts | z. B. `57246542-96fe-1a63-e053-0824d011072a` |
| `APPLE_CERTIFICATE_P12` | Apple Distribution Zertifikat (.p12) als Base64-String | `cat cert.p12 \| base64 -w 0` |
| `APPLE_CERTIFICATE_PASSWORD` | Das Passwort, mit dem die .p12-Datei geschützt ist | z. B. `MeinSicheresPasswort123!` |
| `APPLE_PROVISIONING_PROFILE` | iOS/iPadOS App Store / TestFlight Provisioning Profile als Base64 | `cat Gradus21.mobileprovision \| base64 -w 0` |

---

## 🚀 3. Schritt-für-Schritt: Secrets in App Store Connect generieren

### Schritt A: App Store Connect API Key (.p8) erstellen
1. Logge dich auf [developer.apple.com](https://developer.apple.com) ein und wechsle zu [appstoreconnect.apple.com](https://appstoreconnect.apple.com).
2. Klicke auf **Benutzer und Zugriffsrechte** (Users and Access) ➔ Tab **Integrationen** / **Schlüssel** (Keys).
3. Klicke auf das blaue Plus-Symbol `(+)`, um einen neuen API-Schlüssel zu erstellen:
   - **Name:** `Gradus21 CI/CD Automation`
   - **Zugriffsebene (Access):** `App Manager` oder `Admin` (erforderlich für TestFlight-Uploads).
4. Nach dem Erstellen siehst du:
   - Die **Issuer-ID** (oben auf der Seite) ➔ als Secret `APP_STORE_CONNECT_ISSUER_ID` eintragen.
   - Die **Schlüssel-ID** (Key ID in der Tabelle) ➔ als Secret `APP_STORE_CONNECT_KEY_ID` eintragen.
   - Den Download-Button für `AuthKey_XXXXXX.p8` (Achtung: Kann **nur einmalig** heruntergeladen werden!) ➔ Inhalt kopieren und als `APP_STORE_CONNECT_API_KEY_P8` eintragen.

### Schritt B: Distributions-Zertifikat (.p12) und Provisioning Profile
1. Falls noch nicht vorhanden, erstelle im Apple Developer Portal unter **Certificates, Identifiers & Profiles**:
   - **Identifier:** `de.gradus21.app` (App ID mit Push Notifications / Capabilities nach Bedarf).
   - **Certificate:** `Apple Distribution` (gilt für iOS, iPadOS und macOS).
   - **Profile:** `App Store Connect` Distribution Profile für `de.gradus21.app`.
2. Wandle das Zertifikat in Base64 um:
   ```bash
   base64 -w 0 distribution.p12 > cert_base64.txt
   base64 -w 0 Gradus21.mobileprovision > profile_base64.txt
   ```
3. Kopiere die Strings in die GitHub Secrets `APPLE_CERTIFICATE_P12` und `APPLE_PROVISIONING_PROFILE`.

---

## 🛠️ 4. Auslösen eines Apple Releases

Der Workflow `.github/workflows/apple-release.yml` wird automatisch ausgelöst bei:
1. **Push auf Release-Tags:** z. B. `git tag v1.2.4 && git push origin v1.2.4`
2. **Manuell (Workflow Dispatch):** Im GitHub Actions Reiter unter **Apple Multiplatform Release** kann der Workflow jederzeit per Knopfdruck für Test-Uploads nach TestFlight gestartet werden.
