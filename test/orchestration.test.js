import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partitionForApply, applyItems, buildPlan, sliceForScan, projectTabsForHost, ignoreKey, applyIgnoreList, recordDecision, decisionRules } from '../extension/lib/orchestrator.js';

import { dedupeTabActions, finalizePlan, applyWhitelist, runCommand } from '../extension/lib/orchestrator.js';

test('runCommand applies whitelist + ignore-list via finalizePlan (safety controls hold on the command path)', async () => {
  const chromeApi = {
    storage: { local: { async get() { return {}; }, async set() {} } },
    tabs: { async query() { return [
      { id: 1, url: 'https://github.com/x', windowId: 1, index: 0 },
      { id: 2, url: 'https://other.com/y', windowId: 1, index: 1 },
    ]; } },
  };
  const nativeClient = { request: async () => ({ close: [{ tabId: 1, reason: 'a' }, { tabId: 2, reason: 'b' }], groups: [], important: [] }) };
  const settings = { adapter: 'claude', decisions: {}, whitelist: ['github.com'], ignore: [] };
  const items = await runCommand('close old tabs', { nativeClient, chromeApi, settings });
  const urls = items.filter((i) => i.action === 'closeTab').map((i) => i.data.url);
  assert.ok(!urls.some((u) => new URL(u).hostname === 'github.com'), 'whitelisted host dropped on command path');
  assert.ok(urls.some((u) => new URL(u).hostname === 'other.com'), 'non-whitelisted tab kept');
});

test('projectTabsForHost coarsens private/localhost URLs to origin only', () => {
  const out = projectTabsForHost([
    { tabId: 1, title: 'a', url: 'https://example.com/path?q=1#f', idleDays: 1 },
    { tabId: 2, title: 'b', url: 'http://192.168.1.1/admin/secret?token=x', idleDays: 1 },
    { tabId: 3, title: 'c', url: 'http://localhost:8080/private/id', idleDays: 1 },
  ]);
  assert.equal(out[0].url, 'https://example.com/path'); // public: query stripped, path kept
  assert.equal(out[1].url, 'http://192.168.1.1');       // private: origin only, path dropped
  assert.equal(out[2].url, 'http://localhost:8080');    // localhost: origin only
});

test('buildPlan preserves free/local results when an AI phase throws', async () => {
  const stored = {};
  const chromeApi = {
    storage: { local: { async get(k) { return typeof k === 'string' ? { [k]: stored[k] } : { ...stored }; }, async set(o) { Object.assign(stored, o); } } },
    tabs: { async query() { return [
      { id: 1, url: 'https://a.com', windowId: 1, index: 0, pinned: false },
      { id: 2, url: 'https://a.com', windowId: 1, index: 1, pinned: false }, // duplicate → local result
    ]; } },
    bookmarks: { async getTree() { return []; } },
    history: { async getVisits() { return []; } },
  };
  const nativeClient = { request: async () => { throw new Error('CLI crashed'); } };
  const settings = { adapter: 'claude', enabledFeatures: { dupeTabs: true, groupTabs: true, staleTabs: false, importantBookmarks: false, cleanBookmarks: false }, staleTabDays: 14, staleBookmarkDays: 180, deadLinkBatchSize: 200 };
  const items = await buildPlan({ settings, nativeClient, chromeApi, now: 1 });
  assert.ok(items.some((i) => i.action === 'closeTab'), 'local dupe-tab result preserved despite the group phase throwing');
});

test('applyWhitelist drops destructive actions on protected domains (and subdomains)', () => {
  const items = [
    { action: 'closeTab', data: { url: 'https://mail.google.com/x' } },
    { action: 'closeTab', data: { url: 'https://random.com' } },
    { action: 'deleteBookmark', data: { url: 'https://sub.github.com/y' } },
    { action: 'groupTabs', data: { tabIds: [1] } },
  ];
  const out = applyWhitelist(items, ['google.com', 'github.com']);
  assert.deepEqual(out.map((i) => i.data.url || 'group'), ['https://random.com', 'group']);
});

