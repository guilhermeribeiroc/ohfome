@echo off
setlocal

REM Execute como Administrador. Instala a confiança publica do OhFome no QZ Tray.
set "QZ_DIR=%ProgramFiles%\QZ Tray"
set "QZ_EXECUTABLE=%QZ_DIR%\qz-tray-console.exe"
set "PROVISION_DIR=%QZ_DIR%\provision"
set "CERT_URL=https://ohfome.app/ohfome-qz-root-ca.crt"
set "PROVISION_URL=https://ohfome.app/qz/ohfome-qz-provision.json"

if not exist "%QZ_EXECUTABLE%" (
  echo QZ Tray nao foi encontrado. Instale-o primeiro em https://qz.io/download/
  exit /b 1
)

echo Preparando a confianca do OhFome no QZ Tray...
if not exist "%PROVISION_DIR%" mkdir "%PROVISION_DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing '%CERT_URL%' -OutFile '%PROVISION_DIR%\ohfome-qz-root-ca.crt'"
if errorlevel 1 exit /b 1
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing '%PROVISION_URL%' -OutFile '%PROVISION_DIR%\provision.json'"
if errorlevel 1 exit /b 1
"%QZ_EXECUTABLE%" certgen
if errorlevel 1 exit /b 1

echo.
echo Pronto. Feche e abra novamente o QZ Tray; depois conecte a estacao de impressao no OhFome.
pause
