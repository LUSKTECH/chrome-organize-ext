# Installing Browser Organizer

Browser Organizer has two parts:
1. **The extension** — loads into Chrome or Edge.
2. **A local helper** ("native host") — a small program on your computer that runs your AI
   backend. The extension talks to it; **nothing is sent to any server we run.**

You install both once. Pick the backend that suits you — the easiest is an **OpenAI-compatible
API key** (no CLI to install); power users can point it at a local AI CLI instead.

---

## Step 1 — Install the extension

**Chrome / Edge (unpacked, from this repo or the self-host bundle):**
1. Download and unzip the self-host bundle (or clone this repo).
2. Open `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select the `extension/` folder.
5. Note the extension **ID** shown on its card — you'll need it in Step 2.
   (The ID is stable because the manifest pins it, so it won't change on reload.)

_(When published, this step becomes a one-click install from the Web Store / Edge Add-ons.)_

## Step 2 — Install the local helper

You need [Node.js 20+](https://nodejs.org) on your PATH for this step.

From the project folder, run (substitute your extension ID from Step 1):

```
npm run install-host <EXTENSION_ID> chrome,edge
```

This registers the helper for the browsers you list (`chrome`, `edge`, `chromium`). To remove
it later:

```
npm run install-host uninstall chrome,edge
```

## Step 3 — Choose and configure a backend

Open the extension's side panel (click the toolbar icon) → **Settings → AI backend**.

**Easiest — OpenAI-compatible API (no CLI):**
Set these in the environment the browser is launched from, then reopen the panel:
- `BROWSER_ORGANIZER_OPENAI_API_KEY` — your key (required)
- `BROWSER_ORGANIZER_OPENAI_BASE_URL` — optional (default `https://api.openai.com/v1`; point at
  OpenRouter, Groq, or a local LM Studio/vLLM server if you prefer)
- `BROWSER_ORGANIZER_OPENAI_MODEL` — optional (default `gpt-4o-mini`)

**Power users — a local AI CLI:**
Install and sign into one of: Claude Code (`claude`), Antigravity (`agy`), Kiro (`kiro-cli`),
GitHub Copilot (`copilot`), OpenAI Codex (`codex`), or Ollama (fully local). Select it in
Settings. See `README.md` → **AI backends** for the exact command/auth per CLI.

## Step 4 — Use it

Click **Analyze my tabs & bookmarks**, review the suggestions, and apply the ones you want
(everything is undoable). Or type a request like `org close everything about travel` in the
address bar, or enable scheduled auto-mode in Settings.

---

## Privacy & safety
- Tab titles and URLs (query strings/fragments stripped, private hosts coarsened, embedded
  credentials removed) are sent **only** to the AI provider you configured, under your own
  subscription/key. Bookmarks and history never leave your machine.
- The helper only ever runs the fixed backend you selected; the command, arguments, and
  credentials are resolved on your machine and can't be supplied by a web page or the
  extension. See `SECURITY.md`.

## Troubleshooting
- **Panel says it can't reach the helper** — re-run Step 2 with the correct extension ID,
  then click the reload icon on the extension and reopen the panel.
- **Panel says the backend didn't start** — for a CLI, confirm `"<cli> --version"` works in a
  terminal; for the API backend, confirm the env vars above are set where the browser launches.
