import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicateBookmarks, findStaleBookmarks, getVisitsMap } from '../extension/lib/bookmark-health.js';

const DAY = 86400000;

test('findDuplicateBookmarks flags all but the first normalized match', () => {
  const bms = [
    { id: '1', title: 'A', url: 'https://a.com/x', parentId: '1', index: 0 },
    { id: '2', title: 'A2', url: 'https://A.com/x/', parentId: '1', index: 1 },
    { id: '3', title: 'B', url: 'https://b.com', parentId: '1', index: 2 },
  ];
  const items = findDuplicateBookmarks(bms);
  assert.equal(items.length, 1);
  assert.equal(items[0].data.bookmarkId, '2');
  assert.equal(items[0].action, 'deleteBookmark');
});

test('findStaleBookmarks uses last visit, falling back to dateAdded', () => {
  const now = 300 * DAY;
  const bms = [
    { id: '1', url: 'https://fresh.com', dateAdded: 0, parentId: '1', index: 0 },
    { id: '2', url: 'https://old.com', dateAdded: 0, parentId: '1', index: 1 },
  ];
  const visits = new Map([['https://fresh.com', 290 * DAY]]); // old.com has no visits -> dateAdded 0
  const items = findStaleBookmarks(bms, visits, 180, now);
  assert.equal(items.length, 1);
  assert.equal(items[0].data.bookmarkId, '2');
});

test('getVisitsMap records the most recent visit per url', async () => {
  const chromeApi = { history: { async getVisits({ url }) {
    return url === 'https://a.com' ? [{ visitTime: 10 }, { visitTime: 40 }] : [];
  } } };
  const map = await getVisitsMap([{ url: 'https://a.com' }, { url: 'https://none.com' }], chromeApi);
  assert.equal(map.get('https://a.com'), 40);
  assert.equal(map.has('https://none.com'), false);
});
