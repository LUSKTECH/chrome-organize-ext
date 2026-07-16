import { getAdapter as defaultGetAdapter } from './adapters/registry.js';
import { buildGroupPrompt, buildStalePrompt, buildImportantPrompt, buildCommandPrompt, buildOrganizePrompt } from './prompts.js';
import { parseGroupResult, parseStaleResult, parseImportantResult, parseCommandResult, parseOrganizeResult } from './parse.js';
import { sanitizeOptions, sanitizeConfig } from './config.js';

export async function handle(msg, deps = {}) {
  const getAdapter = deps.getAdapter || defaultGetAdapter;
  const adapter = getAdapter(msg.adapter || 'claude');
  // opts.config carries the openai adapter's UI-entered key/base/model (if any);
  // sanitizeConfig guarantees it's just those three strings, nothing executable.
  // Only attach it when present so other adapters' opts stay {timeoutMs} exactly.
  const opts = sanitizeOptions(msg.cliOptions);
  const cfg = sanitizeConfig(msg.config);
  if (cfg) opts.config = cfg;

  if (msg.type === 'health') {
    try {
      const info = await adapter.health(opts);
      return { adapter: adapter.name, ready: true, version: info.version };
    } catch (err) {
      return { adapter: adapter.name, ready: false, error: String((err && err.message) || err) };
    }
  }

  if (msg.type === 'organize') {
    const { task, payload } = msg;
    const rules = payload.rules || '';
    if (task === 'group') {
      const out = await adapter.run(buildGroupPrompt(payload.tabs, rules), opts);
      return { task, groups: parseGroupResult(out) };
    }
    if (task === 'stale') {
      const out = await adapter.run(buildStalePrompt(payload.tabs, payload.thresholdDays, rules), opts);
      return { task, stale: parseStaleResult(out) };
    }
    if (task === 'important') {
      const out = await adapter.run(buildImportantPrompt(payload.tabs, rules), opts);
      return { task, important: parseImportantResult(out) };
    }
    if (task === 'organize-bookmarks') {
      const out = await adapter.run(buildOrganizePrompt(payload.bookmarks, payload.folders, payload.mode, rules), opts);
      return { task, moves: parseOrganizeResult(out) };
    }
    throw new Error(`Unknown task: ${task}`);
  }

  if (msg.type === 'command') {
    const out = await adapter.run(buildCommandPrompt(msg.payload.instruction, msg.payload.tabs, msg.payload.rules || ''), opts);
    return parseCommandResult(out);
  }

  throw new Error(`Unknown message type: ${msg.type}`);
}
