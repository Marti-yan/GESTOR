!include "nsProcess.nsh"
!include "FileFunc.nsh"

!macro ProntoRequireClosed
  ${GetParameters} $R6
  ClearErrors
  ${GetOptions} $R6 "/WAITFORPRONTO" $R7
  ${IfNot} ${Errors}
    StrCpy $R9 80
    ProntoWaitForExit:
      ${nsProcess::FindProcess} "Pronto Gestor.exe" $R0
      ${If} $R0 == 0
        Sleep 250
        IntOp $R9 $R9 - 1
        IntCmp $R9 0 ProntoWaitDone ProntoWaitDone ProntoWaitForExit
      ${EndIf}
    ProntoWaitDone:
  ${EndIf}
  ${nsProcess::FindProcess} "Pronto Gestor.exe" $R0
  ${nsProcess::Unload}
  ${If} $R0 == 0
    MessageBox MB_OK|MB_ICONSTOP "Feche o Pronto Gestor, inclusive a janela de erro e o ícone da bandeja, e execute este instalador novamente.$\r$\n$\r$\nO programa precisa estar fechado para substituir os arquivos da versão anterior."
    Abort
  ${EndIf}
!macroend
