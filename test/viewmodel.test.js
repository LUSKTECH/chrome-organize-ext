import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize, groupByAction, toggleSelection, selectedItems, actionLabel, excludeMember, renameGroup, recolorGroup, healthMessage, progressLabel, groupUndoByRun, digestText, toMarkdown, allItemIds, filterPlan, destructiveCount, needsBulkConfirm, adapterNote, formatElapsed } from '../extension/sidepanel/viewmodel.js';

const items = [
  { itemId: 'a', action: 'closeTab' },
  { itemId: 'b', action: 'closeTab' },
  { itemId: 'c', action: 'groupTabs' },
];

import { filterTabs, describeIgnoreKey, installCommand, moveMember } from '../extension/sidepanel/viewmodel.js';
import { groupByStatus, statusBucket, statusLabel } from '../extension/sidepanel/viewmodel.js';

test('groupByStatus buckets delete items by category/http status', () => {
  const del = [
    { category: 'dead', data: { httpStatus: 404 } },
    { category: 'dead', data: { httpStatus: 410 } },
    { category: 'dead', data: { httpStatus: 0 } },
    { category: 'dead', data: { httpStatus: 500 } },
    { category: 'duplicate', data: {} },
    { category: 'stale', data: {} },
  ];
  const g = groupByStatus(del);
  assert.equal(g['http-404'].length, 1);
  assert.equal(g['http-410'].length, 1);
  assert.equal(g['unreachable'].length, 1);
  assert.equal(g['dead-other'].length, 1);
  assert.equal(g['duplicate'].length, 1);
  assert.equal(g['stale'].length, 1);
  assert.equal(statusBucket({ category: 'dead', data: { httpStatus: 404 } }), 'http-404');
  assert.equal(statusLabel('http-404'), 'Not found (404)');
  assert.equal(statusLabel('unreachable'), 'Unreachable');
});

test('describeIgnoreKey renders a human label', () => {
  assert.equal(describeIgnoreKey('closeTab:https://a.com/x'), 'Close tab: https://a.com/x');
  assert.equal(describeIgnoreKey('deleteBookmark:https://b.com'), 'Delete bookmark: https://b.com');
});

test('installCommand embeds the extension id', () => {
  assert.equal(installCommand('abc123'), 'npx @lusktech/browser-organizer-host install chrome,edge abc123');
});

test('moveMember reassigns a tab between proposed groups', () => {
  const items = [
    { itemId: 'g0', action: 'groupTabs', data: { members: [{ tabId: 1, title: 'A' }, { tabId: 2, title: 'B' }], tabIds: [1, 2] } },
    { itemId: 'g1', action: 'groupTabs', data: { members: [{ tabId: 3, title: 'C' }], tabIds: [3] } },
  ];
  const out = moveMember(items, 'g0', 'g1', 2);
  assert.deepEqual(out.find((i) => i.itemId === 'g0').data.tabIds, [1]);
  assert.deepEqual(out.find((i) => i.itemId === 'g1').data.tabIds.sort(), [2, 3]);
});

test('filterTabs matches title, url, or host case-insensitively; empty query returns all', () => {
  const tabs = [
    { id: 1, title: 'React Docs', url: 'https://react.dev/learn' },
    { id: 2, title: 'Inbox', url: 'https://mail.google.com/' },
    { id: 3, title: 'Sports', url: 'https://nytimes.com/sports' },
  ];
  assert.deepEqual(filterTabs(tabs, 'react').map((t) => t.id), [1]);
  assert.deepEqual(filterTabs(tabs, 'google.com').map((t) => t.id), [2]);
  assert.deepEqual(filterTabs(tabs, 'SPORTS').map((t) => t.id), [3]);
  assert.equal(filterTabs(tabs, '').length, 3);
});

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

test('allItemIds returns every item id', () => {
  assert.deepEqual(allItemIds(items), ['a', 'b', 'c']);
});

test('filterPlan matches name/title/url/reason and group members', () => {
  const plan = [
    { itemId: 'g', action: 'groupTabs', data: { groupName: 'Work', members: [{ tabId: 1, title: 'Jira', url: 'https://x.com' }] } },
    { itemId: 't', action: 'closeTab', reason: 'idle', data: { title: 'News', url: 'https://news.example' } },
  ];
  assert.deepEqual(filterPlan(plan, 'work').map((i) => i.itemId), ['g']); // group name
  assert.deepEqual(filterPlan(plan, 'jira').map((i) => i.itemId), ['g']); // member title
  assert.deepEqual(filterPlan(plan, 'news').map((i) => i.itemId), ['t']); // item title
  assert.deepEqual(filterPlan(plan, 'idle').map((i) => i.itemId), ['t']); // reason
  assert.equal(filterPlan(plan, '').length, 2); // empty → unfiltered
  assert.equal(filterPlan(plan, 'zzz').length, 0);
});

test('destructiveCount / needsBulkConfirm count only close/suspend/delete', () => {
  const plan = [
    ...Array.from({ length: 3 }, (_, i) => ({ itemId: `c${i}`, action: 'closeTab' })),
    { itemId: 'd', action: 'deleteBookmark' },
    { itemId: 's', action: 'discardTab' },
    { itemId: 'g', action: 'groupTabs' },
    { itemId: 'b', action: 'createBookmark' },
  ];
  assert.equal(destructiveCount(plan), 5);
  assert.equal(needsBulkConfirm(plan, 10), false);
  assert.equal(needsBulkConfirm(plan, 5), true);
});

