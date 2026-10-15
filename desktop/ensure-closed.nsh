!include "nsProcess.nsh"

!macro ProntoRequireClosed
  ${nsProcess::FindProcess} "Pronto Gestor.exe" $R0
  ${nsProcess::Unload}
  ${If} $R0 == 0
    MessageBox MB_OK|MB_ICONSTOP "Feche o Pronto Gestor, inclusive a janela de erro e o ícone da bandeja, e execute este instalador novamente.$\r$\n$\r$\nO programa precisa estar fechado para substituir os arquivos da versão anterior."
    Abort
  ${EndIf}
!macroend
