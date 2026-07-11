// OpenAI Codex CLI adapter (`codex`).
//
// `codex exec "<prompt>"` runs the agent headlessly and prints its final message
// as plain text (no interactive TUI). `--skip-git-repo-check` avoids the git-repo
// requirement since we run in a private temp dir. We return raw stdout and let
// the dispatcher extract the JSON the prompt requested. Auth uses your persisted
// ChatGPT login (Plus/Pro/Business) or OPENAI_API_KEY / CODEX_API_KEY — never inline.

import { runCli, cliVersion } from './run-cli.js';
import { hostEnv } from '../config.js';

const ENV_VAR = 'BROWSER_ORGANIZER_CODEX_CMD';
const AUTH_ENV = ['OPENAI_API_KEY', 'CODEX_API_KEY'];

export function resolveCommand() {
  return process.env[ENV_VAR] || 'codex';
}

export const codexAdapter = {
  name: 'codex',
  async run(prompt, opts = {}) {
    const out = await runCli({
      command: resolveCommand(),
      args: ['exec', '--skip-git-repo-check', prompt],
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