test('adapterNote warns for copilot only', () => {
  assert.match(adapterNote('copilot'), /Lower assurance/);
  assert.equal(adapterNote('claude'), '');
  assert.equal(adapterNote('ollama'), '');
});

test('formatElapsed renders m:ss', () => {
  assert.equal(formatElapsed(0), '0:00');
  assert.equal(formatElapsed(7000), '0:07');
  assert.equal(formatElapsed(75000), '1:15');
  assert.equal(formatElapsed(-5), '0:00');
});

test('healthMessage reports connected vs not', () => {
  assert.deepEqual(healthMessage({ ready: true, version: '2.1.0' }), { ok: true, text: 'Claude CLI connected (2.1.0)' });
  const bad = healthMessage({ ready: false, error: 'not found' });
  assert.equal(bad.ok, false);
  assert.match(bad.text, /browser-organizer-host/);
});

test('healthMessage labels the connected adapter', () => {
  assert.deepEqual(healthMessage({ ready: true, version: '1.0', adapter: 'antigravity' }), { ok: true, text: 'Antigravity CLI connected (1.0)' });
  assert.deepEqual(healthMessage({ ready: true, version: '2.0', adapter: 'kiro' }), { ok: true, text: 'Kiro CLI connected (2.0)' });
  assert.deepEqual(healthMessage({ ready: true, version: '1.3', adapter: 'copilot' }), { ok: true, text: 'Copilot CLI connected (1.3)' });
  assert.deepEqual(healthMessage({ ready: true, version: '0.9', adapter: 'codex' }), { ok: true, text: 'Codex CLI connected (0.9)' });
  assert.deepEqual(healthMessage({ ready: true, version: '0.5', adapter: 'ollama' }), { ok: true, text: 'Ollama connected (0.5)' });
  assert.deepEqual(healthMessage({ ready: true, version: 'openai-compatible (gpt-4o)', adapter: 'openai' }), { ok: true, text: 'OpenAI-compatible API connected (openai-compatible (gpt-4o))' });
});

test('healthMessage: openai adapter gives API-key guidance, not a CLI install step', () => {
  const m = healthMessage({ ready: false, error: 'OpenAI API 401', adapter: 'openai' }, 'abcdef123');
  assert.equal(m.ok, false);
  assert.match(m.text, /API key/i);
  assert.match(m.text, /Settings/);
  assert.match(m.text, /OpenAI-compatible API/);
  assert.doesNotMatch(m.text, /browser-organizer-host|--version/); // not CLI-flavored
});

test('healthMessage: host-missing error gives the install step with the real extension id', () => {
  const m = healthMessage({ ready: false, error: 'Specified native messaging host not found.' }, 'abcdef123');
  assert.equal(m.ok, false);
  assert.match(m.text, /browser-organizer-host install chrome,edge abcdef123/);
  assert.match(m.text, /reload/i);           // tells the user to reload
  assert.doesNotMatch(m.text, /<EXTENSION_ID>/); // no literal placeholder
});

test('healthMessage: CLI-missing error points at the claude CLI, not install-host', () => {
  const m = healthMessage({ ready: false, error: 'spawn claude ENOENT' }, 'abcdef123');
  assert.equal(m.ok, false);
  assert.match(m.text, /claude --version/);
  assert.doesNotMatch(m.text, /browser-organizer-host/); // wrong fix for this cause
});

test('progressLabel formats phase progress', () => {
  assert.equal(progressLabel('Grouping tabs', 2, 4), 'Grouping tabs… (2/4)');
});

test('groupUndoByRun buckets entries by run, newest first', () => {
  const entries = [{ runId: 'a', ts: 1, label: 'x' }, { runId: 'a', ts: 2, label: 'y' }, { runId: 'b', ts: 5, label: 'z' }];
  const runs = groupUndoByRun(entries);
  assert.equal(runs.length, 2);
  assert.equal(runs[0].runId, 'b'); // newest run first
  assert.equal(runs[1].entries.length, 2);
});

test('digestText summarizes counts or says all tidy', () => {
  assert.match(digestText([{ action: 'closeTab' }, { action: 'closeTab' }, { action: 'groupTabs' }]), /2 tabs to close.*1 group/i);
  assert.match(digestText([]), /tidy|nothing/i);
});

test('toMarkdown renders groups with member links and includes non-group items', () => {
  const items = [
    { action: 'groupTabs', data: { groupName: 'Dev', members: [{ title: 'MDN', url: 'https://mdn.dev' }] } },
    { action: 'closeTab', reason: 'Idle 30d', data: { title: 'Old tab', url: 'https://old.com' } },
    { action: 'deleteBookmark', data: { title: 'Dead bookmark', url: 'https://dead.com' } },
  ];
  const md = toMarkdown(items);
  assert.match(md, /\*\*Dev\*\*/);
  assert.match(md, /\[MDN\]\(https:\/\/mdn\.dev\)/);
  assert.match(md, /\[Old tab\]\(https:\/\/old\.com\)/);   // non-group item included
  assert.match(md, /\[Dead bookmark\]\(https:\/\/dead\.com\)/);
});
