; Extra Windows registration, on top of what Tauri's installer already does.
;
; Tauri registers Verso as the handler for .md and friends, which is enough on
; a machine where nothing else has claimed them. It is not enough on a machine
; where something has: Windows keeps the reader's existing choice — as it
; should — and Verso then appears nowhere in "Open with", so there is no way
; to pick it short of browsing to the executable by hand. That is a poor
; welcome for a program whose whole premise is opening Markdown files.
;
; So the application is also registered as an "Open with" candidate for those
; extensions, with a friendly name, and unregistered again on the way out.

!macro NSIS_HOOK_POSTINSTALL
  ; SHCTX is HKLM for a per-machine install and HKCU for a per-user one;
  ; Tauri sets it before the hook runs.
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe" "FriendlyAppName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"

  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".md" ""
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".markdown" ""
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".mdown" ""
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".mkd" ""

  ; Listing the file class here is what puts Verso in the "Open with" menu
  ; without taking the default away from whatever holds it.
  WriteRegStr SHCTX "Software\Classes\.md\OpenWithProgids" "Verso.Markdown" ""
  WriteRegStr SHCTX "Software\Classes\.markdown\OpenWithProgids" "Verso.Markdown" ""
  WriteRegStr SHCTX "Software\Classes\.mdown\OpenWithProgids" "Verso.Markdown" ""
  WriteRegStr SHCTX "Software\Classes\.mkd\OpenWithProgids" "Verso.Markdown" ""
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe"
  DeleteRegValue SHCTX "Software\Classes\.md\OpenWithProgids" "Verso.Markdown"
  DeleteRegValue SHCTX "Software\Classes\.markdown\OpenWithProgids" "Verso.Markdown"
  DeleteRegValue SHCTX "Software\Classes\.mdown\OpenWithProgids" "Verso.Markdown"
  DeleteRegValue SHCTX "Software\Classes\.mkd\OpenWithProgids" "Verso.Markdown"
!macroend
