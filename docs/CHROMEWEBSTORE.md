# Chrome Web Store / Edge Add-ons Listing — Browser Organizer

_Last updated: 2026-07-14_

**Publisher:** Lusk Technologies · **Website:** https://lusk.tech ·
**Privacy policy:** https://lusk.dev/browser-organizer/privacy · **Contact:** hello@lusk.dev

## Short description (≤132 chars)
Organize tabs & bookmarks with your own AI (local CLI or API): group tabs, close stale ones, tidy bookmarks. Review or auto-apply.

<!-- 130 chars. The store "summary" field caps at 132. -->

## Detailed description
Browser Organizer turns a 200-tab mess into order. Click one button and it groups your
open tabs by topic, flags forgotten tabs you can close (saving any worth keeping first),
files genuinely useful pages into tidy bookmark folders, and finds stale, dead, or
duplicate bookmarks to remove. You review every change before it happens, or turn on
automatic mode with one-click undo.

All processing runs through a small helper program on your own computer, which calls your
own AI CLI (Claude Code, Antigravity, Kiro, Copilot, Codex, or local Ollama) — or an
OpenAI-compatible endpoint you configure. Tab titles and URLs are sent to that provider
under your own subscription; bookmarks and history never leave your machine. Nothing is
ever sent to our servers — we operate none.

## Permission justifications
- **tabs**: Read tab titles and URLs to suggest groupings and identify forgotten tabs.
- **tabGroups**: Create and label tab groups when organizing open tabs in place.
- **bookmarks**: Read your bookmarks to find duplicates/stale entries and create new ones.
- **history**: Check when a bookmarked page was last visited, to identify stale bookmarks.
- **storage**: Save your settings, tab-activity timestamps, and the undo log locally.
- **alarms**: Run scheduled organization passes and prune the undo log in auto mode.
- **sidePanel**: Show the review dashboard where you approve suggested changes.
- **nativeMessaging**: Communicate with the local helper that runs your AI CLI (see reviewer note).
- **notifications**: Tell you when a scheduled pass finishes and changes are ready/applied.
- **optional_host_permissions `<all_urls>`**: Requested at runtime only if you enable
  dead-link scanning, to check whether bookmarked pages still load. Not granted at install.
  The extension never reads page contents — it only checks the HTTP status.
- **optional_host_permissions `https://registry.npmjs.org/*`**: Requested at runtime only if
  you enable "Check npm for a newer helper" under Advanced settings, to read the published
  version of the helper package. Not granted at install; off by default. Only the version
  number is read — no personal data is sent.

## Privacy
Privacy policy URL: **https://lusk.dev/browser-organizer/privacy** (source: `docs/privacy.html`).
Contact email: **hello@lusk.dev**. Enter both in the store's privacy/contact fields.
Tab titles and URLs (query strings/fragments stripped, private/loopback hosts coarsened to
origin, embedded credentials removed) are sent to your AI provider under your own
subscription, via your local helper. Bookmarks and history are never sent anywhere. No data
ever reaches the extension developer's servers; we operate none.

## Notes for reviewers (IMPORTANT — read before testing)
This extension is the front-end for a **local companion helper** ("native messaging host")
that runs the user's own AI CLI. Because a native host cannot be distributed inside a store
package, the helper is installed once, separately, by the user:

1. Until the helper is installed, the side panel shows an onboarding card with the exact
   one-line command to run — the extension loads and is safe, but analysis is inactive.
2. After the one-time install, all features work. To exercise functionality during review,
   install the helper the easy way — with Node 20+ present, run
   `npx @lusktech/browser-organizer-host` (works from any directory) — or run the per-OS
   installer from the releases page (no Node required). See `INSTALL.md`.

Key safety facts:
- **No developer servers exist.** Tab titles/URLs go only to the *user's own* AI provider via
  the *user's own* subscription; bookmarks/history stay on-device.
- `nativeMessaging` is used **solely** to talk to that local helper. The helper runs only a
  fixed set of known CLIs (or an HTTPS OpenAI-compatible endpoint); the command, arguments,
  and credentials are resolved host-side and can never be supplied by the extension/a web
  page. See [`security-model.md`](security-model.md).
- The `key` field pins the extension ID so the helper's `allowed_origins` stays valid across
  builds — please keep the assigned ID stable.

## Version history
- **0.1.0** (2026-07-11) — Initial submission. Tab grouping, stale-tab detection, bookmark
  cleanup (duplicate/stale/dead-link), auto-bookmarking, per-window scope, natural-language
  commands, sessions, scheduled auto-mode with undo. Six CLI backends + OpenAI-compatible API.

## Store assets still required (not in this repo)
- [x] Real 16/48/128 px icons in `extension/icons/` and referenced in manifest (`npm run icons`)
- [x] Upload zip built from `extension/` only (`npm run package` → `dist/`)
- [ ] Store icon shown on the listing page (128×128 — reuse `icons/icon-128.png`)
- [ ] At least one screenshot at 1280×800 or 640×400 (side panel with suggestions)
- [ ] Deploy `docs/privacy.html` to https://lusk.dev/browser-organizer/privacy; enter it +
      hello@lusk.dev in the store, and fill the data-use form
- [ ] Chrome Web Store developer account ($5 one-time) / Edge Partner Center account (free)
- [ ] After first publish, confirm the store-assigned extension ID matches the `key`-derived ID
      so the native host `allowed_origins` remains correct
