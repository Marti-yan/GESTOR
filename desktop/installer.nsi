; Instalador por usuário. O NSIS gera o desinstalador sem executar binários Windows no build.
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "extractAppPackage.nsh"

Name "${PRODUCT_NAME}"
InstallDir "$LOCALAPPDATA\Programs\Pronto Gestor"
InstallDirRegKey HKCU "Software\ProntoGestor" "InstallDir"
RequestExecutionLevel user
ShowInstDetails show
ShowUninstDetails show

!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "Bem-vindo ao Pronto Gestor"
!define MUI_WELCOMEPAGE_TEXT "Cardápio digital, pedidos e impressão térmica em um aplicativo.$\r$\n$\r$\nAntes de atualizar, encerre o Pronto pelo ícone da bandeja.$\r$\n$\r$\nInstale o driver Windows da Elgin i8 para imprimir."
!define MUI_FINISHPAGE_RUN "$INSTDIR\Pronto Gestor.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir Pronto Gestor"
!define MUI_FINISHPAGE_TEXT "O Pronto foi instalado.$\r$\n$\r$\nCrie sua senha, selecione a Elgin i8 em Impressão e use o botão Testar antes de ligar a impressão automática."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"

Section "Pronto Gestor" Main
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  InitPluginsDir
  SetCompress off
  File /oname=$PLUGINSDIR\app-64.7z "${APP_64}"
  SetCompress auto
  !insertmacro extractUsing7za "$PLUGINSDIR\app-64.7z"
  IfFileExists "$INSTDIR\Pronto Gestor.exe" +3
    MessageBox MB_ICONSTOP "Não foi possível extrair o aplicativo. Confira a pasta de instalação."
    Abort
  WriteUninstaller "$INSTDIR\Desinstalar.exe"
  CreateShortcut "$DESKTOP\Pronto Gestor.lnk" "$INSTDIR\Pronto Gestor.exe" "" "$INSTDIR\Pronto Gestor.exe"
  CreateShortcut "$SMPROGRAMS\Pronto Gestor.lnk" "$INSTDIR\Pronto Gestor.exe" "" "$INSTDIR\Pronto Gestor.exe"
  WriteRegStr HKCU "Software\ProntoGestor" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ProntoGestor" "DisplayName" "Pronto Gestor"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ProntoGestor" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ProntoGestor" "Publisher" "Pronto"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ProntoGestor" "UninstallString" '$\"$INSTDIR\Desinstalar.exe$\"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ProntoGestor" "InstallLocation" "$INSTDIR"
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ProntoGestor" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ProntoGestor" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  IfFileExists "$INSTDIR\resources\app.asar" +3
    MessageBox MB_ICONSTOP "A pasta do Pronto não foi identificada. Nenhum arquivo foi removido."
    Abort
  Delete "$DESKTOP\Pronto Gestor.lnk"
  Delete "$SMPROGRAMS\Pronto Gestor.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\ProntoGestor"
  DeleteRegKey HKCU "Software\ProntoGestor"
  RMDir /r "$INSTDIR"
  ; Pedidos e configurações em APPDATA são preservados.
SectionEnd
