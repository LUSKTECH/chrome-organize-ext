import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicateTabs } from '../extension/lib/tab-health.js';

test('findDuplicateTabs keeps the most-recently-active copy, closes the rest', () => {
  const tabs = [
    { tabId: 1, title: 'A', url: 'https://a.com/x', windowId: 9, index: 0, pinned: false, lastActive: 100 },
    { tabId: 2, title: 'A dup', url: 'https://A.com/x/', windowId: 9, index: 1, pinned: false, lastActive: 500 },
    { tabId: 3, title: 'B', url: 'https://b.com', windowId: 9, index: 2, pinned: false, lastActive: 10 },
  ];
  const items = findDuplicateTabs(tabs);
  assert.equal(items.length, 1);
  assert.equal(items[0].action, 'closeTab');
  assert.equal(items[0].data.tabId, 1); // tab 2 is newer, kept; tab 1 closed
});

test('findDuplicateTabs never proposes closing a pinned tab', () => {
  const tabs = [
    { tabId: 1, title: 'A', url: 'https://a.com', windowId: 9, index: 0, pinned: true, lastActive: 1 },
    { tabId: 2, title: 'A', url: 'https://a.com', windowId: 9, index: 1, pinned: false, lastActive: 2 },
  ];
  const items = findDuplicateTabs(tabs);
  assert.ok(items.every((i) => i.data.tabId !== 1));
});
