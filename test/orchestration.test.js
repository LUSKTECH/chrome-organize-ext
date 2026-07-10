import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partitionForApply, applyItems } from '../extension/lib/orchestrator.js';

test('partitionForApply routes everything to review in review mode', () => {
  const items = [{ itemId: 'a' }, { itemId: 'b' }];
  const r = partitionForApply(items, { automationMode: 'review' });
  assert.equal(r.needsReview.length, 2);
  assert.equal(r.autoApply.length, 0);
});

test('partitionForApply auto-applies in auto mode', () => {
  const items = [{ itemId: 'a' }];
  const r = partitionForApply(items, { automationMode: 'auto' });
  assert.equal(r.autoApply.length, 1);
  assert.equal(r.needsReview.length, 0);
});

test('applyItems applies each item, records undo, and reports failures', async () => {
  const applied = [];
  const recorded = [];
  const items = [
    { itemId: 'ok', action: 'groupTabs', data: {} },
    { itemId: 'bad', action: 'groupTabs', data: {} },
  ];
  const deps = {
    applyItem: async (item) => {
      if (item.itemId === 'bad') throw new Error('fail');
      applied.push(item.itemId);
      return { undoId: 'u-' + item.itemId, ts: 1, action: item.action, reverse: {} };
    },
    recordUndo: async (entries) => { recorded.push(...entries); },
  };
  const res = await applyItems(items, deps);
  assert.deepEqual(applied, ['ok']);
  assert.deepEqual(res.applied, ['ok']);
  assert.deepEqual(res.failed, ['bad']);
  assert.equal(recorded.length, 1);
});
