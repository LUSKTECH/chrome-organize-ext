import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codexAdapter, resolveCommand } from '../native-host/adapters/codex.js';
import { makeFakeSpawn } from './helpers/fake-spawn.js';

test('run invokes `exec --skip-git-repo-check <prompt>` and returns trimmed text', async () => {
  let seen = null;
  const spawnFn = makeFakeSpawn((stdin, command, args) => { seen = { command, args }; return { stdout: ' {"important":[]} \n' }; });
  const out = await codexAdapter.run('PROMPT', { spawnFn });
  assert.equal(out, '{"important":[]}');
  assert.deepEqual(seen.args, ['exec', '--skip-git-repo-check', 'PROMPT']);
});

test('health returns the CLI version', async () => {
  const spawnFn = makeFakeSpawn(() => ({ stdout: 'codex-cli 0.9.0\n' }));
  const r = await codexAdapter.health({ spawnFn });
  assert.match(r.version, /0\.9\.0/);
});

test('run rejects on non-zero exit', async () => {
  const spawnFn = makeFakeSpawn(() => ({ stderr: 'login required', code: 1 }));
  await assert.rejects(() => codexAdapter.run('x', { spawnFn }), /login required/);
});

test('resolveCommand defaults to codex and honors the env override', () => {
  const prev = process.env.BROWSER_ORGANIZER_CODEX_CMD;
  delete process.env.BROWSER_ORGANIZER_CODEX_CMD;
  assert.equal(resolveCommand(), 'codex');
  process.env.BROWSER_ORGANIZER_CODEX_CMD = '/opt/codex/bin/codex';
  assert.equal(resolveCommand(), '/opt/codex/bin/codex');
  if (prev === undefined) delete process.env.BROWSER_ORGANIZER_CODEX_CMD; else process.env.BROWSER_ORGANIZER_CODEX_CMD = prev;
});
