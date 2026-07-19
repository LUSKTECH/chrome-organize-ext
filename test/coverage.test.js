// Targeted tests closing the remaining coverage gaps (error/default branches and
// mock-heavy paths). Grouped here to keep the per-feature suites focused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installChromeMock } from './helpers/chrome-mock.js';
import { makeFakeSpawn } from './helpers/fake-spawn.js';

import { parseJsonBlock } from '../native-host/parse.js';
import { handle } from '../native-host/dispatch.js';
import { runCli, cliVersion } from '../native-host/adapters/run-cli.js';
import { claudeAdapter } from '../native-host/adapters/claude.js';
import { applyItem } from '../extension/lib/executor.js';
import { reverseEntry } from '../extension/lib/undo-log.js';
import { moveMember } from '../extension/sidepanel/viewmodel.js';
import { hasAllUrls, buildPlan } from '../extension/lib/orchestrator.js';
import { installActivityListeners } from '../extension/lib/activity-tracker.js';
import { createNativeClient } from '../extension/lib/native-client.js';
import { restoreSession, saveSessions, buildSession, listSessions } from '../extension/lib/sessions.js';
import { checkDeadLinks } from '../extension/lib/bookmark-health.js';
import { install } from '../native-host/installer.js';

// ---- parser / dispatch / executor / undo error paths ----
test('parseJsonBlock throws when a brace never balances', () => {
  assert.throws(() => parseJsonBlock('note { "a": 1 with no close'), /No JSON/);
});

test('dispatch rejects an unknown organize task', async () => {
  const getAdapter = () => ({ name: 'fake', async run() { return '{}'; }, async health() { return { version: 't' }; } });
  await assert.rejects(() => handle({ type: 'organize', task: 'bogus', payload: { tabs: [] } }, { getAdapter }), /Unknown task/);
});

test('applyItem throws on an unknown action', async () => {
  await assert.rejects(() => applyItem({ action: 'bogus', data: {} }, { chrome: {} }), /Unknown action/);
});

test('reverseEntry throws on an unreversible action', async () => {
  await assert.rejects(() => reverseEntry({ action: 'bogus', reverse: {} }, {}), /Cannot reverse/);
});

// ---- viewmodel.moveMember edge branches ----
test('moveMember returns input unchanged when the member is not found', () => {
  const items = [{ itemId: 'g0', action: 'groupTabs', data: { members: [{ tabId: 1 }], tabIds: [1] } }];
  assert.equal(moveMember(items, 'g0', 'g1', 999), items); // same reference (early return)
});

test('moveMember leaves unrelated items untouched', () => {
  const items = [
    { itemId: 'g0', action: 'groupTabs', data: { members: [{ tabId: 1 }, { tabId: 2 }], tabIds: [1, 2] } },
    { itemId: 'g1', action: 'groupTabs', data: { members: [{ tabId: 3 }], tabIds: [3] } },
    { itemId: 'x', action: 'closeTab', data: { tabId: 9 } },
  ];
  const out = moveMember(items, 'g0', 'g1', 2);
  assert.deepEqual(out.find((i) => i.itemId === 'x'), items[2]);
});

// ---- orchestrator: hasAllUrls + dead-link scan block ----
test('hasAllUrls: false without permissions API, delegates to contains otherwise', async () => {
  assert.equal(await hasAllUrls({}), false);
  assert.equal(await hasAllUrls({ permissions: { async contains() { return true; } } }), true);
});

test('buildPlan executes the dead-link scan block when enabled and permitted', async () => {
  const stored = {};
  const chromeApi = {
    storage: { local: { async get(k) { return typeof k === 'string' ? { [k]: stored[k] } : { ...stored }; }, async set(o) { Object.assign(stored, o); } } },
    tabs: { async query() { return []; } },
    // private host → checkDeadLinks skips it (no real network) but the block still runs
    bookmarks: { async getTree() { return [{ id: '0', children: [{ id: '1', title: 'Router', url: 'http://192.168.1.1/admin', parentId: '0', index: 0, dateAdded: Date.now() }] }]; } },
    history: { async getVisits() { return []; } },
    permissions: { async contains() { return true; } },
  };
  const nativeClient = { request: async () => ({ groups: [], stale: [], important: [] }) };
  const settings = { adapter: 'claude', enabledFeatures: { groupTabs: false, staleTabs: false, importantBookmarks: false, cleanBookmarks: true, deadLinkScan: true, dupeTabs: false }, staleTabDays: 14, staleBookmarkDays: 180, deadLinkBatchSize: 200 };
  await buildPlan({ settings, nativeClient, chromeApi, now: Date.now() });
  assert.ok('deadCursor' in stored, 'dead-link scan block ran and advanced the cursor');
});

