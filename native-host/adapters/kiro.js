// Kiro CLI adapter — AWS Kiro's terminal agent.
//
// `kiro-cli chat --no-interactive "<prompt>"` runs headlessly and prints plain
// text, so we return raw stdout and let the dispatcher's JSON parser extract the
// JSON the prompt requested. The prompt is passed as an argument (Kiro reads its
// instruction from argv; stdin is treated as extra context). We deliberately do
// NOT pass --trust-all-tools: this is a read-only categorization request.
// Headless auth uses KIRO_API_KEY (a subscription-scoped key for Kiro Pro+).

import { runCli, cliVersion } from './run-cli.js';
import { hostEnv } from '../config.js';

const ENV_VAR = 'BROWSER_ORGANIZER_KIRO_CMD';
const AUTH_ENV = ['KIRO_API_KEY'];

// Host-controlled binary resolution: env override or the default on PATH.
export function resolveCommand() {
  return process.env[ENV_VAR] || 'kiro-cli';
}

export const kiroAdapter = {
  name: 'kiro',
  async run(prompt, opts = {}) {
    const out = await runCli({
      command: resolveCommand(),
      args: ['chat', '--no-interactive', prompt],
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
