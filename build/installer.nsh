; Extra steps for the Windows installer (electron-builder picks this file up from build/).
;
;  * Installing asks whether to put a shortcut on the desktop (ticked by default).
;  * Uninstalling asks whether to ALSO delete the library, cover art, settings and saved sign-ins.
;    The default answer is No: an ordinary uninstall keeps them, so a reinstall opens straight into the
;    library. Updates and silent runs never ask and never delete anything.
;
; Where the app keeps its data: Electron's per-user folder, named after package.json's "name" ("the-vault").

!include nsDialogs.nsh
!include LogicLib.nsh

; (The installer is compiled twice - once more to build the uninstaller, which has no desktop-shortcut page -
; so the variables are declared only in the installer pass, or NSIS warns they are unused.)
!ifndef BUILD_UNINSTALLER
  Var MV_ShortcutCheckbox
  Var MV_WantShortcut
!endif

!macro customInit
  StrCpy $MV_WantShortcut "1"
!macroend

; The page's functions are defined inside this macro because it is expanded after the installer's UI library
; (which MUI_HEADER_TEXT needs) has been loaded.
!macro customPageAfterChangeDir
Function MVShortcutPageCreate
  ; Silent installs (and automatic updates) skip the question; customInstall reuses the earlier answer.
  IfSilent 0 +2
    Abort
  !insertmacro MUI_HEADER_TEXT "Desktop shortcut" "Choose whether to put The Media Vault on your desktop."
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 24u "A Start menu entry is always added. You can also have a shortcut on your desktop."
  Pop $0
  ${NSD_CreateCheckbox} 0 34u 100% 12u "Create a desktop shortcut"
  Pop $MV_ShortcutCheckbox
  ${NSD_Check} $MV_ShortcutCheckbox
  nsDialogs::Show
FunctionEnd

Function MVShortcutPageLeave
  ${NSD_GetState} $MV_ShortcutCheckbox $MV_WantShortcut
FunctionEnd

  Page custom MVShortcutPageCreate MVShortcutPageLeave
!macroend

!macro customInstall
  ; Silent installs and updates keep whatever was chosen last time (a first silent install makes one).
  StrCpy $R9 $MV_WantShortcut
  ${If} ${Silent}
    ReadRegStr $R8 HKCU "Software\TheMediaVault" "DesktopShortcut"
    ${If} $R8 != ""
      StrCpy $R9 $R8
    ${Else}
      StrCpy $R9 "1"
    ${EndIf}
  ${EndIf}
  WriteRegStr HKCU "Software\TheMediaVault" "DesktopShortcut" $R9
  ${If} $R9 == "1"
    CreateShortCut "$DESKTOP\The Media Vault.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
  ${Else}
    Delete "$DESKTOP\The Media Vault.lnk"
  ${EndIf}
!macroend

!ifdef BUILD_UNINSTALLER
Function un.MVWipeUserData
  RMDir /r "$APPDATA\the-vault"
  RMDir /r "$LOCALAPPDATA\the-vault"
  RMDir /r "$LOCALAPPDATA\the-vault-updater"
FunctionEnd
!endif

!macro customUnInstall
  Delete "$DESKTOP\The Media Vault.lnk"
  ${ifNot} ${isUpdated}
    DeleteRegKey HKCU "Software\TheMediaVault"
    ; Only ask when a person is watching: never during an update, never in a silent run.
    ${IfNot} ${Silent}
      MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "Also delete your library, cover art, settings and saved sign-ins from this computer?$\r$\n$\r$\nChoose No to keep them (recommended if you might reinstall: the app will open straight into your library). Choose Yes for a full removal. This cannot be undone.$\r$\n$\r$\nAnything stored on your own Cloud Sync server is not touched." IDNO +2
      Call un.MVWipeUserData
    ${EndIf}
  ${endIf}
!macroend