test('buildPlan excludes already-grouped tabs from group candidates (respects existing groups)', async () => {
  const stored = {};
  const chromeApi = {
    storage: { local: { async get(k) { return typeof k === 'string' ? { [k]: stored[k] } : { ...stored }; }, async set(o) { Object.assign(stored, o); } } },
    tabs: { async query() { return [
      { id: 1, url: 'https://a.com', windowId: 1, index: 0, groupId: 7 },   // already in a group
      { id: 2, url: 'https://b.com', windowId: 1, index: 1, groupId: -1 },
      { id: 3, url: 'https://c.com', windowId: 1, index: 2, groupId: -1 },
    ]; } },
    bookmarks: { async getTree() { return []; } },
    history: { async getVisits() { return []; } },
  };
  let groupPayload = null;
  const nativeClient = { request: async (m) => { if (m.task === 'group') groupPayload = m.payload; return { groups: [], stale: [], important: [] }; } };
  const settings = { adapter: 'claude', enabledFeatures: { groupTabs: true, staleTabs: false, importantBookmarks: false, cleanBookmarks: false, dupeTabs: false }, staleTabDays: 14, staleBookmarkDays: 180, deadLinkBatchSize: 200 };
  await buildPlan({ settings, nativeClient, chromeApi, now: 1 });
  const ids = groupPayload.tabs.map((t) => t.tabId).sort();
  assert.deepEqual(ids, [2, 3]); // the grouped tab (1) is excluded
});

test('buildPlan excludes pinned tabs from stale close candidates', async () => {
  const stored = {};
  const chromeApi = {
    storage: { local: { async get(k) { return typeof k === 'string' ? { [k]: stored[k] } : { ...stored }; }, async set(o) { Object.assign(stored, o); } } },
    tabs: { async query() { return [
      { id: 1, url: 'https://a.com', windowId: 1, index: 0, pinned: true, lastAccessed: 0 },
      { id: 2, url: 'https://b.com', windowId: 1, index: 1, pinned: false, lastAccessed: 0 },
    ]; } },
    bookmarks: { async getTree() { return []; } },
    history: { async getVisits() { return []; } },
  };
  let stalePayload = null;
  const nativeClient = { request: async (m) => { if (m.task === 'stale') stalePayload = m.payload; return { groups: [], stale: [], important: [] }; } };
  const settings = { adapter: 'claude', enabledFeatures: { groupTabs: false, staleTabs: true, importantBookmarks: false, cleanBookmarks: false, dupeTabs: false }, staleTabDays: 14, staleBookmarkDays: 180, deadLinkBatchSize: 200 };
  await buildPlan({ settings, nativeClient, chromeApi, now: 100 * 86400000 });
  assert.ok(stalePayload, 'stale task should run');
  const ids = stalePayload.tabs.map((t) => t.tabId);
  assert.ok(!ids.includes(1), 'pinned tab excluded from stale candidates');
  assert.ok(ids.includes(2), 'unpinned idle tab included');
});

test('dedupeTabActions keeps one close/discard per tab (dupe+stale collision)', () => {
  const items = [
    { itemId: 'dupe-close-5', action: 'closeTab', data: { tabId: 5 } },
    { itemId: 'close-5', action: 'closeTab', data: { tabId: 5 } },   // same tab, other source
    { itemId: 'close-6', action: 'closeTab', data: { tabId: 6 } },
    { itemId: 'group-0', action: 'groupTabs', data: { tabIds: [5, 6] } }, // untouched
  ];
  const out = dedupeTabActions(items);
  assert.deepEqual(out.map((i) => i.itemId), ['dupe-close-5', 'close-6', 'group-0']);
});

