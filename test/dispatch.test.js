import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../native-host/dispatch.js';

function fakeGetAdapter(cannedOutput) {
  return () => ({ name: 'fake', async run() { return cannedOutput; }, async health() { return { version: 'test' }; } });
}

test('health runs the adapter version check and reports ready', async () => {
  const r = await handle({ type: 'health' }, { getAdapter: fakeGetAdapter('') });
  assert.equal(r.ready, true);
  assert.equal(r.adapter, 'fake');
  assert.equal(r.version, 'test');
  assert.match(r.hostVersion, /^\d+\.\d+\.\d+$/); // bridge version reported alongside the CLI version
});

test('health reports not ready when the version check fails', async () => {
  const getAdapter = () => ({ name: 'fake', async run() { return ''; }, async health() { throw new Error('ENOENT'); } });
  const r = await handle({ type: 'health' }, { getAdapter });
  assert.equal(r.ready, false);
  assert.match(r.error, /ENOENT/);
});

test('organize/group returns parsed groups', async () => {
  const out = '{"groups":[{"name":"A","color":"blue","tabIds":[1]}]}';
  const r = await handle(
    { type: 'organize', task: 'group', payload: { tabs: [{ tabId: 1, title: 't', url: 'https://a' }] } },
    { getAdapter: fakeGetAdapter(out) });
  assert.equal(r.task, 'group');
  assert.deepEqual(r.groups, [{ name: 'A', color: 'blue', tabIds: [1] }]);
});

test('organize/stale returns parsed close list', async () => {
  const out = '{"close":[{"tabId":2,"reason":"old","suggestBookmark":true}]}';
  const r = await handle(
    { type: 'organize', task: 'stale', payload: { tabs: [{ tabId: 2, idleDays: 40 }], thresholdDays: 14 } },
    { getAdapter: fakeGetAdapter(out) });
  assert.deepEqual(r.stale, [{ tabId: 2, reason: 'old', suggestBookmark: true, action: 'close' }]);
});

test('unknown type rejects', async () => {
  await assert.rejects(() => handle({ type: 'wat' }, { getAdapter: fakeGetAdapter('') }), /Unknown message type/);
});

test('organize-bookmarks task returns parsed moves', async () => {
  const out = '{"moves":[{"bookmarkId":"9","targetFolderId":"5","reason":"ref"}]}';
  const r = await handle(
    { type: 'organize', task: 'organize-bookmarks', payload: { mode: 'match', bookmarks: [{ id: '9', title: 't', url: 'https://a', folder: '' }], folders: [{ id: '5', path: 'Dev' }] } },
    { getAdapter: fakeGetAdapter(out) });
  assert.equal(r.task, 'organize-bookmarks');
  assert.deepEqual(r.moves, [{ bookmarkId: '9', targetFolderId: '5', reason: 'ref' }]);
});

test('command task returns parsed actions', async () => {
  const out = '{"close":[{"tabId":2,"reason":"travel"}],"groups":[],"important":[]}';
  const getAdapter = () => ({ name: 'fake', async run() { return out; }, async health() { return { version: 't' }; } });
  const r = await handle({ type: 'command', payload: { instruction: 'close travel', tabs: [{ tabId: 2 }] } }, { getAdapter });
  assert.equal(r.close.length, 1);
});

test('handle ignores attacker-supplied command/args in cliOptions', async () => {
  let seenOpts = null;
  const getAdapter = () => ({ name: 'fake', async run(_p, opts) { seenOpts = opts; return '{"groups":[]}'; } });
  await handle(
    { type: 'organize', task: 'group', cliOptions: { command: '/bin/sh', args: ['-c', 'evil'], timeoutMs: 7000 }, payload: { tabs: [] } },
    { getAdapter });
  assert.deepEqual(Object.keys(seenOpts).sort(), ['cli', 'timeoutMs']); // only sanitized fields (cli + timeout)
  assert.equal(seenOpts.timeoutMs, 7000);
  assert.ok(!('command' in seenOpts) && !('args' in seenOpts)); // attacker command/args stripped
});

test('handle sanitizes UI-supplied cli flags (host is the gate)', async () => {
  let seenOpts = null;
  const getAdapter = () => ({ name: 'fake', async run(_p, opts) { seenOpts = opts; return '{"groups":[]}'; } });
  await handle(
    { type: 'organize', task: 'group', cli: { loadMcpServers: true, extraArgs: '--dangerously-skip-permissions --allowedTools *' }, payload: { tabs: [] } },
    { getAdapter });
  assert.equal(seenOpts.cli.loadMcpServers, true);      // benign toggle honored
  assert.deepEqual(seenOpts.cli.extraArgs, []);         // dangerous flags dropped host-side
  assert.equal(seenOpts.cli.rejected, true);
});
