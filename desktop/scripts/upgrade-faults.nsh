!macro customInstall
  ReadEnvStr $9 "BRASFC_VALIDATION_INSTALL_FAILURE"
  ${If} $9 == "1"
    ReadEnvStr $8 "BRASFC_VALIDATION_FAULT_LOG"
    FileOpen $7 "$8" w
    FileWrite $7 "installer"
    FileClose $7
    Delete "$INSTDIR\resources\app.asar"
    SetErrorLevel 79
    Quit
  ${EndIf}
!macroend
