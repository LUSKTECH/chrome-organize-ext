import { runCli, cliVersion } from './run-cli.js';
import { hostEnv, overrideArgs, extraArgs } from '../config.js';

// Factory for the plain "spawn a CLI, pass the prompt on argv, return stdout"
// adapters: codex, copilot, kiro, antigravity. (claude and ollama are bespoke —
// claude toggles MCP/plugin flags and unwraps a JSON envelope; ollama resolves a
// model and pipes the prompt on stdin.)
//
// promptFlag controls how the prompt is delivered:
//   null      → the prompt is a trailing positional arg      (codex, kiro)
//   '-p' etc. → the prompt is passed as `<flag> <prompt>`     (copilot, antigravity)
// extraArgs are always placed BEFORE the prompt (and before the prompt flag), so
// a user's advanced flag can never be consumed as the prompt-flag's value or
// shove the prompt into a stray positional — which is what happened when the
// prompt flag lived at the end of DEFAULT_ARGS and extraArgs were spliced after it.
export function makeCliAdapter({ name, cmdEnv, defaultCmd, argsEnv, defaultArgs, authEnv = [], promptFlag = null, allowedExtraFlags = {} }) {
  const resolveCommand = () => process.env[cmdEnv] || defaultCmd;
  return {
    name,
    allowedExtraFlags,
    resolveCommand,
    async run(prompt, opts = {}) {
      const promptTail = promptFlag ? [promptFlag, prompt] : [prompt];
      const out = await runCli({
        command: resolveCommand(),
        args: [...overrideArgs(argsEnv, defaultArgs), ...extraArgs(opts), ...promptTail],
        usesStdin: false,
        env: hostEnv(authEnv),
        timeoutMs: opts.timeoutMs,
        spawnFn: opts.spawnFn,
      });
      return String(out).trim();
    },
    async health(opts = {}) {
      return cliVersion({ command: resolveCommand(), env: hostEnv(authEnv), spawnFn: opts.spawnFn });
    },
  };
}
