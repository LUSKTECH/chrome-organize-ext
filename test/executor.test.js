import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyItem, ensureFolder } from '../extension/lib/executor.js';

function makeChrome() {
  const removed = [];
  const created = [];
  const moved = [];
  let nextBmId = 100;
  const folders = { '1': [] }; // bookmarks-bar children
  return {
    _removed: removed,
    _created: created,
    _moved: moved,
    tabs: {
      async get(id) { return { id, url: 'https://a.com' }; },
      async remove(id) { removed.push(id); },
      async group({ tabIds }) { this._grouped = tabIds; return 555; },
      async ungroup(ids) { this._ungrouped = ids; },
    },
    tabGroups: { async update(id, props) { this._groupUpdate = { id, props }; } },
    bookmarks: {
      async getChildren(parentId) { return folders[parentId] || []; },
      async create(node) {
        const id = String(nextBmId++);
        const created2 = { id, ...node };
        created.push(created2);
        (folders[node.parentId] ||= []).push(created2);
        folders[id] = [];
        return created2;
      },
      async remove(id) { removed.push(`bm:${id}`); },
      async get(id) { return [{ id }]; },
      async move(id, dest) { moved.push({ id, dest }); return { id, ...dest }; },
    },
  };
}

test('moveBookmark moves to an existing target and reverses to origin', async () => {
  const chrome = makeChrome();
  const item = { action: 'moveBookmark', data: { bookmarkId: '9', fromParentId: '2', fromIndex: 3, toParentId: '10', title: 't', url: 'https://x.com' } };
  const entry = await applyItem(item, { chrome });
  assert.deepEqual(chrome._moved.at(-1), { id: '9', dest: { parentId: '10' } });
  assert.equal(entry.action, 'moveBookmark');
  assert.deepEqual(entry.reverse, { bookmarkId: '9', parentId: '2', index: 3 });
});

test('moveBookmark creates the target folder from toFolderPath under the given root', async () => {
  const chrome = makeChrome();
  const item = { action: 'moveBookmark', data: { bookmarkId: '9', fromParentId: '1', fromIndex: 0, toFolderPath: ['Work'], toRootId: '2', title: 't', url: 'https://x.com' } };
  await applyItem(item, { chrome });
  assert.ok(chrome._created.some((c) => c.title === 'Work' && c.parentId === '2'));
  assert.equal(chrome._moved.at(-1).id, '9');
});

test('removeFolder removes an empty non-root folder and reverses by recreating it', async () => {
  const chrome = makeChrome();
  const f = await chrome.bookmarks.create({ parentId: '2', title: 'Empty' }); // folders[f.id] = []
  const item = { action: 'removeFolder', data: { folderId: f.id, parentId: '2', index: 0, title: 'Empty' } };
  const entry = await applyItem(item, { chrome });
  assert.ok(chrome._removed.includes(`bm:${f.id}`));
  assert.deepEqual(entry.reverse, { folderId: f.id, parentId: '2', index: 0, title: 'Empty' });
});

test('removeFolder refuses a root folder (no-op, skipped)', async () => {
  const chrome = makeChrome();
  const entry = await applyItem({ action: 'removeFolder', data: { folderId: '1', parentId: '0', index: 0, title: 'Bar' } }, { chrome });
  assert.equal(entry.skipped, true);
  assert.ok(!chrome._removed.includes('bm:1'));
});

test('removeFolder refuses a non-empty folder (no-op, skipped)', async () => {
  const chrome = makeChrome();
  const f = await chrome.bookmarks.create({ parentId: '2', title: 'Full' });
  await chrome.bookmarks.create({ parentId: f.id, title: 'child', url: 'https://c.com' });
  const entry = await applyItem({ action: 'removeFolder', data: { folderId: f.id, parentId: '2', index: 0, title: 'Full' } }, { chrome });
  assert.equal(entry.skipped, true);
  assert.ok(!chrome._removed.includes(`bm:${f.id}`));
});

test('closeTab removes the tab and returns a reopen undo entry', async () => {
  const chrome = makeChrome();
  const item = { action: 'closeTab', data: { tabId: 3, url: 'https://a.com', title: 'A', windowId: 1, index: 2, pinned: false, bookmarkFirst: false } };
  const undo = await applyItem(item, { chrome });
  assert.deepEqual(chrome._removed, [3]);
  assert.equal(undo.action, 'closeTab');
  assert.equal(undo.reverse.url, 'https://a.com');
});

test('closeTab refuses to close a pinned tab (protected)', async () => {
  const removed = [];
  const chrome = {
    tabs: { async get(id) { return { id, url: 'https://a.com', pinned: true }; }, async remove(id) { removed.push(id); } },
    bookmarks: { async getChildren() { return []; }, async create(n) { return { id: '1', ...n }; } },
  };
  const item = { action: 'closeTab', data: { tabId: 3, url: 'https://a.com', title: 'A', windowId: 1, index: 0, pinned: false, bookmarkFirst: false } };
  await assert.rejects(() => applyItem(item, { chrome }), /pinned/i);
  assert.deepEqual(removed, []);
});

