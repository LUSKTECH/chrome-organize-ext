// GitHub Copilot CLI adapter (`copilot`).
//
// `copilot -p "<prompt>" -s --no-ask-user` runs non-interactively and prints
// plain text (`-s` quiets it, `--no-ask-user` prevents pauses), so we return raw
// stdout and let the dispatcher extract the JSON the prompt requested. Auth
// reuses your Copilot subscription via COPILOT_GITHUB_TOKEN / GH_TOKEN /
// GITHUB_TOKEN, or the OAuth token from an existing `gh` login — never inline.

// SECURITY: Copilot CLI is agentic. `--no-ask-user` prevents interactive pauses
// but the tool policy is the CLI's default — this adapter is LOWER-ASSURANCE than
// claude/ollama. Lock it down for your Copilot CLI version by overriding
// BROWSER_ORGANIZER_COPILOT_ARGS with an explicit tool-deny/read-only flag list.

import { runCli, cliVersion } from './run-cli.js';
import { hostEnv, overrideArgs, extraArgs } from '../config.js';

const ENV_VAR = 'BROWSER_ORGANIZER_COPILOT_CMD';
const ARGS_VAR = 'BROWSER_ORGANIZER_COPILOT_ARGS';
const DEFAULT_ARGS = ['-s', '--no-ask-user', '-p']; // prompt appended last (value of -p)
const AUTH_ENV = ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'];

export function resolveCommand() {
  return process.env[ENV_VAR] || 'copilot';
}

export const copilotAdapter = {
  name: 'copilot',
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