test('buildPlan warns to update the helper when the host rejects the organize task', async () => {
  const stored = {};
  const chromeApi = {
    storage: { local: { async get(k) { return typeof k === 'string' ? { [k]: stored[k] } : { ...stored }; }, async set(o) { Object.assign(stored, o); } } },
    tabs: { async query() { return []; } },
    bookmarks: { async getTree() { return [{ id: '0', children: [{ id: '2', title: 'Other Bookmarks', parentId: '0', index: 0, children: [{ id: '9', title: 'Loose', url: 'https://x.com', parentId: '2', index: 0 }] }] }]; } },
    history: { async getVisits() { return []; } },
  };
  // An old host doesn't know the task and rejects it.
  const nativeClient = { request: async (m) => { if (m.task === 'organize-bookmarks') throw new Error('Unknown task: organize-bookmarks'); return { groups: [], stale: [], important: [] }; } };
  const settings = { adapter: 'claude', enabledFeatures: { groupTabs: false, staleTabs: false, importantBookmarks: false, cleanBookmarks: false, dupeTabs: false, organizeBookmarks: true }, organizeMode: 'additive', staleTabDays: 14, staleBookmarkDays: 180, deadLinkBatchSize: 200 };
  const warnings = [];
  await buildPlan({ settings, nativeClient, chromeApi, now: 1, onWarning: (w) => warnings.push(w) });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /out of date|update/i);
});

function organizeChromeApi() {
  const stored = {};
  return {
    storage: { local: { async get(k) { return typeof k === 'string' ? { [k]: stored[k] } : { ...stored }; }, async set(o) { Object.assign(stored, o); } } },
    tabs: { async query() { return []; } },
    bookmarks: { async getTree() { return [{ id: '0', children: [{ id: '2', title: 'Other Bookmarks', parentId: '0', index: 0, children: [{ id: '9', title: 'Loose', url: 'https://x.com', parentId: '2', index: 0 }] }] }]; } },
    history: { async getVisits() { return []; } },
  };
}
const organizeSettings = { adapter: 'claude', enabledFeatures: { groupTabs: false, staleTabs: false, importantBookmarks: false, cleanBookmarks: false, dupeTabs: false, organizeBookmarks: true }, organizeMode: 'additive', staleTabDays: 14, staleBookmarkDays: 180, deadLinkBatchSize: 200 };

test('buildPlan warns when the model returns no moves for loose bookmarks', async () => {
  const nativeClient = { request: async (m) => (m.task === 'organize-bookmarks' ? { moves: [] } : { groups: [], stale: [], important: [] }) };
  const warnings = [];
  await buildPlan({ settings: organizeSettings, nativeClient, chromeApi: organizeChromeApi(), now: 1, onWarning: (w) => warnings.push(w) });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /proposed no moves|no moves/i);
});

