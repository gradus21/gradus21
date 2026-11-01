#!/usr/bin/env bash
set -euo pipefail

echo "==========================================================="
echo "🍏 Gradus21 - Mac App Store Zertifikats- & Profile-Setup"
echo "==========================================================="
echo "Dieses Skript hilft dir auf Linux, die für den Mac App Store"
echo "benötigten Zertifikate und Provisioning Profiles zu erstellen"
echo "und direkt via GitHub CLI (gh) in den Secrets zu hinterlegen."
echo ""

WORK_DIR="$(pwd)/.apple_mas_temp"
mkdir -p "$WORK_DIR"

KEY_FILE="$WORK_DIR/mac_installer.key"
CSR_FILE="$WORK_DIR/mac_installer.csr"
CER_FILE="$WORK_DIR/mac_installer.cer"
P12_FILE="$WORK_DIR/mac_installer.p12"

echo "Schritt 1: Generiere Private Key und CSR (Certificate Signing Request)..."
if [ ! -f "$KEY_FILE" ] || [ ! -f "$CSR_FILE" ]; then
  openssl req -new -newkey rsa:2048 -nodes \
    -keyout "$KEY_FILE" \
    -out "$CSR_FILE" \
    -subj "/CN=Mac Installer Distribution - Julian Kallidat/O=Julian Kallidat/C=DE"
  echo "✔ CSR erstellt unter: $CSR_FILE"
else
  echo "✔ Bestehender CSR vorhanden: $CSR_FILE"
fi

echo ""
echo "-----------------------------------------------------------"
echo "👉 1. Mac Installer Distribution Zertifikat bei Apple erstellen:"
echo "1. Öffne im Browser: https://developer.apple.com/account/resources/certificates/add"
echo "2. Wähle: 'Mac Installer Distribution' (unter Software)"
echo "3. Lade die Datei hoch: $CSR_FILE"
echo "4. Klicke auf 'Continue' und lade die .cer Datei herunter."
echo "5. Speichere die Datei als: $CER_FILE (oder verschiebe sie dorthin)"
echo "-----------------------------------------------------------"
echo ""

echo "-----------------------------------------------------------"
echo "👉 2. Mac App Store Provisioning Profile erstellen:"
echo "1. Öffne im Browser: https://developer.apple.com/account/resources/profiles/add"
echo "2. Wähle: 'Mac App Store Connect' (unter Distribution)"
echo "3. App ID auswählen: 'de.gradus21.app'"
echo "4. Apple Distribution Zertifikat auswählen (Julian Kallidat)"
echo "5. Name: 'Gradus21 Mac App Store Distribution'"
echo "6. Herunterladen und speichern als: $WORK_DIR/Gradus21_Mac.provisionprofile"
echo "-----------------------------------------------------------"
echo ""

read -p "Drücke Enter, sobald du die Dateien in $WORK_DIR abgelegt hast (oder 'q' zum Beenden)... " choice
if [[ "$choice" == "q" || "$choice" == "Q" ]]; then
  echo "Setup pausiert. Du kannst das Skript jederzeit erneut ausführen."
  exit 0
fi

if [ -f "$CER_FILE" ]; then
  echo "Verarbeite Mac Installer Zertifikat..."
  openssl x509 -in "$CER_FILE" -inform DER -out "$WORK_DIR/mac_installer.crt"
  
  PASS="gradus21-installer"
  openssl pkcs12 -export -out "$P12_FILE" \
    -inkey "$KEY_FILE" \
    -in "$WORK_DIR/mac_installer.crt" \
    -password "pass:$PASS"
    
  B64_P12=$(base64 -w 0 "$P12_FILE")
  echo "Hinterlege APPLE_INSTALLER_CERTIFICATE_P12 in GitHub Secrets..."
  gh secret set APPLE_INSTALLER_CERTIFICATE_P12 --body "$B64_P12"
  gh secret set APPLE_INSTALLER_CERTIFICATE_PASSWORD --body "$PASS"
  echo "✔ Mac Installer Zertifikat erfolgreich als GitHub Secret hinterlegt!"
else
  echo "Hinweis: $CER_FILE wurde noch nicht gefunden. Schritt übersprungen."
fi

PROFILE_FILE="$WORK_DIR/Gradus21_Mac.provisionprofile"
if [ -f "$PROFILE_FILE" ]; then
  echo "Verarbeite Provisioning Profile..."
  B64_PROFILE=$(base64 -w 0 "$PROFILE_FILE")
  gh secret set APPLE_MAC_PROVISIONING_PROFILE --body "$B64_PROFILE"
  echo "✔ APPLE_MAC_PROVISIONING_PROFILE erfolgreich als GitHub Secret hinterlegt!"
else
  echo "Hinweis: $PROFILE_FILE wurde noch nicht gefunden. Schritt übersprungen."
fi

echo ""
echo "Setup abgeschlossen!"
