import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapGroupResult, mapStaleResult, mapImportantResult, validatePlanItem, indexById, mapOrganizeResult } from '../extension/lib/plan.js';

test('mapOrganizeResult maps existing-folder + new-folder moves and drops no-ops', () => {
  const byId = new Map([
    ['9', { id: '9', parentId: '2', index: 0, title: 'MDN', url: 'https://mdn.dev' }],
    ['8', { id: '8', parentId: '2', index: 1, title: 'React', url: 'https://react.dev' }],
    ['7', { id: '7', parentId: '5', index: 0, title: 'Kept', url: 'https://k.dev' }],
  ]);
  const moves = [
    { bookmarkId: '9', targetFolderId: '5', reason: 'docs' },      // existing folder
    { bookmarkId: '8', newFolderPath: ['Dev', 'React'] },          // new folder
    { bookmarkId: '7', targetFolderId: '5' },                      // no-op (already in 5)
    { bookmarkId: 'nope', targetFolderId: '5' },                   // unknown -> dropped
  ];
  const folderPathById = new Map([['5', 'Other Bookmarks/Dev']]);
  const out = mapOrganizeResult(moves, byId, 'additive', '2', folderPathById);
  assert.equal(out.length, 2);
  const nine = out.find((i) => i.data.bookmarkId === '9');
  assert.equal(nine.action, 'moveBookmark');
  assert.equal(nine.data.toParentId, '5');
  assert.deepEqual(nine.data.fromParentId, '2');
  assert.equal(nine.data.toLabel, 'Dev');                    // leaf folder name (chip)
  assert.equal(nine.data.toPath, 'Other Bookmarks/Dev');     // full path (tooltip)
  assert.equal(nine.data.toNew, false);
  assert.equal(nine.reason, 'Move to Other Bookmarks/Dev');
  const eight = out.find((i) => i.data.bookmarkId === '8');
  assert.deepEqual(eight.data.toFolderPath, ['Dev', 'React']);
  assert.equal(eight.data.toRootId, '2');
  assert.equal(eight.data.toLabel, 'React');
  assert.equal(eight.data.toNew, true);
  assert.match(eight.reason, /Move to Dev\/React \(new folder\)/);
});

test('mapOrganizeResult in match mode rejects new-folder moves', () => {
  const byId = new Map([['8', { id: '8', parentId: '2', index: 0, title: 'R', url: 'https://r.dev' }]]);
  const out = mapOrganizeResult([{ bookmarkId: '8', newFolderPath: ['Dev'] }], byId, 'match');
  assert.deepEqual(out, []);
});

const tabs = [
  { tabId: 1, title: 'A', url: 'https://a.com', windowId: 9, index: 0, pinned: false, idleDays: 40 },
  { tabId: 2, title: 'B', url: 'https://b.com', windowId: 9, index: 1, pinned: false, idleDays: 50 },
];
const byId = indexById(tabs);

test('mapGroupResult only emits a window when 2+ of the group tabs land there', () => {
  const tabs = [
    { tabId: 1, title: 'A', url: 'https://a.com', windowId: 9, index: 0, pinned: false, idleDays: 1 },
    { tabId: 2, title: 'B', url: 'https://b.com', windowId: 9, index: 1, pinned: false, idleDays: 1 },
    { tabId: 3, title: 'C', url: 'https://c.com', windowId: 7, index: 0, pinned: false, idleDays: 1 },
  ];
  const byId = indexById(tabs);
  const items = mapGroupResult([{ name: 'Work', color: 'blue', tabIds: [1, 2, 3] }], byId);
  assert.equal(items.length, 1); // window 7 has only 1 of the group's tabs, so it's dropped
  const w9 = items.find((i) => i.data.windowId === 9);
  assert.deepEqual(w9.data.tabIds.sort(), [1, 2]);
  assert.equal(w9.data.members.length, 2);
  assert.equal(w9.data.members[0].title, 'A');
  assert.equal(items.find((i) => i.data.windowId === 7), undefined);
});

test('mapStaleResult resolves tab details and dedupes missing tabs', () => {
  const items = mapStaleResult([
    { tabId: 1, reason: 'old', suggestBookmark: true },
    { tabId: 99, reason: 'gone', suggestBookmark: false },
  ], byId);
  assert.equal(items.length, 1);
  assert.equal(items[0].action, 'closeTab');
  assert.equal(items[0].data.tabId, 1);
  assert.equal(items[0].data.url, 'https://a.com');
  assert.equal(items[0].data.bookmarkFirst, true);
});

test('mapImportantResult builds createBookmark items', () => {
  const items = mapImportantResult([{ tabId: 2, folderPath: ['Dev'], reason: 'ref' }], byId);
  assert.equal(items[0].action, 'createBookmark');
  assert.deepEqual(items[0].data.folderPath, ['Dev']);
  assert.equal(items[0].data.url, 'https://b.com');
});

test('validatePlanItem rejects malformed items', () => {
  assert.equal(validatePlanItem({ itemId: 'x', action: 'closeTab', status: 'pending', data: {} }), true);
  assert.equal(validatePlanItem({ action: 'nope' }), false);
  assert.equal(validatePlanItem(null), false);
});

test('mapStaleResult drops tabIds outside the candidate set (injection guard)', () => {
  const tabs = [
    { tabId: 1, title: 'A', url: 'https://a.com', windowId: 9, index: 0, pinned: false, idleDays: 40 },
    { tabId: 2, title: 'B', url: 'https://b.com', windowId: 9, index: 1, pinned: false, idleDays: 5 },
  ];
  const byId = indexById(tabs);
  const candidateIds = new Set([1]); // only tab 1 was sent as a candidate
  const items = mapStaleResult([{ tabId: 1, reason: 'old' }, { tabId: 2, reason: 'injected' }], byId, candidateIds);
  assert.equal(items.length, 1);
  assert.equal(items[0].data.tabId, 1);
});

test('mapStaleResult emits discardTab for suspend disposition', () => {
  const tabs = [{ tabId: 5, title: 'Docs', url: 'https://d.com', windowId: 1, index: 0, pinned: false, idleDays: 30 }];
  const byId = indexById(tabs);
  const items = mapStaleResult([{ tabId: 5, reason: 'keep but idle', action: 'suspend' }], byId, new Set([5]));
  assert.equal(items[0].action, 'discardTab');
  assert.equal(items[0].data.tabId, 5);
});