test('closeTab with bookmarkFirst saves before closing and records the bookmark for undo', async () => {
  const chrome = makeChrome();
  const item = { action: 'closeTab', data: { tabId: 3, url: 'https://a.com', title: 'A', windowId: 1, index: 2, pinned: false, bookmarkFirst: true } };
  const undo = await applyItem(item, { chrome });
  assert.equal(chrome._created.length, 3); // 2 folders + 1 bookmark
  assert.equal(chrome._created.at(-1).url, 'https://a.com');
  assert.equal(undo.reverse.savedBookmarkId, chrome._created.at(-1).id); // recorded so undo can delete it
});

test('groupTabs groups and titles the group', async () => {
  const chrome = makeChrome();
  const item = { action: 'groupTabs', data: { tabIds: [1, 2], groupName: 'Work', color: 'blue' } };
  const undo = await applyItem(item, { chrome });
  assert.deepEqual(chrome.tabs._grouped, [1, 2]);
  assert.equal(chrome.tabGroups._groupUpdate.props.title, 'Work');
  assert.deepEqual(undo.reverse.tabIds, [1, 2]);
});

test('createBookmark builds folder path then creates the bookmark', async () => {
  const chrome = makeChrome();
  const item = { action: 'createBookmark', data: { url: 'https://b.com', title: 'B', folderPath: ['Dev', 'React'] } };
  const undo = await applyItem(item, { chrome });
  assert.equal(chrome._created.length, 3); // Dev, React, bookmark
  assert.ok(undo.reverse.bookmarkId);
});

test('deleteBookmark removes and returns a recreate entry (url still matches)', async () => {
  const chrome = makeChrome();
  chrome.bookmarks.get = async (id) => [{ id, url: 'https://old.com', parentId: '1', index: 0, title: 'Old' }];
  const item = { action: 'deleteBookmark', data: { bookmarkId: '77', parentId: '1', index: 0, title: 'Old', url: 'https://old.com' } };
  const undo = await applyItem(item, { chrome });
  assert.deepEqual(chrome._removed, ['bm:77']);
  assert.equal(undo.reverse.url, 'https://old.com');
});

test('deleteBookmark refuses when the bookmark url no longer matches (edited since scan)', async () => {
  const chrome = makeChrome();
  chrome.bookmarks.get = async (id) => [{ id, url: 'https://EDITED.com', parentId: '1', index: 0, title: 'New' }];
  const item = { action: 'deleteBookmark', data: { bookmarkId: '77', parentId: '1', index: 0, title: 'Old', url: 'https://old.com' } };
  await assert.rejects(() => applyItem(item, { chrome }), /no longer matches/i);
  assert.deepEqual(chrome._removed, []); // nothing deleted
});

test('closeTab refuses to close a tab whose url no longer matches (id reuse guard)', async () => {
  const removed = [];
  const chrome = {
    tabs: { async get(id) { return { id, url: 'https://DIFFERENT.com' }; }, async remove(id) { removed.push(id); } },
    bookmarks: { async getChildren() { return []; }, async create(n) { return { id: '1', ...n }; } },
  };
  const item = { action: 'closeTab', data: { tabId: 3, url: 'https://a.com', title: 'A', windowId: 1, index: 0, pinned: false, bookmarkFirst: false } };
  await assert.rejects(() => applyItem(item, { chrome }), /stale|no longer matches/i);
  assert.deepEqual(removed, []); // nothing closed
});

test('closeTab proceeds when the url still matches', async () => {
  const removed = [];
  const chrome = {
    tabs: { async get(id) { return { id, url: 'https://a.com' }; }, async remove(id) { removed.push(id); } },
    bookmarks: { async getChildren() { return []; }, async create(n) { return { id: '1', ...n }; } },
  };
  const item = { action: 'closeTab', data: { tabId: 3, url: 'https://a.com', title: 'A', windowId: 1, index: 0, pinned: false, bookmarkFirst: false } };
  const undo = await applyItem(item, { chrome });
  assert.deepEqual(removed, [3]);
  assert.equal(undo.reverse.url, 'https://a.com');
});

test('applyItem stamps runId and a human label on the undo entry', async () => {
  const chrome = { tabs: { async get(id) { return { id, url: 'https://a.com' }; }, async remove() {} }, bookmarks: { async getChildren() { return []; }, async create(n) { return { id: '1', ...n }; } } };
  const item = { action: 'closeTab', data: { tabId: 3, url: 'https://a.com', title: 'A', windowId: 1, index: 0, pinned: false, bookmarkFirst: false } };
  const undo = await applyItem(item, { chrome, runId: 'run-1' });
  assert.equal(undo.runId, 'run-1');
  assert.match(undo.label, /Close tab.*A/);
});

test('discardTab suspends the tab', async () => {
  const discarded = [];
  const chrome = { tabs: { async discard(id) { discarded.push(id); } } };
  const undo = await applyItem({ action: 'discardTab', data: { tabId: 7, url: 'https://d.com', title: 'D' } }, { chrome });
  assert.deepEqual(discarded, [7]);
  assert.equal(undo.action, 'discardTab');
});

test('ensureFolder reuses an existing folder', async () => {
  const chrome = makeChrome();
  await ensureFolder(['Dev'], chrome);
  await ensureFolder(['Dev'], chrome);
  const devFolders = chrome._created.filter((c) => c.title === 'Dev');
  assert.equal(devFolders.length, 1); // created once, reused second time
});
