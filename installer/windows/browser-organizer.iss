; Browser Organizer — native host installer (Windows / Inno Setup)
;
; TOOLCHAIN: Inno Setup 6+ (https://jrsoftware.org/isinfo.php). Compile with:
;   iscc installer\windows\browser-organizer.iss
; produces dist\BrowserOrganizerSetup.exe.
;
; This script is NOT run in the CI-less / offline sandbox — it requires the Inno
; Setup compiler (iscc.exe), which only runs on Windows. It is built on a
; windows-latest runner (see .github/workflows/release-host.yml) or by a
; maintainer. It expects the SEA binary from `npm run build:sea` at
; dist\host\browser-organizer-host.exe.
;
; What it does (per-user, no admin/elevation):
;   1. Copies browser-organizer-host.exe to %LOCALAPPDATA%\BrowserOrganizer\.
;   2. Runs `browser-organizer-host.exe --install chrome,edge` so the binary
;      writes the HKCU native-messaging registry keys pointing at itself.
;   3. On uninstall, runs `--uninstall chrome,edge` to remove them.

#define AppName "Browser Organizer Host"
; Version may be passed by CI: iscc /DAppVersion=0.1.1 ...  (falls back otherwise).
#ifndef AppVersion
  #define AppVersion "0.1.1"
#endif
#define ExeName "browser-organizer-host.exe"

[Setup]
AppId={{B0A9F3C2-6E4D-4F1A-9C7B-BROWSERORGANIZER}}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Lusk Technologies
AppPublisherURL=https://lusk.tech
; Per-user install — no admin rights required.
PrivilegesRequired=lowest
DefaultDirName={localappdata}\BrowserOrganizer
DisableDirPage=yes
DisableProgramGroupPage=yes
Uninstallable=yes
OutputDir=..\..\dist
OutputBaseFilename=BrowserOrganizerSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
; Authenticode signing is applied by CI after compilation (signtool), not here.

[Files]
Source: "..\..\dist\host\{#ExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Run]
; Register the host for Chrome and Edge (writes HKCU keys → this exe).
Filename: "{app}\{#ExeName}"; Parameters: "--install chrome,edge"; \
  Flags: runhidden waituntilterminated; StatusMsg: "Registering native host..."

[UninstallRun]
; Unregister before the files are removed.
Filename: "{app}\{#ExeName}"; Parameters: "--uninstall chrome,edge"; \
  Flags: runhidden waituntilterminated; RunOnceId: "UnregisterHost"
