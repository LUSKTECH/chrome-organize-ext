# Browser Organizer

A Chrome/Edge extension that uses your **local Claude CLI subscription** (no API key)
to group open tabs by topic, close forgotten tabs, auto-bookmark important ones, and
clean up stale/dead/duplicate bookmarks. All page/tab/bookmark data stays on your machine.

## Requirements
- Node.js 20+
- The `claude` CLI installed and signed in (`claude` runs headless via `claude -p`)
- Chrome 116+ or Edge (Chromium)

## Install (developer / unpacked)
1. Load the extension:
   - Chrome: `chrome://extensions` → Developer mode → **Load unpacked** → select `extension/`
   - Edge: `edge://extensions` → Developer mode → **Load unpacked** → select `extension/`
   Note the extension ID (identical in both browsers thanks to the pinned key).
2. Register the native messaging host (lets the extension call your CLI):
   ```
   npm run install-host <EXTENSION_ID> chrome,edge
   ```
3. Open the side panel (toolbar icon) and click **Analyze my tabs & bookmarks**.

## How it works
The extension collects tab/bookmark metadata and sends it to a small local Node host
over Chrome Native Messaging. The host runs `claude -p --output-format json` to get
organization suggestions, then returns them. Nothing is sent to any server other than
your own CLI's normal subscription traffic. Destructive actions require your approval
(or, in auto mode, are logged for one-click undo).

## Development
- `npm test` — run the unit suite (`node --test`, no browser needed)

## End-to-end tests
`npm run e2e` runs the Playwright behavioral suite (`e2e/`), which loads the real
extension into Chrome for Testing, drives the side panel, and exercises the full
pipe including the native `claude` bridge. Deterministic specs (no CLI) plus
CLI-backed specs (marked *CLI*, skippable):
- **health** — the panel reports the CLI connected
- **duplicate-tabs** — detects a duplicate open tab, closes it on apply, restores it on undo
- **sessions** — saves the current window as a session (closing its tabs) and restores them
- **bookmark-cleanup** — detects a duplicate bookmark, deletes it on apply, restores it on undo
- **dom-panel** — drives the real UI: the *Clean bookmarks* button + *Apply all* + toast *Undo*; editing a proposed group (rename, drop a tab) and *Apply this group*; the settings form persisting
- **auto-apply** — `onInstalled` schedules the alarms; auto mode auto-applies tab actions but never auto-deletes bookmarks
- **grouping** *(CLI)* — asks Claude to cluster tabs and asserts a real Chrome tab group forms
- **command** *(CLI)* — a natural-language instruction returns an actionable plan
- **stale-tabs** *(CLI)* — seeds a long-idle tab and asserts Claude proposes closing/suspending it

Dead-link detection's HTTP logic is covered by a real-server integration test
(`test/dead-link-integration.test.js`, part of `npm test`). The full in-browser
dead-link flow isn't automated because granting the optional `<all_urls>`
permission requires a Chrome permission prompt that can't be accepted headlessly.

Requirements (Linux/WSL/CI): `claude` on PATH, and `xvfb` (the `e2e` script wraps
the run in `xvfb-run` for a headless virtual display). Google Chrome's branded
builds no longer allow `--load-extension`, so the suite uses Playwright's bundled
Chromium (Chrome for Testing); install it once with `npx playwright install chromium`.
Set `BORG_SKIP_CLI=1` to skip the CLI-dependent grouping test in offline/fast CI.
The fixture registers the native host automatically — no manual `install-host` step.
