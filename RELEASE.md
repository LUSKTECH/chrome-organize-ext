# Release Runbook

Three deliverables now ship from one repo: the **extension**, the **npm helper package**
(`@lusktech/browser-organizer-host`) for technical users, and the **per-OS installer** for
non-technical users. Anything marked **(you)** needs a human — the rest is automated.

## Preflight (all paths)
- [x] `npm test` green (256 unit)
- [x] `npm run e2e` green (21 specs; 3 CLI-marked specs skip without a `claude` login)
- [x] `npm run lint` clean (pre-existing browser-global lint errors in crypto-box/secret-store excepted)
- [x] Icons present (`npm run icons`) and referenced in manifest
- [x] `CHANGELOG.md` / version bumped in `extension/manifest.json` (and `native-host/package.json` for a host release)
- [x] Contact email wired in (`hello@lusk.dev`) and privacy URL set
      (`https://lusk.dev/browser-organizer/privacy`)

## The native host installs to a stable per-user home
Every path below registers the helper into `~/.browser-organizer` (macOS/Linux) or
`%LOCALAPPDATA%\BrowserOrganizer` (Windows) and points the browser's host manifest there, so
the repo/bundle/npx-cache can be deleted afterward. The extension ID is baked
(`jjacbpnaekkhbfpncfhmignbiocddocc`, from `native-host/paths.js`).

## Path A — Self-hosted / unpacked (ready now)
1. `npm run package:selfhost` → `dist/browser-organizer-selfhost-<version>.zip`
   (extension + native-host + INSTALL.md/README/PRIVACY/SECURITY).
2. **(you)** Tag `v<version>` and attach the self-host zip to a GitHub Release; paste
   `CHANGELOG.md` notes.
3. Users follow `INSTALL.md`: load unpacked → `node native-host/installer.js` (or the npx
   command from Path C) → pick a backend.

## Path B — npm helper package (ready now; for technical users)
1. `cd native-host && npm pack --dry-run` — confirm the tarball is self-contained (no
   `run.sh`, no tests) and dependency-free.
2. **(you)** `npm login` to the `@lusktech` org, then `cd native-host && npm publish`
   (`publishConfig.access` is already `public`; `prepublishOnly` re-runs the unit suite).
3. Users then run `npx @lusktech/browser-organizer-host` from any directory.

## Path C — Chrome Web Store + Edge Add-ons + signed installer (follow-on)
The store path needs the double-click, no-Node installer so store users never touch a
terminal. The installer sources and CI exist (Phase C); the remaining gate is code-signing
credentials.
- [ ] **(you)** Obtain a Windows Authenticode (OV/EV) certificate and an Apple Developer
      account (long lead), and add them to CI secrets. (Or use the free SignPath Foundation
      OSS certificate for Windows; macOS notarization still needs the $99/yr Apple account.)
- [ ] **(you)** Confirm default store backend (recommended: OpenAI-compatible API — no CLI).

Build & submit:
1. Tag `host-v<version>` → `.github/workflows/release-host.yml` builds the SEA binary on
   win/mac/ubuntu, packages the installers (Inno `.exe` / `.pkg` / `.deb`/`.rpm` /
   `install.sh`), signs + notarizes (once certs exist), emits `SHA256SUMS`, and attaches all
   artifacts to a GitHub Release.
2. `npm run package` → `dist/browser-organizer-extension-<version>.zip` (extension only).
   (Also produced automatically and attached to the `host-v*` release; versioned by
   `extension/manifest.json`, independent of the host version.)
3. **(you)** Deploy `docs/privacy.html` to https://lusk.dev/browser-organizer/privacy.
4. **(you)** Capture ≥1 screenshot at 1280×800 (side panel with suggestions).
5. **(you)** Create accounts: Chrome Web Store developer ($5 one-time) / Edge Partner Center
   (free).
6. **(you)** Upload the zip; paste short/detailed description + permission justifications +
   **Notes for reviewers** from `CHROMEWEBSTORE.md`; enter the privacy URL and complete the
   data-use / privacy forms; upload icon + screenshot; link the installer downloads.
7. **(you)** After first publish, verify the store-assigned extension ID matches the
   `key`-derived ID so the native host `allowed_origins` stays valid.

## Notes
- `dist/` is git-ignored (build artifacts).
- The `key` in the manifest is intentional — it pins the extension ID so native messaging
  keeps working across builds. Keep the corresponding **private** key secret; never commit it.
- `esbuild`/`postject` are build-time-only devDependencies for `npm run build:sea`; the
  shipped npm package and SEA binary stay dependency-free.
