import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toSnapshot, collectTabs } from '../extension/lib/tab-collector.js';
import { flattenBookmarks, collectBookmarks } from '../extension/lib/bookmark-collector.js';

const DAY = 86400000;

test('toSnapshot computes age and idle from activity', () => {
  const now = 10 * DAY;
  const tab = { id: 7, windowId: 1, index: 2, title: 'T', url: 'https://a.com', pinned: false, groupId: -1 };
  const activity = { 7: { firstSeen: 2 * DAY, lastActive: 6 * DAY } };
  const s = toSnapshot(tab, activity, now);
  assert.equal(s.tabId, 7);
  assert.equal(s.ageDays, 8);
  assert.equal(s.idleDays, 4);
});

test('collectTabs excludes non-http tabs', async () => {
  const chromeApi = { tabs: { async query() {
    return [
      { id: 1, url: 'https://a.com', windowId: 1, index: 0 },
      { id: 2, url: 'chrome://extensions', windowId: 1, index: 1 },
    ];
  } } };
  const tabs = await collectTabs(chromeApi, {}, 0);
  assert.equal(tabs.length, 1);
  assert.equal(tabs[0].url, 'https://a.com');
});

test('flattenBookmarks yields leaves with folder path', () => {
  const tree = [{ id: '0', children: [
    { id: '1', title: 'Bar', children: [
      { id: '10', title: 'Dev', children: [
        { id: '100', title: 'MDN', url: 'https://mdn.dev', parentId: '10', index: 0, dateAdded: 5 },
      ] },
    ] },
  ] }];
  const flat = flattenBookmarks(tree);
  assert.equal(flat.length, 1);
  assert.deepEqual(flat[0].path, ['Bar', 'Dev']);
  assert.equal(flat[0].url, 'https://mdn.dev');
});

test('collectBookmarks reads the tree', async () => {
  const chromeApi = { bookmarks: { async getTree() {
    return [{ id: '0', children: [{ id: '1', title: 'X', url: 'https://x.com', parentId: '0', index: 0, dateAdded: 1 }] }];
  } } };
  const flat = await collectBookmarks(chromeApi);
  assert.equal(flat.length, 1);
});
