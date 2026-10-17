Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "StdUtils.nsh"
!include "${PRONTO_PROJECT}/desktop/ensure-closed.nsh"
!include "${PRONTO_PROJECT}/.runtime/critical-files.nsh"

Name "Reparar Pronto Gestor ${PRONTO_VERSION}"
Caption "Reparar Pronto Gestor ${PRONTO_VERSION}"
OutFile "${PRONTO_OUTPUT}"
InstallDir "$LOCALAPPDATA\Programs\Pronto Gestor"
InstallDirRegKey HKCU "Software\ProntoGestor" "InstallDir"
RequestExecutionLevel user
CRCCheck force
SetCompressor /SOLID lzma
ShowInstDetails show

!define MUI_WELCOMEPAGE_TITLE "Reparar Pronto Gestor ${PRONTO_VERSION}"
!define MUI_WELCOMEPAGE_TEXT "Este reparador substitui os arquivos do programa e confere seus hashes.$\r$\n$\r$\nPrimeiro feche o Pronto, incluindo a janela de erro e o ícone da bandeja.$\r$\n$\r$\nSeus pedidos, senha e configurações na pasta APPDATA são preservados."
!define MUI_FINISHPAGE_RUN "$INSTDIR\Pronto Gestor.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir Pronto Gestor ${PRONTO_VERSION}"
!define MUI_FINISHPAGE_TEXT "Os arquivos foram substituídos e verificados.$\r$\n$\r$\nAo abrir, confira a versão ${PRONTO_VERSION} na barra de título."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_LANGUAGE "PortugueseBR"

Function .onInit
  !insertmacro ProntoRequireClosed
FunctionEnd

Section "Reparar arquivos do programa"
  SetShellVarContext current
  IfFileExists "$INSTDIR\Pronto Gestor.exe" 0 missing
  IfFileExists "$INSTDIR\resources\app.asar" 0 missing
  !insertmacro ProntoInstallCritical
  WriteRegStr HKCU "Software\ProntoGestor" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ProntoGestor" "DisplayVersion" "${PRONTO_VERSION}"
  CreateShortcut "$DESKTOP\Pronto Gestor.lnk" "$INSTDIR\Pronto Gestor.exe"
  CreateShortcut "$SMPROGRAMS\Pronto Gestor.lnk" "$INSTDIR\Pronto Gestor.exe"
  Goto done
  missing:
    MessageBox MB_OK|MB_ICONSTOP "O Pronto não foi encontrado nesta pasta. Selecione a pasta da instalação existente ou use o instalador completo."
    Abort
  done:
SectionEnd