test('finalizePlan dedupes, validates, and applies the ignore list', () => {
  const items = [
    { itemId: 'close-5', action: 'closeTab', status: 'pending', data: { tabId: 5, url: 'https://a.com' } },
    { itemId: 'close-5b', action: 'closeTab', status: 'pending', data: { tabId: 5, url: 'https://a.com' } },
    { action: 'bogus' }, // dropped by validatePlanItem
  ];
  const out = finalizePlan(items, { ignore: [] });
  assert.equal(out.length, 1); // one valid close for tab 5
});

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

test('buildPlan includes the configured adapter in native requests', async () => {
  let seen = null;
  const stored = {};
  const chromeApi = {
    storage: { local: { async get(k) { return typeof k === 'string' ? { [k]: stored[k] } : { ...stored }; }, async set(o) { Object.assign(stored, o); } } },
    tabs: { async query() { return [{ id: 1, url: 'https://a.com', windowId: 1, index: 0 }]; } },
    bookmarks: { async getTree() { return []; } },
    history: { async getVisits() { return []; } },
  };
  const nativeClient = { request: async (m) => { seen = m; return { groups: [], stale: [], important: [] }; } };
  const settings = { adapter: 'kiro', enabledFeatures: { groupTabs: true, staleTabs: false, importantBookmarks: false, cleanBookmarks: false }, staleTabDays: 14, staleBookmarkDays: 180, deadLinkBatchSize: 200 };
  await buildPlan({ settings, nativeClient, chromeApi, now: 1 });
  assert.equal(seen.adapter, 'kiro');
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

test('projectTabsForHost redacts query strings before sending to the model', () => {
  const out = projectTabsForHost([{ tabId: 1, title: 't', url: 'https://a.com/x?session=abc', idleDays: 2 }]);
  assert.equal(out[0].url, 'https://a.com/x');
});

test('buildPlan reports progress and honors cancel', async () => {
  const phases = [];
  const chromeApi = {
    storage: { local: { async get() { return {}; }, async set() {} } },
    tabs: { async query() { return [{ id: 1, url: 'https://a.com', windowId: 1, index: 0 }]; } },
    bookmarks: { async getTree() { return []; } },
    history: { async getVisits() { return []; } },
  };
  const nativeClient = { request: async () => ({ groups: [], stale: [], important: [] }) };
  const settings = { enabledFeatures: { groupTabs: true, staleTabs: false, importantBookmarks: false, cleanBookmarks: false }, staleTabDays: 14, staleBookmarkDays: 180, deadLinkBatchSize: 200 };
  const items = await buildPlan({ settings, nativeClient, chromeApi, now: 1, onProgress: (p, d, t) => phases.push([p, d, t]), shouldCancel: () => true });
  assert.ok(phases.length >= 1);
  assert.deepEqual(items, []); // cancelled before producing work
});

test('ignoreKey is stable per target and applyIgnoreList filters matches', () => {
  const closeItem = { action: 'closeTab', data: { url: 'https://a.com/x' } };
  const key = ignoreKey(closeItem);
  const items = [closeItem, { action: 'closeTab', data: { url: 'https://b.com' } }];
  const kept = applyIgnoreList(items, [key]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].data.url, 'https://b.com');
});

test('recordDecision + decisionRules surface repeated rejects as keep-rules', () => {
  let d = {};
  const item = { action: 'closeTab', data: { url: 'https://mail.google.com/x' } };
  d = recordDecision(d, item, 'reject');
  d = recordDecision(d, item, 'reject');
  const rules = decisionRules(d);
  assert.ok(rules.keep.includes('Do not suggest actions on https://mail.google.com/x'));
});

test('sliceForScan returns a batch and wraps the cursor', () => {
  const items = Array.from({ length: 5 }, (_, i) => i);
  let { slice, nextCursor } = sliceForScan(items, 0, 2);
  assert.deepEqual(slice, [0, 1]);
  assert.equal(nextCursor, 2);
  ({ slice, nextCursor } = sliceForScan(items, 4, 2));
  assert.deepEqual(slice, [4]);
  assert.equal(nextCursor, 0); // wrapped
});
