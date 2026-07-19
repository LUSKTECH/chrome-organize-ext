# Changelog

## 0.1.5 — 2026-07-19
Security hardening of the native host + an extension-only extensibility path.

**Security**
- **`extraArgs` is now a per-adapter allowlist, not a denylist.** A compromised extension
  could previously slip short/config flags past the denylist (e.g. codex `-s danger-full-access`
  or `-c sandbox_mode=…`) and override an agentic CLI's single safety flag. Only each adapter's
  explicitly-allowed flags are accepted now, and a value flag's value may not itself start with
  `-` (no flag smuggling).
- **OpenAI adapter no longer sends the host's env API key to a message-supplied base URL.** That
  combination could exfiltrate an operator-configured key; the endpoint and key must now come
  from the same source.
- A malformed message (`null` / non-object frame) is rejected cleanly instead of crashing the
  host, and top-level `unhandledRejection`/`uncaughtException` guards keep the connection alive.

**Robustness**
- `stderr` is size-capped (was unbounded); on timeout the whole process tree is killed on POSIX
  (not just the direct child); concurrent in-flight requests are capped.

**Extensibility**
- New `prompt` passthrough task: the extension can run a client-supplied prompt and get the raw
  (optionally JSON-parsed) model output back, so new AI features ship without a host edit.
- The health response now advertises `capabilities` (types, tasks, passthrough, adapters) so the
  extension can feature-detect instead of probing for "Unknown task" errors.

## 0.1.4 — 2026-07-19
Organize fixes for Edge + Advanced settings.

**Fixes**
- **Organize now works on Edge (and any Chromium with non-Chrome root ids).** Root folder
  ids are read from the live tree instead of assuming Chrome's `1/2/3` — Edge's "Other
  favourites" is `203` (plus a `722` "Workspaces" root), so its loose bookmarks were being
  skipped. New folders now land under the real "Other bookmarks" root.
- Move suggestions show their **destination folder as a chip** (leaf name, full path on hover)
  instead of a redundant sentence.
- Organize no longer reports a misleading "looks tidy" when it actually produced nothing —
  it says why (no candidates / model returned nothing / moves matched no bookmark / all moves
  skipped by a protection / the helper is out of date).

**Features**
- **Advanced settings** (warning-gated): debug logging; Claude "Load MCP servers" / "Load
  plugins & settings" toggles (default off = faster, side-effect-free, OAuth login intact);
  and a per-backend **extra CLI flags** field for CLI flag changes or obscure CLIs. Flags are
  validated host-side against a denylist (tool/file/permission grants, sandbox, mcp-config,
  plugins/settings, `--bare`, etc. are rejected).

## 0.1.3 — 2026-07-16
- **Show the host bridge version in the panel.** The connection banner now reads
  e.g. "Claude CLI connected (2.1.209) · bridge v0.1.3", so you can confirm which
  native-host version the extension is actually talking to (the CLI version and
  the bridge version were previously indistinguishable). The host reports its own
  version in the `health` response.

## 0.1.2 — 2026-07-16
Organize bookmarks into folders (AI), plus bookmark-cleanup status grouping.

**Features**
- **Organize/categorize bookmarks into folders** with your chosen method: *match* (sort into
  existing folders only, no new folders), *additive* (keep existing folders, add category
  folders, sort loose bookmarks), or *full* (reorganize everything, including already-filed
  bookmarks). New folders are created under "Other Bookmarks".
- Protections, enforced in code (not left to the model): the **Bookmarks Bar is never touched**
  by default, whitelisted folders and their contents are never touched, and empty folders can
  optionally be removed after sorting. Every move/removal is a reviewable, undoable suggestion.
- Bookmark cleanup can now be **grouped by status** (Not found 404 / Gone 410 / Unreachable /
  Duplicate / Not visited) via a panel toggle; the dead-link check records the real HTTP status.

**Host**
- New native-host task `organize-bookmarks` (prompt + parser). Additive: existing tasks are
  unchanged. An older host paired with the new extension simply skips the organize scan.
- New reversible actions `moveBookmark` and `removeFolder` (empty-guarded).

## 0.1.1 — 2026-07-15
Host package fixes.
- **Windows: `npx` install now registers the native host.** The `bin` (`cli.js`) skipped the
  `reg add` step, so on Windows the manifest was written but never registered — the browser
  (which finds native hosts via the registry there) couldn't reach it. `install`/`repair`/
  `uninstall` now run the registry commands via a shared `runRegistryCommands` helper.
- Corrected the npm package `homepage` (lusk.dev) and `repository` URL
  (`LUSKTECH/browser-organizer`) — the 0.1.0 metadata pointed at the old domain/repo name.
- Fixed CI: `esbuild`/`postject` are fetched on demand via `npx` in `build:sea`, so they were
  removed from `devDependencies` (they had desynced `package-lock.json` and broken `npm ci`);
  their versions are now pinned in `scripts/build-sea.mjs`.

## 0.1.0 — 2026-07-14
First release.

**Features**
- Group open tabs by topic; detect forgotten/stale tabs (close or suspend, saving important
  ones first); auto-bookmark useful pages into tidy folders; clean duplicate/stale/dead
  bookmarks.
- Duplicate open-tab detection (local, no AI). Per-window or all-windows scope.
- Natural-language commands (side panel + `org` omnibox keyword). Save/restore named sessions.
- Scheduled auto-mode with one-click undo and an undo-history dialog. Whitelist + "never
  suggest this" learning.
- Six local AI CLI backends (Claude Code, Antigravity, Kiro, Copilot, Codex, Ollama) plus a
  host-side OpenAI-compatible API backend (OpenAI/OpenRouter/Groq/LM Studio/vLLM).

**Distribution**
- The helper installs into a stable per-user home (`~/.browser-organizer`,
  `%LOCALAPPDATA%\BrowserOrganizer`) with the browser manifest pointing there — the
  repo/bundle/npx cache can be deleted after install. `install`/`repair`/`uninstall`.
- Directory-independent install for technical users: `npx @lusktech/browser-organizer-host`
  (dependency-free npm package). The extension ID is baked in, so no arguments are needed.
- Standalone path for non-technical users: a Node SEA binary (`npm run build:sea`) that
  self-registers via `--install`/`--uninstall`, per-OS installer sources under `installer/`
  (Inno Setup / `.pkg` / `.deb`/`.rpm` / portable `install.sh`), and a signed/notarized
  release CI matrix (`.github/workflows/release-host.yml`).

**Quality / security**
- Full security + concurrency audit remediation: serialized storage read-modify-write,
  single-flight scans, incremental undo persistence, native-host stdin-crash guard, URL
  credential/redaction hardening, SSRF guard for dead-link checks, no-shell installer.
- 256 unit tests + 21 Playwright E2E; ESLint (security-first `no-unsanitized`) gate; CI.

**Packaging**
- Store zip (`npm run package`) and self-host bundle (`npm run package:selfhost`).
- Generated 16/48/128 icons; native-host `install`/`repair`/`uninstall` support.
