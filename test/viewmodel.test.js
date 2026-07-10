import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, groupByAction, toggleSelection, selectedItems, actionLabel } from '../extension/sidepanel/viewmodel.js';

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
