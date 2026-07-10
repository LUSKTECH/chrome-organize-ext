import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../native-host/dispatch.js';

function fakeGetAdapter(cannedOutput) {
  return () => ({ name: 'fake', async run() { return cannedOutput; } });
}

test('health returns ready without calling the model', async () => {
  const r = await handle({ type: 'health' }, { getAdapter: fakeGetAdapter('') });
  assert.equal(r.ready, true);
  assert.equal(r.adapter, 'fake');
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
  assert.deepEqual(r.stale, [{ tabId: 2, reason: 'old', suggestBookmark: true }]);
});

test('unknown type rejects', async () => {
  await assert.rejects(() => handle({ type: 'wat' }, { getAdapter: fakeGetAdapter('') }), /Unknown message type/);
});
