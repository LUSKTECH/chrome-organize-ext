import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kiroAdapter, resolveCommand } from '../native-host/adapters/kiro.js';
import { makeFakeSpawn } from './helpers/fake-spawn.js';

test('run invokes `chat --no-interactive <prompt>` and returns trimmed plain text', async () => {
  let seen = null;
  const spawnFn = makeFakeSpawn((stdin, command, args) => { seen = { command, args }; return { stdout: ' {"close":[]} \n' }; });
  const out = await kiroAdapter.run('PROMPT', { spawnFn });
  assert.equal(out, '{"close":[]}');
  assert.deepEqual(seen.args.slice(0, 2), ['chat', '--no-interactive']);
  assert.equal(seen.args[seen.args.length - 1], 'PROMPT');
  assert.ok(!seen.args.includes('--trust-all-tools')); // read-only categorization: no tool trust
});

test('health returns the CLI version', async () => {
  const spawnFn = makeFakeSpawn(() => ({ stdout: 'kiro-cli 2.0.1\n' }));
  const r = await kiroAdapter.health({ spawnFn });
  assert.match(r.version, /2\.0\.1/);
});

test('run rejects on non-zero exit', async () => {
  const spawnFn = makeFakeSpawn(() => ({ stderr: 'auth error', code: 1 }));
  await assert.rejects(() => kiroAdapter.run('x', { spawnFn }), /auth error/);
});

test('resolveCommand defaults to kiro-cli and honors the env override', () => {
  const prev = process.env.BROWSER_ORGANIZER_KIRO_CMD;
  delete process.env.BROWSER_ORGANIZER_KIRO_CMD;
  assert.equal(resolveCommand(), 'kiro-cli');
  process.env.BROWSER_ORGANIZER_KIRO_CMD = '/usr/local/bin/kiro-cli';
  assert.equal(resolveCommand(), '/usr/local/bin/kiro-cli');
  if (prev === undefined) delete process.env.BROWSER_ORGANIZER_KIRO_CMD; else process.env.BROWSER_ORGANIZER_KIRO_CMD = prev;
});
