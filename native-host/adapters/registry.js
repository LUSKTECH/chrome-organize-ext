import { claudeAdapter } from './claude.js';
import { antigravityAdapter } from './antigravity.js';
import { kiroAdapter } from './kiro.js';
import { copilotAdapter } from './copilot.js';
import { codexAdapter } from './codex.js';
import { ollamaAdapter } from './ollama.js';
import { openaiAdapter } from './openai.js';

const ADAPTERS = new Map([
  [claudeAdapter.name, claudeAdapter],
  [antigravityAdapter.name, antigravityAdapter],
  [kiroAdapter.name, kiroAdapter],
  [copilotAdapter.name, copilotAdapter],
  [codexAdapter.name, codexAdapter],
  [ollamaAdapter.name, ollamaAdapter],
  [openaiAdapter.name, openaiAdapter],
]);

export function getAdapter(name) {
  const a = ADAPTERS.get(name);
  if (!a) throw new Error(`Unknown adapter: ${name}`);
  return a;
}

// The registered adapter names, for the capability handshake (dispatch.js).
export function adapterNames() {
  return [...ADAPTERS.keys()];
}

// Test seam: lets tests inject a fake adapter. Not used by production code.
export function registerAdapter(adapter) {
  ADAPTERS.set(adapter.name, adapter);
}
