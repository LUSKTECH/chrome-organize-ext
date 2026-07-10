import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partitionForApply, applyItems, buildPlan } from '../extension/lib/orchestrator.js';

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

test('buildPlan reconciles activity and persists it (drops closed tabs)', async () => {
  const stored = { tabActivity: { 1: { firstSeen: 0, lastActive: 0 }, 999: { firstSeen: 0, lastActive: 0 } } };
  const chromeApi = {
    storage: { local: {
      async get(k) { return typeof k === 'string' ? { [k]: stored[k] } : { ...stored }; },
      async set(obj) { Object.assign(stored, obj); },
    } },
    tabs: { async query() { return [{ id: 1, url: 'https://a.com', windowId: 1, index: 0, lastAccessed: 1000 }]; } },
    bookmarks: { async getTree() { return []; } },
    history: { async getVisits() { return []; } },
  };
  const nativeClient = { request: async () => ({ groups: [], stale: [], important: [] }) };
  const settings = { enabledFeatures: { groupTabs: false, staleTabs: false, importantBookmarks: false, cleanBookmarks: false }, staleTabDays: 14, staleBookmarkDays: 180 };
  await buildPlan({ settings, nativeClient, chromeApi, now: 2000 });
  assert.ok(!stored.tabActivity['999'], 'closed tab entry pruned');
  assert.ok(stored.tabActivity['1'], 'open tab kept');
});

test('deleteBookmark is never auto-applied, even in auto mode', () => {
  const items = [{ itemId: 'g', action: 'groupTabs' }, { itemId: 'd', action: 'deleteBookmark' }];
  const r = partitionForApply(items, { automationMode: 'auto' });
  assert.deepEqual(r.autoApply.map((i) => i.itemId), ['g']);
  assert.deepEqual(r.needsReview.map((i) => i.itemId), ['d']);
});
