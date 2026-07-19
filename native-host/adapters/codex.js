// OpenAI Codex CLI adapter (`codex`).
//
// `codex exec "<prompt>"` runs the agent headlessly and prints its final message
// as plain text (no interactive TUI). `--skip-git-repo-check` avoids the git-repo
// requirement since we run in a private temp dir. We return raw stdout and let
// the dispatcher extract the JSON the prompt requested. Auth uses your persisted
// ChatGPT login (Plus/Pro/Business) or OPENAI_API_KEY / CODEX_API_KEY — never inline.

// SECURITY: codex exec is agentic. We pin `--sandbox read-only` so a prompt-
// injected tab title cannot make it write files or run networked commands.
// (read-only still permits local reads — tighten via BROWSER_ORGANIZER_CODEX_ARGS
// against your codex version if needed.)

import { runCli, cliVersion } from './run-cli.js';
import { hostEnv, overrideArgs, extraArgs } from '../config.js';

const ENV_VAR = 'BROWSER_ORGANIZER_CODEX_CMD';
const ARGS_VAR = 'BROWSER_ORGANIZER_CODEX_ARGS';
const DEFAULT_ARGS = ['exec', '--sandbox', 'read-only', '--skip-git-repo-check']; // prompt appended last
const AUTH_ENV = ['OPENAI_API_KEY', 'CODEX_API_KEY'];

export function resolveCommand() {
  return process.env[ENV_VAR] || 'codex';
}

export const codexAdapter = {
  name: 'codex',
  // Advanced-settings flags the extension may add (config.sanitizeCli). Only model
  // selection — nothing that can override this adapter's sandbox/safety flags.
  allowedExtraFlags: { '--model': 'value' },
  async run(prompt, opts = {}) {
    const out = await runCli({
      command: resolveCommand(),
      args: [...overrideArgs(ARGS_VAR, DEFAULT_ARGS), ...extraArgs(opts), prompt],
      usesStdin: false,
      env: hostEnv(AUTH_ENV),
      timeoutMs: opts.timeoutMs,
      spawnFn: opts.spawnFn,
    });
    return String(out).trim();
  },
  async health(opts = {}) {
    return cliVersion({ command: resolveCommand(), env: hostEnv(AUTH_ENV), spawnFn: opts.spawnFn });
  },
};
