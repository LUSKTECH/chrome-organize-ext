import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyItem, ensureFolder } from '../extension/lib/executor.js';

function makeChrome() {
  const removed = [];
  const created = [];
  let nextBmId = 100;
  const folders = { '1': [] }; // bookmarks-bar children
  return {
    _removed: removed,
    _created: created,
    tabs: {
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
    },
  };
}

test('closeTab removes the tab and returns a reopen undo entry', async () => {
  const chrome = makeChrome();
  const item = { action: 'closeTab', data: { tabId: 3, url: 'https://a.com', title: 'A', windowId: 1, index: 2, pinned: false, bookmarkFirst: false } };
  const undo = await applyItem(item, { chrome });
  assert.deepEqual(chrome._removed, [3]);
  assert.equal(undo.action, 'closeTab');
  assert.equal(undo.reverse.url, 'https://a.com');
});

test('closeTab with bookmarkFirst saves before closing', async () => {
  const chrome = makeChrome();
  const item = { action: 'closeTab', data: { tabId: 3, url: 'https://a.com', title: 'A', windowId: 1, index: 2, pinned: false, bookmarkFirst: true } };
  await applyItem(item, { chrome });
  assert.equal(chrome._created.length, 3); // 2 folders + 1 bookmark
  assert.equal(chrome._created.at(-1).url, 'https://a.com');
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

test('deleteBookmark removes and returns a recreate entry', async () => {
  const chrome = makeChrome();
  const item = { action: 'deleteBookmark', data: { bookmarkId: '77', parentId: '1', index: 0, title: 'Old', url: 'https://old.com' } };
  const undo = await applyItem(item, { chrome });
  assert.deepEqual(chrome._removed, ['bm:77']);
  assert.equal(undo.reverse.url, 'https://old.com');
});

test('ensureFolder reuses an existing folder', async () => {
  const chrome = makeChrome();
  await ensureFolder(['Dev'], chrome);
  await ensureFolder(['Dev'], chrome);
  const devFolders = chrome._created.filter((c) => c.title === 'Dev');
  assert.equal(devFolders.length, 1); // created once, reused second time
});
