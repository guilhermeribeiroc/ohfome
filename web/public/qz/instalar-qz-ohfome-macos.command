#!/bin/bash
# Instala a confiança pública do OhFome no QZ Tray para permitir impressão direta.
# A configuração é por usuário e não altera o pacote protegido do macOS.

set -euo pipefail

QZ_APP="/Applications/QZ Tray.app"
QZ_EXECUTABLE="$QZ_APP/Contents/MacOS/QZ Tray"
CERT_DIR="$HOME/.ohfome/qz"
CERT_PATH="$CERT_DIR/ohfome-qz-root-ca.crt"
CERT_URL="https://ohfome.app/ohfome-qz-root-ca.crt"

if [[ ! -x "$QZ_EXECUTABLE" ]]; then
  echo "QZ Tray não foi encontrado em /Applications. Instale-o primeiro em https://qz.io/download/"
  exit 1
fi

echo "Preparando a confiança do OhFome no QZ Tray..."
mkdir -p "$CERT_DIR"
curl --fail --location --silent --show-error "$CERT_URL" -o "$CERT_PATH"
opcoes_atuais="$(defaults read io.qz.qz-tray QZ_OPTS 2>/dev/null || true)"
opcoes_sem_raiz="$(printf '%s' "$opcoes_atuais" | sed -E 's@[[:space:]]*-DtrustedRootCert=[^[:space:]]+@@g')"
defaults write io.qz.qz-tray QZ_OPTS -string "${opcoes_sem_raiz} -DtrustedRootCert=$CERT_PATH"
osascript -e 'tell application "QZ Tray" to quit' || true
open -a "QZ Tray"

echo "Pronto. O QZ Tray foi reiniciado; conecte a estação de impressão no OhFome."
