#!/bin/bash
# Instala a confiança pública do OhFome no QZ Tray para permitir impressão direta.
# Execute este arquivo no Terminal. O macOS pedirá a senha de administrador.

set -euo pipefail

QZ_APP="/Applications/QZ Tray.app"
QZ_EXECUTABLE="$QZ_APP/Contents/MacOS/QZ Tray"
PROVISION_DIR="$QZ_APP/Contents/Resources/provision"
CERT_URL="https://ohfome.app/ohfome-qz-root-ca.crt"
PROVISION_URL="https://ohfome.app/qz/ohfome-qz-provision.json"

if [[ ! -x "$QZ_EXECUTABLE" ]]; then
  echo "QZ Tray não foi encontrado em /Applications. Instale-o primeiro em https://qz.io/download/"
  exit 1
fi

echo "Preparando a confiança do OhFome no QZ Tray..."
sudo mkdir -p "$PROVISION_DIR"
sudo curl --fail --location --silent --show-error "$CERT_URL" -o "$PROVISION_DIR/ohfome-qz-root-ca.crt"
sudo curl --fail --location --silent --show-error "$PROVISION_URL" -o "$PROVISION_DIR/provision.json"
sudo "$QZ_EXECUTABLE" certgen

echo "Pronto. Feche e abra novamente o QZ Tray; depois conecte a estação de impressão no OhFome."
