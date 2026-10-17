@echo off
setlocal
pushd "%~dp0"
if errorlevel 1 exit /b 1
echo Pronto Gestor 0.5.0 - preparacao do instalador Windows x64
echo.
if not exist "instalador.parte1.bin" goto faltam_arquivos
if not exist "instalador.parte2.bin" goto faltam_arquivos
if not exist "instalador.parte3.bin" goto faltam_arquivos
set "PRONTO_INSTALLER=%CD%\Pronto-Gestor-0.5.0-Windows-x64.exe"
echo Montando o instalador...
copy /b /y "instalador.parte1.bin"+"instalador.parte2.bin"+"instalador.parte3.bin" "%PRONTO_INSTALLER%" >nul
if errorlevel 1 goto falha
echo Conferindo a integridade SHA-256...
powershell.exe -NoLogo -NoProfile -NonInteractive -Command "$ErrorActionPreference='Stop'; $hash=Get-FileHash -Algorithm SHA256 -LiteralPath $env:PRONTO_INSTALLER; if ($hash.Hash -ne '2de07bb07b521d0644c37fe92978c7796f3c4ed8b6e4e5d0cde6113c75e94313') { Write-Error 'O arquivo esta incompleto ou foi alterado.'; exit 1 }"
if errorlevel 1 goto falha
echo Integridade confirmada. Abrindo o instalador...
start "" "%PRONTO_INSTALLER%"
if errorlevel 1 goto falha
popd
exit /b 0

:faltam_arquivos
echo Faltam partes do instalador nesta pasta.
echo Extraia TODO o ZIP antes de executar Instalar.cmd.
goto erro

:falha
echo Nao foi possivel preparar ou abrir o instalador.
echo Confira espaco em disco e extraia novamente o ZIP completo.

:erro
echo.
pause
popd
exit /b 1
