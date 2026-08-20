@echo off
setlocal

REM Execute como Administrador. Instala a confiança publica do OhFome no QZ Tray.
set "QZ_DIR=%ProgramFiles%\QZ Tray"
set "CERT_URL=https://ohfome.app/ohfome-qz-root-ca.crt"

if not exist "%QZ_DIR%\qz-tray-console.exe" (
  echo QZ Tray nao foi encontrado. Instale-o primeiro em https://qz.io/download/
  exit /b 1
)

echo Preparando a confianca do OhFome no QZ Tray...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing '%CERT_URL%' -OutFile '%QZ_DIR%\override.crt'"
if errorlevel 1 exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='%QZ_DIR%\qz-tray.properties'; $l=Get-Content $p | Where-Object { $_ -notmatch '^\s*authcert\.override\s*=' }; $l += 'authcert.override=C:/Program Files/QZ Tray/override.crt'; Set-Content -Path $p -Value $l -Encoding Ascii"
if errorlevel 1 exit /b 1

echo.
echo Pronto. Feche e abra novamente o QZ Tray; depois conecte a estacao de impressao no OhFome.
pause
