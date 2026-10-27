# 🪟 Microsoft Store & Headless CI/CD Setup Guide (MSIX & Partner Center)

Dieses Dokument beschreibt die Einrichtung und Funktionsweise des automatisierten **MSIX Build- und Release-Prozesses** für Gradus21 auf GitHub Actions (`windows-latest` Runner).

Da der primäre Entwicklungsrechner auf Linux (Pop!_OS 24.04 LTS) läuft, werden **keine lokalen Windows-Installationen benötigt**. Alle MSIX-Paketierungen, Manifest-Generierungen und Store-Uploads finden vollständig isoliert und automatisiert in der GitHub Actions CI/CD-Pipeline statt.

---

## 🆔 1. Reservierte Produktidentität

Die Identitätsdaten deiner im Microsoft Partner Center reservierten App lauten:

| Parameter | Manifest-Feld | Wert für Gradus21 |
|---|---|---|
| **Paket-ID-Name** | `Package/Identity/Name` | `Gradus21.Gradus21` |
| **Herausgeber (Publisher)** | `Package/Identity/Publisher` | `CN=9AFE237C-D8CE-415B-AEB5-ED30444929CC` |
| **Herausgeber-Anzeigename** | `Package/Properties/PublisherDisplayName` | `Gradus21` |
| **Package Family Name (PFN)** | - | `Gradus21.Gradus21_z1621dewhhed0` |
| **Store ID / Product ID** | - | `9MTB3WRKMNDD` |
| **Store URL** | - | `https://apps.microsoft.com/detail/9MTB3WRKMNDD` |

Diese Identitätswerte sind standardmäßig in [`src-tauri/msix/package-msix.ps1`](file:///home/julian/coding/gradus21/src-tauri/msix/package-msix.ps1) und im Workflow hinterlegt.

---

## ⚠️ 2. Wichtige Besonderheit: Die Erstübermittlung (First Submission)

> [!IMPORTANT]
> **Microsoft Store Policy & API-Beschränkung:**  
> Die Microsoft Store Submission API erlaubt **keine Neuerstellung von Apps oder Erstübermittlungen**.  
> Bevor GitHub Actions Releases vollautomatisch per API publizieren kann, **muss die Erstübermittlung einmalig manuell im Partner Center Dashboard abgeschlossen werden**.

### Schritt für die Erstübermittlung:
1. Triggere den GitHub Actions Workflow `Desktop Multiplatform Release (Linux & Windows)` (siehe unten).
2. Lade nach Abschluss des Builds das fertige Paket `gradus21.msix` aus den GitHub Release Assets oder den Workflow Artifacts herunter.
3. Öffne im [Microsoft Partner Center](https://partner.microsoft.com/dashboard) deine reservierte App **Gradus21**.
4. Klicke auf **Übermittlung starten** (Start submission) und fülle die Pflichtbereiche aus:
   - **Preise und Verfügbarkeit** (Pricing & availability: Kostenlos)
   - **Eigenschaften** (Kategorie: Bildung / Education, Datenschutzerklärung: `https://gradus21.de/datenschutz`)
   - **Altersfreigaben** (IARC-Fragebogen ausfüllen, dauert ca. 2 Minuten)
   - **Store-Einträge** (Beschreibung, Icons/Screenshots)
   - **Pakete** (Packages): Ziehe hier einfach deine heruntergeladene Datei `gradus21.msix` per Drag & Drop hinein!
5. Klicke auf **Zur Zertifizierung einreichen**.

Sobald diese erste Version von Microsoft zertifiziert ist, greift für alle weiteren Versionen die vollständige CI/CD-Vollautomatisierung.

---

## 🔑 3. Benötigte GitHub Secrets für die Vollautomatisierung

Sobald die Erstübermittlung aktiv ist, kann die GitHub Actions Pipeline jedes Release über das offizielle **Microsoft Store Developer CLI (`msstore`)** vollautomatisch hochladen und zur Zertifizierung einreichen.

Gehe in deinem GitHub-Repository auf:  
👉 **Settings** ➔ **Secrets and variables** ➔ **Actions** ➔ **New repository secret**

| Secret Name | Beschreibung | Beispiel / Herkunft |
|---|---|---|
| `MS_STORE_TENANT_ID` | Azure Active Directory / Entra Tenant ID | z. B. `72f988bf-86f1-41af-91ab-2d7cd011db47` |
| `MS_STORE_CLIENT_ID` | App-Registrierung / Service Principal Client ID | z. B. `4a123456-789a-bcde-f012-3456789abcde` |
| `MS_STORE_CLIENT_SECRET` | Client Secret / geheimer Schlüssel der App | z. B. `abc12~DEF...` |
| `MS_STORE_SELLER_ID` | *(Optional)* Seller ID / Verkäufer-ID | zu finden im Partner Center Account |

### Schritt-für-Schritt: Azure AD App für Partner Center erstellen
1. Logge dich im [Microsoft Partner Center](https://partner.microsoft.com/dashboard) ein.
2. Gehe auf das Zahnrad ⚙️ (Einstellungen) ➔ **Kontoeinstellungen** (Account settings).
3. Wähle im linken Menü **Benutzerverwaltung** (User management) ➔ Tab **Azure AD-Anwendungen** (Azure AD applications).
4. Klicke auf **Azure AD-Anwendung erstellen** (oder eine bestehende verknüpfen).
5. Weise der Anwendung die Rolle **Manager** (oder mindestens *Entwickler / Developer*) zu.
6. Erstelle ein neues **Client Secret** (Geheimer Schlüssel) und notiere dir:
   - **Mandanten-ID (Tenant ID)**
   - **Client-ID (Anwendungs-ID)**
   - **Client Secret (Wert des Schlüssels)**
7. Trage diese drei Werte als GitHub Secrets ein.

---

## 🚀 4. Auslösen eines Releases

Sobald du ein neues Release veröffentlichst:
1. **Automatischer Build bei Git-Tag:**
   ```bash
   git tag v1.2.5
   git push origin v1.2.5
   ```
2. **Oder manueller Trigger:**  
   Im GitHub Actions Reiter unter **Desktop Multiplatform Release (Linux & Windows)** auf **Run workflow** klicken.

Die Pipeline:
- baut die WebAssembly- & Tauri-Binaries,
- generiert das korrekte `AppxManifest.xml` mit der Identität `Gradus21.Gradus21` und Publisher `CN=9AFE237C-D8CE-415B-AEB5-ED30444929CC`,
- verpackt und signiert das `gradus21.msix`,
- lädt es zu den GitHub Release Assets hoch,
- und schiebt es (sofern die `MS_STORE_*` Secrets gesetzt sind) vollautomatisch über die Store Submission API in den Microsoft Store.
