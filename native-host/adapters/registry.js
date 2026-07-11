import { claudeAdapter } from './claude.js';
import { antigravityAdapter } from './antigravity.js';
import { kiroAdapter } from './kiro.js';

const ADAPTERS = new Map([
  [claudeAdapter.name, claudeAdapter],
  [antigravityAdapter.name, antigravityAdapter],
  [kiroAdapter.name, kiroAdapter],
]);

export function getAdapter(name) {
  const a = ADAPTERS.get(name);
  if (!a) throw new Error(`Unknown adapter: ${name}`);
  return a;
}

export function registerAdapter(adapter) {
  ADAPTERS.set(adapter.name, adapter);
}
