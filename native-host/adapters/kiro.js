// Kiro CLI adapter — AWS Kiro's terminal agent.
//
// `kiro-cli chat --no-interactive "<prompt>"` runs headlessly and prints plain
// text, so we return raw stdout and let the dispatcher's JSON parser extract the
// JSON the prompt requested. The prompt is passed as an argument (Kiro reads its
// instruction from argv; stdin is treated as extra context). SECURITY: we pass
// `--trust-tools=` (empty) to explicitly trust NO tools, so a prompt-injected
// tab title cannot get Kiro to run commands or touch the filesystem. Headless
// auth uses KIRO_API_KEY (a subscription-scoped key for Kiro Pro+).

import { runCli, cliVersion } from './run-cli.js';
import { hostEnv, overrideArgs, extraArgs } from '../config.js';

const ENV_VAR = 'BROWSER_ORGANIZER_KIRO_CMD';
const ARGS_VAR = 'BROWSER_ORGANIZER_KIRO_ARGS';
const DEFAULT_ARGS = ['chat', '--no-interactive', '--trust-tools=']; // prompt appended last
const AUTH_ENV = ['KIRO_API_KEY'];

// Host-controlled binary resolution: env override or the default on PATH.
export function resolveCommand() {
  return process.env[ENV_VAR] || 'kiro-cli';
}

export const kiroAdapter = {
  name: 'kiro',
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
