import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from './helpers/chrome-mock.js';
import { recordUndo, getUndoLog, filterUndo, pruneUndo, reverseEntry } from '../extension/lib/undo-log.js';

const DAY = 86400000;
beforeEach(() => installChromeMock());

test('recordUndo appends and getUndoLog reads back', async () => {
  await recordUndo([{ undoId: 'a', ts: 1, action: 'closeTab', reverse: {} }]);
  await recordUndo([{ undoId: 'b', ts: 2, action: 'groupTabs', reverse: {} }]);
  const log = await getUndoLog();
  assert.deepEqual(log.map((e) => e.undoId), ['a', 'b']);
});

test('filterUndo drops entries older than retention', () => {
  const now = 10 * DAY;
  const entries = [{ ts: 2 * DAY }, { ts: 9 * DAY }];
  const kept = filterUndo(entries, now, 7);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].ts, 9 * DAY);
});

test('pruneUndo persists the filtered log', async () => {
  await recordUndo([{ undoId: 'old', ts: 1, action: 'closeTab', reverse: {} }]);
  await pruneUndo(30 * DAY, 7);
  const log = await getUndoLog();
  assert.equal(log.length, 0);
});

test('reverseEntry dispatches by action', async () => {
  const calls = [];
  const chrome = {
    tabs: { async create(x) { calls.push(['create', x]); }, async ungroup(x) { calls.push(['ungroup', x]); } },
    bookmarks: { async create(x) { calls.push(['bmCreate', x]); }, async remove(x) { calls.push(['bmRemove', x]); } },
  };
  await reverseEntry({ action: 'closeTab', reverse: { url: 'https://a', windowId: 1, index: 0, pinned: false } }, chrome);
  await reverseEntry({ action: 'groupTabs', reverse: { tabIds: [1, 2] } }, chrome);
  await reverseEntry({ action: 'createBookmark', reverse: { bookmarkId: '5' } }, chrome);
  await reverseEntry({ action: 'deleteBookmark', reverse: { parentId: '1', index: 0, title: 'T', url: 'https://a' } }, chrome);
  assert.deepEqual(calls.map((c) => c[0]), ['create', 'ungroup', 'bmRemove', 'bmCreate']);
});
