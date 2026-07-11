# Security Model — Browser Organizer

- **CLI command is host-controlled.** Each adapter (claude / antigravity / kiro)
  resolves its binary from its own environment override (`BROWSER_ORGANIZER_CLI`,
  `BROWSER_ORGANIZER_ANTIGRAVITY_CMD`, `BROWSER_ORGANIZER_KIRO_CMD`) or PATH, and
  uses fixed arguments. The host never accepts an executable path, arguments, or
  environment from an extension message — only a bounded `timeoutMs` and an
  adapter *name* that selects from a fixed registry. The message can pick *which*
  known CLI runs, never *what command* runs.
- **Spawn environment is a controlled allowlist.** Adapters run with only PATH,
  HOME, and a small set of declared auth vars (e.g. `GEMINI_API_KEY`,
  `KIRO_API_KEY`) passed through from the host's own environment — never from a
  message.
- **Native host is a local executable.** Any local process can, in principle, speak
  the native-messaging protocol to `run.sh`. Because the host can only run the fixed
  CLI with fixed arguments over a private temp dir with tools disabled, the blast
  radius is limited to "ask the CLI a question." Keep `run.sh` permissions at 0700.
- **Untrusted input.** Tab titles/URLs are treated as data, not instructions, in
  prompts, and model-returned tab ids are constrained to the exact candidates sent.
- **Data sent to the AI provider.** Tab titles and URLs (query strings/fragments
  stripped) are sent to your CLI's provider under your subscription. Bookmarks and
  history are processed locally and are not sent.
