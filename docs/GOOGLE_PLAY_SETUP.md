# 🤖 Google Play Console & Automated CI/CD Setup Guide (AAB & Play Publishing API)

Dieses Dokument beschreibt die Einrichtung und Funktionsweise des **Android Release- und Deployment-Prozesses** für Gradus21 auf GitHub Actions (`ubuntu-latest` Runner).

Die App wird als **Android App Bundle (`.aab`)** und signiertes **`.apk`** gebaut. Die Identität im Google Play Store lautet:
- **Paketname / ApplicationId:** `de.gradus21.app`
- **Tauri Bundle Identifier:** `de.gradus21.app`
- **Lizenz:** MIT (Open Source)
- **Mindest-Zielversion:** Android 14+ (API 34/35)

---

## ⚠️ 1. Wichtige Besonderheit: Die Erstübermittlung (First Upload)

> [!IMPORTANT]
> **Google Play API-Sicherheitsregel:**  
> Die Google Play Developer Publishing API erlaubt **keinen erstmaligen Upload** einer neuen App.  
> Bevor GitHub Actions zukünftige Releases vollautomatisch per API publizieren kann, **muss die allererste `.aab`-Datei einmalig manuell über die Web-Oberfläche der Google Play Console hochgeladen werden**, um das Bundle und Play App Signing zu initialisieren.

### Schritt für die Erstübermittlung:
1. Das fertige, bereits kryptografisch signierte Bundle `gradus21.aab` herunterladen:
   - Direkt aus den Assets des neuesten GitHub Releases (z. B. `v1.2.10`):  
     `https://github.com/gradus21/gradus21/releases/latest/download/gradus21.aab`
   - Oder per CLI:
     ```bash
     gh release download v1.2.10 -p "gradus21.aab" -R gradus21/gradus21
     ```
2. In der [Google Play Console](https://play.google.com/console) einloggen:
   - Auf **App erstellen** klicken.
   - **Name:** `Gradus21`
   - **Standard-Sprache:** Deutsch (de-DE)
   - **Typ:** App
   - **Kostenlos / Kostenpflichtig:** Kostenlos
   - **Erklärungen:** Entwicklerprogrammrichtlinien und US-Exportbestimmungen akzeptieren.
3. **Play App Signing einrichten:**
   - Wählen Sie die empfohlene Option: *„Von Google generierten App-Signaturschlüssel verwenden“*.
   - Ihr vorhandener GitHub Actions Keystore dient als **Upload-Schlüssel**.
4. **Ersten Release im Test-Track anlegen:**
   - Navigieren Sie zu **Testen > Interner Test** (oder *Geschlossener Test*).
   - Klicken Sie auf **Neuen Release erstellen**.
   - Ziehen Sie die heruntergeladene Datei `gradus21.aab` per Drag & Drop in das Upload-Feld.
   - Release-Name (z. B. `1.2.10`) eingeben und speichern.
5. **App-Inhalte & Fragebögen abschließen:**
   - **Datenschutzerklärung:** `https://gradus21.de/datenschutz.html`
   - **Zielgruppe:** Strikt **„18 Jahre und älter“** wählen; Frage *„Spricht die App unbeabsichtigt Kinder an?“* mit **„Nein“** beantworten.
   - **Datensicherheit (Data Safety):** Angeben, dass Daten bei der Übertragung verschlüsselt sind (HTTPS/TLS) und Konten gelöscht werden können.
   - **Web-Link zur Kontolöschung:** `https://gradus21.de` oder Kontaktseite hinterlegen.

Sobald dieser erste manuelle Schritt abgeschlossen ist, ist die App-ID `de.gradus21.app` im Play Store registriert.

---

## 🔑 2. GitHub Secrets für den Android-Build

In Ihrem GitHub Repository `gradus21/gradus21` sind folgende Secrets für den Signaturprozess bereits hinterlegt:

| Secret | Zweck | Status |
|---|---|:---:|
| `ANDROID_KEYSTORE_BASE64` | Base64-codierter Upload-Keystore (`gradus21-upload.keystore`) | ✅ Konfiguriert |
| `ANDROID_KEYSTORE_PASSWORD` | Passwort des Keystores & Schlüsselpasswort | ✅ Konfiguriert |
| `ANDROID_KEY_ALIAS` | Alias des Upload-Schlüssels im Keystore | ✅ Konfiguriert |

---

## 🚀 3. Vollautomatisches Deployment via GitHub Actions (CI/CD)

Um künftige Versionen (`v*` Tags) nach dem ersten Release vollautomatisch aus GitHub in die Play Console zu pushen:

### A. Google Cloud Dienstkonto (Service Account) anlegen
1. In der [Google Play Console](https://play.google.com/console) links im Menü auf **API-Zugriff** (*API access*) klicken.
2. Ein Google Cloud-Projekt verknüpfen (oder neu erstellen).
3. Auf **Neues Dienstkonto erstellen** klicken und dem Link zur *Google Cloud Console* folgen.
4. Dienstkonto benennen (z. B. `github-actions-play-publisher`).
5. Unter **Schlüssel** (Keys) > **Schlüssel hinzufügen** > **JSON** wählen und die Datei herunterladen.
6. Zurück in die Google Play Console wechseln:
   - Unter *API-Zugriff* bei dem neuen Dienstkonto auf **Zugriff gewähren** klicken.
   - Berechtigungen: Rolle **Releases verwalten** für `de.gradus21.app` zuweisen (für den Track *Interner Test*, *Offener Test* oder *Produktion*).

### B. Service-Account JSON in GitHub Secrets eintragen
Im GitHub-Repository unter **Settings > Secrets and variables > Actions**:
- **Name:** `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
- **Wert:** Den gesamten Inhalt der heruntergeladenen JSON-Datei einfügen.

### C. Workflow-Schritt in `.github/workflows/android-release.yml`
Fügen Sie am Ende des Workflows folgenden Schritt hinzu (nutzt die offizielle Action `r0adkll/upload-google-play`):

```yaml
      - name: Deploy to Google Play Console
        if: startsWith(github.ref, 'refs/tags/v') && env.PLAY_SECRET != ''
        env:
          PLAY_SECRET: ${{ secrets.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON }}
        uses: r0adkll/upload-google-play@v1
        with:
          serviceAccountJsonPlainText: ${{ secrets.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON }}
          packageName: de.gradus21.app
          releaseFiles: dist-android/gradus21.aab
          track: internal # oder 'production' / 'beta'
          status: completed
```
