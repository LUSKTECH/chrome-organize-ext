import { test } from 'node:test';
import assert from 'node:assert/strict';
import { antigravityAdapter, resolveCommand } from '../native-host/adapters/antigravity.js';
import { makeFakeSpawn } from './helpers/fake-spawn.js';

test('run passes the prompt as an arg (with -p/--yes/--no-color) and returns trimmed plain text', async () => {
  let seen = null;
  const spawnFn = makeFakeSpawn((stdin, command, args) => { seen = { command, args }; return { stdout: '  {"groups":[]}\n' }; });
  const out = await antigravityAdapter.run('PROMPT', { spawnFn });
  assert.equal(out, '{"groups":[]}'); // trimmed, returned raw (JSON extracted downstream)
  assert.ok(seen.args.includes('PROMPT'));
  assert.ok(seen.args.includes('-p'));
  assert.ok(seen.args.includes('--yes'));
  assert.ok(seen.args.includes('--no-color'));
});

test('health returns the CLI version', async () => {
  const spawnFn = makeFakeSpawn(() => ({ stdout: 'agy 0.4.2\n' }));
  const r = await antigravityAdapter.health({ spawnFn });
  assert.match(r.version, /0\.4\.2/);
});

test('run rejects on non-zero exit with stderr', async () => {
  const spawnFn = makeFakeSpawn(() => ({ stderr: 'boom', code: 1 }));
  await assert.rejects(() => antigravityAdapter.run('x', { spawnFn }), /boom/);
});

test('resolveCommand defaults to agy and honors the env override', () => {
  const prev = process.env.BROWSER_ORGANIZER_ANTIGRAVITY_CMD;
  delete process.env.BROWSER_ORGANIZER_ANTIGRAVITY_CMD;
  assert.equal(resolveCommand(), 'agy');
  process.env.BROWSER_ORGANIZER_ANTIGRAVITY_CMD = '/opt/agy/bin/agy';
  assert.equal(resolveCommand(), '/opt/agy/bin/agy');
  if (prev === undefined) delete process.env.BROWSER_ORGANIZER_ANTIGRAVITY_CMD; else process.env.BROWSER_ORGANIZER_ANTIGRAVITY_CMD = prev;
});
