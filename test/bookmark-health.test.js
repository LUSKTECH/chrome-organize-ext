import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicateBookmarks, findStaleBookmarks, getVisitsMap } from '../extension/lib/bookmark-health.js';
import { checkDeadLinks, recordDeadStrikes, dedupeDeletes } from '../extension/lib/bookmark-health.js';

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

test('stale detection matches visits by normalized url (slash/hash variants)', () => {
  const now = 300 * DAY;
  const bms = [{ id: '1', url: 'https://a.com/page/', dateAdded: 0, parentId: '1', index: 0 }];
  const visits = new Map([['https://a.com/page', 290 * DAY]]);
  const items = findStaleBookmarks(bms, visits, 180, now);
  assert.equal(items.length, 0);
});

test('getVisitsMap records the most recent visit per url', async () => {
  const chromeApi = { history: { async getVisits({ url }) {
    return url === 'https://a.com' ? [{ visitTime: 10 }, { visitTime: 40 }] : [];
  } } };
  const map = await getVisitsMap([{ url: 'https://a.com' }, { url: 'https://none.com' }], chromeApi);
  assert.equal(map.get('https://a.com'), 40);
  assert.equal(map.has('https://none.com'), false);
});

test('checkDeadLinks flags 404 and connection errors, spares timeouts and 200', async () => {
  const bms = [
    { id: '1', url: 'https://ok.com', parentId: '1', index: 0, title: 'ok' },
    { id: '2', url: 'https://gone.com', parentId: '1', index: 1, title: 'gone' },
    { id: '3', url: 'https://refused.com', parentId: '1', index: 2, title: 'refused' },
    { id: '4', url: 'https://slow.com', parentId: '1', index: 3, title: 'slow' },
    { id: '5', url: 'ftp://skip.com', parentId: '1', index: 4, title: 'skip' },
  ];
  const fetchFn = async (url) => {
    if (url === 'https://ok.com') return { status: 200 };
    if (url === 'https://gone.com') return { status: 404 };
    if (url === 'https://refused.com') throw Object.assign(new Error('ECONNREFUSED'), { name: 'TypeError' });
    if (url === 'https://slow.com') throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    throw new Error('unexpected url ' + url);
  };
  const items = await checkDeadLinks(bms, { fetchFn, concurrency: 2 });
  const ids = items.map((i) => i.data.bookmarkId).sort();
  assert.deepEqual(ids, ['2', '3']); // 404 + connection error; slow(200-ish timeout) and non-http skipped
});

test('recordDeadStrikes confirms only on the second consecutive failure', () => {
  let { strikes, confirmed } = recordDeadStrikes({}, ['b1', 'b2']);
  assert.deepEqual(confirmed, []);            // first strike, none confirmed
  ({ strikes, confirmed } = recordDeadStrikes(strikes, ['b1']));
  assert.deepEqual(confirmed, ['b1']);        // b1 failed twice
  assert.equal(strikes.b2, undefined);        // b2 recovered -> strike cleared
});

test('dedupeDeletes merges same-bookmark items and combines reasons', () => {
  const items = [
    { itemId: 'del-5', action: 'deleteBookmark', reason: 'Duplicate', data: { bookmarkId: '5' } },
    { itemId: 'del-5', action: 'deleteBookmark', reason: 'Dead link (HTTP 404)', data: { bookmarkId: '5' } },
    { itemId: 'del-6', action: 'deleteBookmark', reason: 'Not visited', data: { bookmarkId: '6' } },
  ];
  const out = dedupeDeletes(items);
  assert.equal(out.length, 2);
  const five = out.find((i) => i.data.bookmarkId === '5');
  assert.match(five.reason, /Duplicate/);
  assert.match(five.reason, /404/);
});
