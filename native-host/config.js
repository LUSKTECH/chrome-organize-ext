import os from 'node:os';

const DEFAULT_TIMEOUT = 120000;
const MAX_TIMEOUT = 300000;
const MIN_TIMEOUT = 1000;

// The CLI binary is resolved from a host-controlled env var (set by the
// installer) or defaults to the PATH lookup 'claude'. NEVER from a message.
export function resolveCommand() {
  return process.env.BROWSER_ORGANIZER_CLI || 'claude';
}

export function resolveArgs() {
  return ['-p', '--output-format', 'json', '--allowedTools', ''];
}

// A private, per-run working directory (mode 0700) — created by the adapter.
export function tmpBase() {
  return os.tmpdir();
}

// A minimal, host-controlled environment for spawned CLIs: always PATH and HOME
// (needed for PATH resolution and persisted login credentials), plus any named
// auth vars the adapter declares (e.g. GEMINI_API_KEY, KIRO_API_KEY). Env is
// never taken from an extension message.
export function hostEnv(extraNames = []) {
  const env = {};
  if (process.env.PATH !== undefined) env.PATH = process.env.PATH;
  if (process.env.HOME !== undefined) env.HOME = process.env.HOME;
  for (const name of extraNames) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  return env;
}

// Only a bounded timeout may come from the message; everything else is discarded.
// Out-of-range/invalid values fall back to the default; values above the max
// are clamped down to the max (deviation from the plan's draft implementation,
// which clamped low values up to MIN_TIMEOUT instead of falling back to the
// default — that contradicted the plan's own test expectations).
export function sanitizeOptions(raw) {
  const t = Number(raw && raw.timeoutMs);
  if (!Number.isFinite(t) || t < MIN_TIMEOUT) return { timeoutMs: DEFAULT_TIMEOUT };
  return { timeoutMs: Math.min(MAX_TIMEOUT, t) };
}
