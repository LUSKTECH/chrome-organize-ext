// GitHub Copilot CLI adapter (`copilot`).
//
// `copilot -p "<prompt>" -s --no-ask-user` runs non-interactively and prints
// plain text (`-s` quiets it, `--no-ask-user` prevents pauses), so we return raw
// stdout and let the dispatcher extract the JSON the prompt requested. Auth
// reuses your Copilot subscription via COPILOT_GITHUB_TOKEN / GH_TOKEN /
// GITHUB_TOKEN, or the OAuth token from an existing `gh` login — never inline.

import { runCli, cliVersion } from './run-cli.js';
import { hostEnv } from '../config.js';

const ENV_VAR = 'BROWSER_ORGANIZER_COPILOT_CMD';
const AUTH_ENV = ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'];

export function resolveCommand() {
  return process.env[ENV_VAR] || 'copilot';
}

export const copilotAdapter = {
  name: 'copilot',
  async run(prompt, opts = {}) {
    const out = await runCli({
      command: resolveCommand(),
      args: ['-p', prompt, '-s', '--no-ask-user'],
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
