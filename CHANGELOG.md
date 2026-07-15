# Changelog

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
