# Testing Browser Organizer (before it's on the store)

Browser Organizer isn't on the Chrome Web Store / Edge Add-ons yet, so testers load it
**unpacked**. The steps are the same on **Windows, macOS, and Linux**.

It has two parts: the **extension** (loads into the browser) and a small **local helper**
(runs your chosen AI backend on your machine). You need both.

Requirements: Chrome, Chromium, or Edge, and — for the easiest helper install —
[Node.js 20+](https://nodejs.org).

---

## 1. Get the files

- **`git clone https://github.com/LUSKTECH/browser-organizer`**, or
- once a release is published, download **`browser-organizer-selfhost-<version>.zip`** from the
  [Releases page](https://github.com/LUSKTECH/browser-organizer/releases) and unzip it (it
  contains both `extension/` and the helper).

## 2. Load the extension (any OS)

1. Open **`chrome://extensions`** (Chrome/Chromium) or **`edge://extensions`** (Edge).
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the **`extension/`** folder.

The extension loads with a fixed ID (pinned in the manifest), so the helper in the next step
finds it automatically. macOS/Linux/Windows all use this same `chrome://extensions` flow.

## 3. Install the local helper

Pick one (all cross-platform):

- **Easiest — one command (needs Node 20+), works today:**
  ```
  npx @lusktech/browser-organizer-host
  ```
- **From your clone (no npm):** `node native-host/installer.js`
- **A native package (once a release is published):** download your OS's file from the
  [Releases page](https://github.com/LUSKTECH/browser-organizer/releases):
  - Windows: `browser-organizer-<ver>-windows-x64-setup.exe`
  - macOS: `browser-organizer-<ver>-macos-arm64.pkg`
  - Linux: `browser-organizer-host_<ver>_amd64.deb` / `…-1.x86_64.rpm`, or the portable
    `browser-organizer-host-<ver>-linux-install.sh`

## 4. Pick a backend, then analyze

Open the side panel (toolbar icon) → **Settings → AI backend**. Simplest for testing:

- **OpenAI-compatible API** — paste an API key (stored encrypted, on your device only), or
- **Ollama** — fully local/offline, no key, or
- a local AI CLI (Claude Code, Antigravity, Kiro, Copilot, Codex).

Click the reload/recheck icon in the panel; it should read "… connected". Then hit
**Analyze my tabs & bookmarks**. Every change is a suggestion you approve (all undoable).

---

## Linux testers

- Works with Chrome, Chromium, and Edge on Linux.
- The `.deb`/`.rpm` register the helper **system-wide** (all users on the machine); `npx`,
  `install.sh`, and `node native-host/installer.js` are **per-user**.

## When you're done

- Remove the helper: `npx @lusktech/browser-organizer-host uninstall` (or uninstall the
  package / run `node native-host/installer.js uninstall`).
- Remove the extension from `chrome://extensions` (or `edge://extensions`).

For the full reference (per-OS installers, admin MSI, etc.) see [INSTALL.md](INSTALL.md).
