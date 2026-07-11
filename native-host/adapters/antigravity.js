// Antigravity CLI adapter (`agy`) — Google's successor to gemini-cli.
//
// `agy -p "<prompt>"` runs non-interactively and prints PLAIN TEXT (there is no
// command-line JSON output mode yet), so we return the raw stdout and let the
// dispatcher's JSON parser extract the JSON the prompt asked the model to emit.
// `--yes` auto-approves, `--no-color` keeps ANSI escapes out of the output.
// Auth uses the user's persisted `agy` login (subscription) or, if set,
// GEMINI_API_KEY / ANTIGRAVITY_API_KEY — never an inline key.

import { runCli, cliVersion } from './run-cli.js';
import { hostEnv } from '../config.js';

const ENV_VAR = 'BROWSER_ORGANIZER_ANTIGRAVITY_CMD';
const AUTH_ENV = ['GEMINI_API_KEY', 'ANTIGRAVITY_API_KEY'];

// Host-controlled binary resolution: env override or the default on PATH.
export function resolveCommand() {
  return process.env[ENV_VAR] || 'agy';
}

export const antigravityAdapter = {
  name: 'antigravity',
  async run(prompt, opts = {}) {
    const out = await runCli({
      command: resolveCommand(),
      args: ['-p', prompt, '--yes', '--no-color'],
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
