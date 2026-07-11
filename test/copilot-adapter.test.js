import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copilotAdapter, resolveCommand } from '../native-host/adapters/copilot.js';
import { makeFakeSpawn } from './helpers/fake-spawn.js';

test('run passes the prompt as an arg with -p/-s/--no-ask-user and returns trimmed text', async () => {
  let seen = null;
  const spawnFn = makeFakeSpawn((stdin, command, args) => { seen = { command, args }; return { stdout: '  {"groups":[]}\n' }; });
  const out = await copilotAdapter.run('PROMPT', { spawnFn });
  assert.equal(out, '{"groups":[]}');
  assert.deepEqual(seen.args, ['-p', 'PROMPT', '-s', '--no-ask-user']);
});

test('health returns the CLI version', async () => {
  const spawnFn = makeFakeSpawn(() => ({ stdout: 'copilot 1.3.0\n' }));
  const r = await copilotAdapter.health({ spawnFn });
  assert.match(r.version, /1\.3\.0/);
});

test('run rejects on non-zero exit', async () => {
  const spawnFn = makeFakeSpawn(() => ({ stderr: 'not authorized', code: 1 }));
  await assert.rejects(() => copilotAdapter.run('x', { spawnFn }), /not authorized/);
});

test('resolveCommand defaults to copilot and honors the env override', () => {
  const prev = process.env.BROWSER_ORGANIZER_COPILOT_CMD;
  delete process.env.BROWSER_ORGANIZER_COPILOT_CMD;
  assert.equal(resolveCommand(), 'copilot');
  process.env.BROWSER_ORGANIZER_COPILOT_CMD = '/usr/local/bin/copilot';
  assert.equal(resolveCommand(), '/usr/local/bin/copilot');
  if (prev === undefined) delete process.env.BROWSER_ORGANIZER_COPILOT_CMD; else process.env.BROWSER_ORGANIZER_COPILOT_CMD = prev;
});
