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

test('getVisitsMap + findStaleBookmarks: trailing-slash bookmark matches a no-slash history entry', async () => {
  const now = 300 * DAY;
  const chromeApi = { history: { async getVisits({ url }) {
    // History recorded the visit only under the no-slash variant.
    return url === 'https://a.com/page' ? [{ visitTime: 290 * DAY }] : [];
  } } };
  const bms = [{ id: '1', url: 'https://a.com/page/', dateAdded: 0, parentId: '1', index: 0 }];
  const visitsMap = await getVisitsMap(bms, chromeApi);
  const items = findStaleBookmarks(bms, visitsMap, 180, now);
  assert.equal(items.length, 0); // must NOT be flagged stale
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

test('checkDeadLinks tags dead items with category + numeric httpStatus', async () => {
  const fetchFn = async (url) => ({ status: url.includes('gone') ? 410 : 404 });
  const bms = [
    { id: '1', url: 'https://x.com/missing', parentId: '1', index: 0, title: 'm' },
    { id: '2', url: 'https://x.com/gone', parentId: '1', index: 1, title: 'g' },
  ];
  const items = await checkDeadLinks(bms, { fetchFn, concurrency: 2 });
  const byId = Object.fromEntries(items.map((i) => [i.data.bookmarkId, i]));
  assert.equal(byId['1'].category, 'dead');
  assert.equal(byId['1'].data.httpStatus, 404);
  assert.equal(byId['2'].data.httpStatus, 410);
});

test('checkDeadLinks treats opaqueredirect (manual redirect, status 0) as alive', async () => {
  // Real browsers return { type: 'opaqueredirect', status: 0 } for a 3xx under
  // redirect:'manual'. That must NOT be flagged unreachable/dead.
  const fetchFn = async () => ({ status: 0, type: 'opaqueredirect' });
  const items = await checkDeadLinks([{ id: '7', url: 'https://moved.example/', parentId: '1', index: 0, title: 'm' }], { fetchFn, concurrency: 1 });
  assert.deepEqual(items, []);
});

test('checkDeadLinks marks connection failures unreachable (httpStatus 0)', async () => {
  const fetchFn = async () => { throw Object.assign(new Error('boom'), { name: 'TypeError' }); };
  const items = await checkDeadLinks([{ id: '9', url: 'https://x.com/', parentId: '1', index: 0, title: 'x' }], { fetchFn, concurrency: 1 });
  assert.equal(items[0].category, 'dead');
  assert.equal(items[0].data.httpStatus, 0);
});

test('duplicate/stale proposals carry their category', () => {
  const dups = findDuplicateBookmarks([
    { id: '1', url: 'https://a.com', parentId: '1', index: 0, title: 'a' },
    { id: '2', url: 'https://a.com', parentId: '1', index: 1, title: 'a' },
  ]);
  assert.equal(dups[0].category, 'duplicate');
  const stale = findStaleBookmarks([{ id: '3', url: 'https://b.com', parentId: '1', index: 0, dateAdded: 0 }], new Map(), 30, 1e12);
  assert.equal(stale[0].category, 'stale');
});

test('recordDeadStrikes: confirms on 2nd dead; carries forward unscanned; resets scanned-alive', () => {
  // pass 1: both scanned and dead
  let r = recordDeadStrikes({}, ['b1', 'b2'], ['b1', 'b2']);
  assert.deepEqual(r.confirmed, []);
  assert.deepEqual(r.strikes, { b1: 1, b2: 1 });
  // pass 2: a DIFFERENT slice — only b1 scanned, still dead -> confirmed; b2 carried forward
  r = recordDeadStrikes(r.strikes, ['b1'], ['b1']);
  assert.deepEqual(r.confirmed, ['b1']);
  assert.equal(r.strikes.b2, 1, 'unscanned bookmark keeps its strike (the pagination bug fix)');
  // pass 3: b1 scanned and now alive -> strike reset
  r = recordDeadStrikes(r.strikes, [], ['b1']);
  assert.equal(r.strikes.b1, undefined);
});

test('dead-link check uses HEAD, treats 3xx as alive, skips private hosts', async () => {
  const calls = [];
  const bms = [
    { id: '1', url: 'https://ok.com', parentId: '1', index: 0, title: 'ok' },
    { id: '2', url: 'https://moved.com', parentId: '1', index: 1, title: 'moved' },
    { id: '3', url: 'http://192.168.0.1/admin', parentId: '1', index: 2, title: 'router' },
  ];
  const fetchFn = async (url, opts) => {
    calls.push({ url, method: opts.method, redirect: opts.redirect });
    if (url === 'https://ok.com') return { status: 200 };
    if (url === 'https://moved.com') return { status: 301 }; // alive, not followed
    throw new Error('should not fetch private host');
  };
  const items = await checkDeadLinks(bms, { fetchFn, concurrency: 1 });
  assert.deepEqual(items, []);                       // none dead
  assert.ok(calls.every((c) => c.method === 'HEAD'));
  assert.ok(calls.every((c) => c.redirect === 'manual'));
  assert.ok(!calls.some((c) => c.url.includes('192.168'))); // private skipped
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