test('buildPlan warns when the model returns moves that match no bookmark', async () => {
  const nativeClient = { request: async (m) => (m.task === 'organize-bookmarks' ? { moves: [{ bookmarkId: 'not-a-real-id', targetFolderId: '5' }] } : { groups: [], stale: [], important: [] }) };
  const warnings = [];
  const items = await buildPlan({ settings: organizeSettings, nativeClient, chromeApi: organizeChromeApi(), now: 1, onWarning: (w) => warnings.push(w) });
  assert.equal(items.filter((i) => i.action === 'moveBookmark').length, 0);
  assert.match(warnings[0], /none matched|didn't line up/i);
});

test('buildPlan runs the important-bookmarks phase', async () => {
  const stored = {};
  const chromeApi = {
    storage: { local: { async get(k) { return typeof k === 'string' ? { [k]: stored[k] } : { ...stored }; }, async set(o) { Object.assign(stored, o); } } },
    tabs: { async query() { return [{ id: 1, url: 'https://a.com', windowId: 1, index: 0, groupId: -1 }]; } },
    bookmarks: { async getTree() { return []; } },
    history: { async getVisits() { return []; } },
  };
  let importantAsked = false;
  const nativeClient = { request: async (m) => { if (m.task === 'important') { importantAsked = true; return { important: [{ tabId: 1, folderPath: ['Dev'], reason: 'ref' }] }; } return { groups: [], stale: [], important: [] }; } };
  const settings = { adapter: 'claude', enabledFeatures: { groupTabs: false, staleTabs: false, importantBookmarks: true, cleanBookmarks: false, dupeTabs: false }, staleTabDays: 14, staleBookmarkDays: 180, deadLinkBatchSize: 200 };
  const items = await buildPlan({ settings, nativeClient, chromeApi, now: 1 });
  assert.ok(importantAsked);
  assert.ok(items.some((i) => i.action === 'createBookmark'));
});

// ---- dispatch important task ----
test('dispatch handles the important task', async () => {
  const getAdapter = () => ({ name: 'fake', async run() { return '{"important":[{"tabId":1,"folderPath":["Dev"],"reason":"ref"}]}'; } });
  const r = await handle({ type: 'organize', task: 'important', payload: { tabs: [{ tabId: 1, title: 't', url: 'https://x.com' }], rules: '' } }, { getAdapter });
  assert.equal(r.task, 'important');
  assert.equal(r.important[0].tabId, 1);
});

// ---- run-cli timeout ----
test('runCli rejects when the CLI exceeds the timeout', async () => {
  const spawnFn = makeFakeSpawn(() => ({ stdout: 'late', delay: 50 }));
  await assert.rejects(() => runCli({ command: 'x', args: [], spawnFn, timeoutMs: 5 }), /timed out/);
});

// ---- activity-tracker listeners ----
test('installActivityListeners persists activity on tab events', async () => {
  const stored = {};
  let onActivated; let onUpdated;
  const chromeApi = {
    storage: { local: { async get(k) { return typeof k === 'string' ? { [k]: stored[k] } : { ...stored }; }, async set(o) { Object.assign(stored, o); } } },
    tabs: { onActivated: { addListener: (fn) => { onActivated = fn; } }, onUpdated: { addListener: (fn) => { onUpdated = fn; } } },
  };
  installActivityListeners(chromeApi);
  onActivated({ tabId: 7 });
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(stored.tabActivity && stored.tabActivity[7]);
  onUpdated(8, { status: 'complete' });
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(stored.tabActivity[8]);
  onUpdated(9, { status: 'loading' }); // not "complete" → ignored
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(!stored.tabActivity[9]);
});

// ---- native-client disconnect ----
test('native client disconnect() closes the port, rejects in-flight requests, and is idempotent', async () => {
  let disconnected = 0;
  const port = { postMessage() {}, onMessage: { addListener() {} }, onDisconnect: { addListener() {} }, disconnect() { disconnected += 1; } };
  const client = createNativeClient({ connectNative: () => port });
  const inflight = client.request({ type: 'health' }); // opens the port, arms a timeout
  client.disconnect();
  client.disconnect(); // no-op (port already null)
  assert.equal(disconnected, 1);
  await assert.rejects(() => inflight, /disconnected/); // pending request settled, timer cleared
});

// ---- sessions.restoreSession ----
test('restoreSession recreates tabs in a new window; null for unknown id', async () => {
  installChromeMock();
  await saveSessions([buildSession('S', [{ url: 'https://a.com', title: 'A', pinned: false }], 1)]);
  const created = [];
  const chromeApi = { windows: { async create() { return { id: 42 }; } }, tabs: { async create(t) { created.push(t); } } };
  const [s] = await listSessions();
  const restored = await restoreSession(s.sessionId, { chrome: chromeApi });
  assert.ok(restored);
  assert.deepEqual(created, [{ windowId: 42, url: 'https://a.com', pinned: false, active: false }]);
  assert.equal(await restoreSession('nope', { chrome: chromeApi }), null);
});

// ---- run-cli cap / error / version ----
test('runCli rejects when stdout exceeds the cap', async () => {
  const spawnFn = makeFakeSpawn(() => ({ stdout: 'x'.repeat(50) }));
  await assert.rejects(() => runCli({ command: 'x', args: [], usesStdin: false, spawnFn, maxStdout: 10 }), /size limit/);
});

test('runCli rejects on spawn error', async () => {
  const spawnFn = () => { throw new Error('spawn failed'); };
  await assert.rejects(() => runCli({ command: 'x', args: [], spawnFn }), /spawn failed/);
});

test('runCli rejects (does not crash) when child stdin emits an error', async () => {
  const spawnFn = () => ({
    stdout: { on() {} }, stderr: { on() {} }, on() {}, kill() {},
    stdin: { on(ev, cb) { if (ev === 'error') setTimeout(() => cb(new Error('EPIPE')), 0); }, write() {}, end() {} },
  });
  await assert.rejects(() => runCli({ command: 'x', args: [], usesStdin: true, spawnFn, timeoutMs: 5000 }), /EPIPE/);
});

test('cliVersion returns version and rejects on nonzero exit', async () => {
  const ok = await cliVersion({ command: 'x', spawnFn: makeFakeSpawn(() => ({ stdout: '1.2.3' })) });
  assert.match(ok.version, /1\.2\.3/);
  await assert.rejects(() => cliVersion({ command: 'x', spawnFn: makeFakeSpawn(() => ({ code: 1 })) }), /exited/);
});

test('claude adapter rejects when stdout exceeds its size cap', async () => {
  const big = 'x'.repeat(5 * 1024 * 1024 + 16);
  const spawnFn = makeFakeSpawn(() => ({ stdout: big }));
  await assert.rejects(() => claudeAdapter.run('p', { spawnFn }), /size limit/);
});

// ---- bookmark-health 405 → GET fallback ----
test('dead-link check falls back to GET on 405 and flags 404', async () => {
  const methods = [];
  const fetchFn = async (url, opts) => { methods.push(opts.method); return { status: opts.method === 'HEAD' ? 405 : 404 }; };
  const items = await checkDeadLinks([{ id: '1', url: 'https://x.com', parentId: '1', index: 0, title: 'x' }], { fetchFn, concurrency: 1 });
  assert.deepEqual(methods, ['HEAD', 'GET']);
  assert.equal(items.length, 1);
});

// ---- install() body: linux write + win32 registry ----
test('install() writes launcher + manifest (linux) and returns registry commands (win32)', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'borg-home-'));
  const hostDir = fs.mkdtempSync(path.join(os.tmpdir(), 'borg-host-'));
  try {
    const files = install({ extensionId: 'abc123', browsers: ['chrome'], platform: 'linux', home, hostDir, nodePath: '/usr/bin/node' });
    assert.ok(files.some((f) => f.endsWith('run.sh')));
    assert.ok(files.some((f) => f.includes('NativeMessagingHosts')));
    for (const f of files) assert.ok(fs.existsSync(f), `exists: ${f}`);

    const win = install({ extensionId: 'abc123', browsers: ['chrome'], platform: 'win32', home, hostDir, nodePath: 'C:\\node.exe' });
    assert.ok(win.some((f) => f.endsWith('run.bat')));
    assert.equal(win._registryCommands.length, 1);
    assert.deepEqual(win._registryCommands[0].slice(0, 2), ['reg', 'add']);

    // uninstall removes the linux manifest and returns win32 registry-delete argv
    const { uninstall } = await import('../native-host/installer.js');
    const removed = uninstall({ browsers: ['chrome'], platform: 'linux', home, hostDir });
    assert.ok(removed.some((f) => f.includes('NativeMessagingHosts')));
    for (const f of removed) assert.ok(!fs.existsSync(f), `removed: ${f}`);
    const winRemoved = uninstall({ browsers: ['chrome'], platform: 'win32', home, hostDir });
    assert.deepEqual(winRemoved._registryCommands[0].slice(0, 2), ['reg', 'delete']);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(hostDir, { recursive: true, force: true });
  }
});

test('runCli caps stderr so a noisy CLI cannot exhaust host memory', async () => {
  const big = 'e'.repeat(2 * 1024 * 1024); // 2 MB stderr in one chunk
  const spawnFn = makeFakeSpawn(() => ({ stderr: big, code: 1 }));
  await assert.rejects(
    () => runCli({ command: 'x', args: [], spawnFn, maxStderr: 1024 }),
    (err) => { assert.ok(err.message.length < 4096, `stderr should be capped, got ${err.message.length}`); return /CLI exited 1/.test(err.message); },
  );
});

test('runCli spawns detached on POSIX (so the whole process tree can be killed)', async () => {
  let seenOpts = null;
  const spawnFn = makeFakeSpawn((_stdin, _cmd, _args, options) => { seenOpts = options; return { stdout: '{}' }; });
  await runCli({ command: 'x', args: [], usesStdin: true, spawnFn });
  assert.equal(seenOpts.detached, process.platform !== 'win32');
});
