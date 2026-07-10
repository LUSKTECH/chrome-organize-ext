import { getAdapter as defaultGetAdapter } from './adapters/registry.js';
import { buildGroupPrompt, buildStalePrompt, buildImportantPrompt } from './prompts.js';
import { parseGroupResult, parseStaleResult, parseImportantResult } from './parse.js';

export async function handle(msg, deps = {}) {
  const getAdapter = deps.getAdapter || defaultGetAdapter;
  const adapter = getAdapter(msg.adapter || 'claude');
  const opts = msg.cliOptions || {};

  if (msg.type === 'health') {
    return { adapter: adapter.name, ready: true };
  }

  if (msg.type === 'organize') {
    const { task, payload } = msg;
    if (task === 'group') {
      const out = await adapter.run(buildGroupPrompt(payload.tabs), opts);
      return { task, groups: parseGroupResult(out) };
    }
    if (task === 'stale') {
      const out = await adapter.run(buildStalePrompt(payload.tabs, payload.thresholdDays), opts);
      return { task, stale: parseStaleResult(out) };
    }
    if (task === 'important') {
      const out = await adapter.run(buildImportantPrompt(payload.tabs), opts);
      return { task, important: parseImportantResult(out) };
    }
    throw new Error(`Unknown task: ${task}`);
  }

  throw new Error(`Unknown message type: ${msg.type}`);
}
