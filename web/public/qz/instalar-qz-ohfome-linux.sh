#!/usr/bin/env bash

set -euo pipefail

CERT_URL="https://ohfome.app/ohfome-qz-root-ca.crt"
QZ_DIR="/opt/qz-tray"
CERT_PATH="$QZ_DIR/ohfome-qz-root-ca.crt"
PROPERTIES_PATH="$QZ_DIR/qz-tray.properties"

if [[ ! -f "$PROPERTIES_PATH" || ! -x "$QZ_DIR/qz-tray" ]]; then
  echo "QZ Tray não foi encontrado em $QZ_DIR. Instale-o primeiro em https://qz.io/download/"
  exit 1
fi

TEMP_CERTIFICATE="$(mktemp)"
trap 'rm -f "$TEMP_CERTIFICATE"' EXIT

echo "Baixando o certificado público do OhFome..."
curl -fL "$CERT_URL" -o "$TEMP_CERTIFICATE"

echo "Configurando a confiança do OhFome no QZ Tray..."
sudo install -Dm644 "$TEMP_CERTIFICATE" "$CERT_PATH"
sudo sed -i '/^[[:space:]]*authcert\.override[[:space:]]*=/d' "$PROPERTIES_PATH"
printf 'authcert.override=%s\n' "$CERT_PATH" | sudo tee -a "$PROPERTIES_PATH" >/dev/null

pkill -f "$QZ_DIR/qz-tray" 2>/dev/null || true
nohup "$QZ_DIR/qz-tray" >/dev/null 2>&1 &

echo "Pronto. QZ Tray reiniciado e autorizado para o OhFome."
