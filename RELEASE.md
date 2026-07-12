# Release Runbook

Two distribution paths. Path A ships now; Path B is a follow-on gated on external items.
Anything marked **(you)** needs a human — the rest is automated by the repo.

## Preflight (both paths)
- [x] `npm test` green (231 unit)
- [x] `npm run e2e` green (20 specs)
- [x] `npm run lint` clean
- [x] Icons present (`npm run icons`) and referenced in manifest
- [x] `CHANGELOG.md` / version bumped in `extension/manifest.json`
- [ ] **(you)** Fill the contact email in `PRIVACY.md` and `docs/privacy.html`

## Path A — Self-hosted / unpacked (ready now)
1. `npm run package:selfhost` → `dist/browser-organizer-selfhost-<version>.zip`
   (extension + native-host + install + INSTALL.md/README/PRIVACY/SECURITY).
2. **(you)** Decide the repo home; **(you / on your go-ahead)** push the branch and open the
   PR — *currently on hold per your instruction.*
3. **(you)** Tag `v<version>` and attach the self-host zip to a GitHub Release; paste
   `CHANGELOG.md` notes.
4. Users follow `INSTALL.md` (load unpacked → `npm run install-host` → pick a backend).

## Path B — Chrome Web Store + Edge Add-ons (follow-on)
Prerequisites — **the real gate is the native-host installer** (see
`docs/native-host-installer-scope.md`) so store users don't need a terminal:
- [ ] **(you)** Decide: build the signed native-host installer (needs Windows Authenticode +
      Apple Developer certs — long lead) OR keep Path B blocked.
- [ ] **(you)** Confirm default store backend (recommended: OpenAI-compatible API — no CLI).

Submission steps once the installer exists:
1. `npm run package` → `dist/browser-organizer-<version>.zip` (extension only).
2. **(you)** Host the privacy policy — `docs/privacy.html` is GitHub-Pages-ready (enable Pages
   on `/docs`); copy the resulting URL.
3. **(you)** Capture ≥1 screenshot at 1280×800 (side panel with suggestions).
4. **(you)** Create accounts: Chrome Web Store developer ($5 one-time) / Edge Partner Center
   (free).
5. **(you)** Upload the zip; paste short/detailed description + permission justifications +
   **Notes for reviewers** from `CHROMEWEBSTORE.md`; enter the privacy URL and complete the
   data-use / privacy forms; upload icon + screenshot.
6. **(you)** After first publish, verify the store-assigned extension ID matches the
   `key`-derived ID so the native host `allowed_origins` stays valid.

## Notes
- `dist/` is git-ignored (build artifacts).
- The `key` in the manifest is intentional — it pins the extension ID so native messaging
  keeps working across builds. Keep the corresponding **private** key secret; never commit it.
