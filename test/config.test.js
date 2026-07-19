import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCommand, resolveArgs, sanitizeOptions, sanitizeConfig, sanitizeCli, extraArgs } from '../native-host/config.js';

test('sanitizeCli keeps benign flags, drops dangerous sets, and reads toggles', () => {
  assert.deepEqual(sanitizeCli({ extraArgs: '--model x --verbose' }).extraArgs, ['--model', 'x', '--verbose']);
  assert.equal(sanitizeCli({ extraArgs: '--dangerously-skip-permissions' }).rejected, true);
  assert.deepEqual(sanitizeCli({ extraArgs: '--sandbox danger' }).extraArgs, []); // whole set dropped
  assert.deepEqual(sanitizeCli({ extraArgs: ['--mcp-config', 'x.json'] }).extraArgs, []);
  const t = sanitizeCli({ loadMcpServers: true, loadPluginsSettings: false });
  assert.equal(t.loadMcpServers, true);
  assert.equal(t.loadPluginsSettings, false);
});

test('resolveArgs toggles MCP/settings flags; extraArgs reads opts.cli', () => {
  assert.ok(resolveArgs().includes('--strict-mcp-config'));               // default: MCP off
  assert.ok(resolveArgs().includes('--setting-sources'));                 // default: settings off
  const on = resolveArgs({ loadMcpServers: true, loadPluginsSettings: true });
  assert.ok(!on.includes('--strict-mcp-config') && !on.includes('--setting-sources'));
  assert.deepEqual(extraArgs({ cli: { extraArgs: ['--x'] } }), ['--x']);
  assert.deepEqual(extraArgs({}), []);
});

test('resolveCommand defaults to claude and honors env override', () => {
  const prev = process.env.BROWSER_ORGANIZER_CLI;
  delete process.env.BROWSER_ORGANIZER_CLI;
  assert.equal(resolveCommand(), 'claude');
  process.env.BROWSER_ORGANIZER_CLI = '/opt/claude/bin/claude';
  assert.equal(resolveCommand(), '/opt/claude/bin/claude');
  if (prev === undefined) delete process.env.BROWSER_ORGANIZER_CLI; else process.env.BROWSER_ORGANIZER_CLI = prev;
});

test('resolveArgs returns headless json args and disables tools', () => {
  const args = resolveArgs();
  assert.ok(args.includes('-p'));
  assert.ok(args.includes('--output-format') && args.includes('json'));
});

test('sanitizeOptions keeps only a bounded timeoutMs and drops everything else', () => {
  const s = sanitizeOptions({ timeoutMs: 5000, command: '/bin/sh', args: ['-c', 'rm -rf /'], env: { LD_PRELOAD: 'x' }, cwd: '/tmp' });
  assert.deepEqual(Object.keys(s).sort(), ['timeoutMs']);
  assert.equal(s.timeoutMs, 5000);
});

test('sanitizeOptions clamps out-of-range or bad timeout to default', () => {
  assert.equal(sanitizeOptions({ timeoutMs: -1 }).timeoutMs, 120000);
  assert.equal(sanitizeOptions({ timeoutMs: 9_999_999 }).timeoutMs, 300000);
  assert.equal(sanitizeOptions({}).timeoutMs, 120000);
  assert.equal(sanitizeOptions(null).timeoutMs, 120000);
});

test('sanitizeConfig keeps only apiKey/baseUrl/model strings, drops anything executable', () => {
  assert.deepEqual(
    sanitizeConfig({ apiKey: 'sk-1', baseUrl: 'https://x/v1', model: 'gpt', command: 'rm -rf /', env: { X: 1 } }),
    { apiKey: 'sk-1', baseUrl: 'https://x/v1', model: 'gpt' },
  );
  assert.deepEqual(sanitizeConfig({ apiKey: 'k', model: 123, baseUrl: '' }), { apiKey: 'k' });
  assert.equal(sanitizeConfig({}), undefined);
  assert.equal(sanitizeConfig(null), undefined);
  assert.equal(sanitizeConfig('nope'), undefined);
  assert.equal(sanitizeConfig({ command: 'x', args: ['y'] }), undefined);
});
