import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claudeAdapter, extractResultText } from '../native-host/adapters/claude.js';
import { getAdapter, registerAdapter } from '../native-host/adapters/registry.js';
import { makeFakeSpawn } from './helpers/fake-spawn.js';

test('extractResultText unwraps the json envelope', () => {
  assert.equal(extractResultText('{"result":"hello","type":"result"}'), 'hello');
});

test('extractResultText falls back to raw text', () => {
  assert.equal(extractResultText('just text'), 'just text');
});

test('adapter feeds prompt on stdin and returns unwrapped result', async () => {
  const spawnFn = makeFakeSpawn((stdin) =>
    ({ stdout: JSON.stringify({ result: `echo:${stdin}` }) }));
  const out = await claudeAdapter.run('PROMPT', { spawnFn });
  assert.equal(out, 'echo:PROMPT');
});

test('adapter rejects on non-zero exit with stderr', async () => {
  const spawnFn = makeFakeSpawn(() => ({ stderr: 'boom', code: 1 }));
  await assert.rejects(() => claudeAdapter.run('x', { spawnFn }), /boom/);
});

test('adapter rejects on timeout', async () => {
  const spawnFn = makeFakeSpawn(() => ({ stdout: 'late', delay: 50 }));
  await assert.rejects(() => claudeAdapter.run('x', { spawnFn, timeoutMs: 5 }), /timed out/);
});

test('health runs the CLI version and returns it', async () => {
  const spawnFn = makeFakeSpawn(() => ({ stdout: '2.1.0\n' }));
  const r = await claudeAdapter.health({ spawnFn });
  assert.match(r.version, /2\.1\.0/);
});

test('registry looks up claude and rejects unknown', () => {
  assert.equal(getAdapter('claude').name, 'claude');
  assert.throws(() => getAdapter('nope'), /Unknown adapter/);
});

test('registry accepts a newly registered adapter', () => {
  registerAdapter({ name: 'fake', async run() { return 'ok'; } });
  assert.equal(getAdapter('fake').name, 'fake');
});

test('registry includes the antigravity and kiro adapters', () => {
  assert.equal(getAdapter('antigravity').name, 'antigravity');
  assert.equal(getAdapter('kiro').name, 'kiro');
});
