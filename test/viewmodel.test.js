import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, groupByAction, toggleSelection, selectedItems, actionLabel, excludeMember, renameGroup, recolorGroup, itemsForAction, healthMessage } from '../extension/sidepanel/viewmodel.js';

const items = [
  { itemId: 'a', action: 'closeTab' },
  { itemId: 'b', action: 'closeTab' },
  { itemId: 'c', action: 'groupTabs' },
];

test('summarize counts per action', () => {
  assert.deepEqual(summarize(items), { closeTab: 2, groupTabs: 1 });
});

test('groupByAction buckets items', () => {
  const g = groupByAction(items);
  assert.equal(g.closeTab.length, 2);
  assert.equal(g.groupTabs.length, 1);
});

test('toggleSelection adds then removes', () => {
  let sel = new Set();
  sel = toggleSelection(sel, 'a');
  assert.ok(sel.has('a'));
  sel = toggleSelection(sel, 'a');
  assert.ok(!sel.has('a'));
});

test('selectedItems returns chosen items', () => {
  const sel = new Set(['a', 'c']);
  assert.deepEqual(selectedItems(sel, items).map((i) => i.itemId), ['a', 'c']);
});

test('actionLabel is human-readable', () => {
  assert.equal(actionLabel('closeTab'), 'Close tab');
  assert.equal(actionLabel('deleteBookmark'), 'Delete bookmark');
});

const groupItem = () => ({ itemId: 'group-0-0', action: 'groupTabs', status: 'pending', reason: 'x',
  data: { groupName: 'Work', color: 'blue', windowId: 9, tabIds: [1, 2], members: [{ tabId: 1, title: 'A', url: 'u1' }, { tabId: 2, title: 'B', url: 'u2' }] } });

test('excludeMember removes a tab from tabIds and members', () => {
  const it = excludeMember(groupItem(), 1);
  assert.deepEqual(it.data.tabIds, [2]);
  assert.equal(it.data.members.length, 1);
});

test('renameGroup and recolorGroup update data immutably', () => {
  const base = groupItem();
  const renamed = renameGroup(base, 'Research');
  assert.equal(renamed.data.groupName, 'Research');
  assert.equal(base.data.groupName, 'Work'); // original untouched
  assert.equal(recolorGroup(base, 'green').data.color, 'green');
});

test('itemsForAction filters by action', () => {
  const items = [groupItem(), { itemId: 'c', action: 'closeTab' }];
  assert.equal(itemsForAction(items, 'groupTabs').length, 1);
});

test('healthMessage reports connected vs not', () => {
  assert.deepEqual(healthMessage({ ready: true, version: '2.1.0' }), { ok: true, text: 'Claude CLI connected (2.1.0)' });
  const bad = healthMessage({ ready: false, error: 'not found' });
  assert.equal(bad.ok, false);
  assert.match(bad.text, /install-host/);
});
