import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { claudeAdapter } from '../native-host/adapters/claude.js';
import { resolveArgs } from '../native-host/config.js';

test('adapter runs in a private per-run dir under tmp, not tmp root, and disables tools', async () => {
  let seen = null;
  const spawnFn = (command, args, options) => {
    seen = { command, args, cwd: options.cwd };
    const child = { stdout: { on() {} }, stderr: { on() {} }, on(ev, cb) { if (ev === 'close') setTimeout(() => cb(0), 0); }, stdin: { write() {}, end() {} }, kill() {} };
    return child;
  };
  await claudeAdapter.run('hi', { spawnFn });
  assert.notEqual(seen.cwd, os.tmpdir(), 'must not run in the shared tmp root');
  assert.ok(seen.cwd.startsWith(os.tmpdir()), 'private dir lives under tmp');
  assert.deepEqual(seen.args, resolveArgs());
  assert.ok(seen.args.includes('--allowedTools'));
});

test('claude adapter honors the MCP toggle and appends sanitized extra flags', async () => {
  let seen;
  const spawnFn = (command, args) => {
    seen = args;
    return { stdout: { on() {} }, stderr: { on() {} }, on(ev, cb) { if (ev === 'close') setTimeout(() => cb(0), 0); }, stdin: { write() {}, end() {} }, kill() {} };
  };
  await claudeAdapter.run('hi', { spawnFn, cli: { loadMcpServers: true, loadPluginsSettings: false, extraArgs: ['--model', 'x'] } });
  assert.ok(!seen.includes('--strict-mcp-config'), 'MCP toggle on → strict flag dropped');
  assert.ok(seen.includes('--setting-sources'), 'plugins toggle off → no-settings flag stays');
  assert.deepEqual(seen.slice(-2), ['--model', 'x'], 'extra flags appended last');
});
