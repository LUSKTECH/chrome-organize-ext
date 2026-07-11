import { getSettings, setSettings } from '../lib/storage.js';
import { installActivityListeners } from '../lib/activity-tracker.js';
import { createNativeClient } from '../lib/native-client.js';
import { buildPlan, partitionForApply, applyItems, runCommand, recordDecision } from '../lib/orchestrator.js';
import { applyItem } from '../lib/executor.js';
import { recordUndo, reverseEntry, pruneUndo, getUndoLog } from '../lib/undo-log.js';
import { listSessions, saveCurrentWindowSession, restoreSession, removeSession, saveSessions, renameSession } from '../lib/sessions.js';
import { parseOmnibox } from '../lib/omnibox.js';
import { digestText } from '../sidepanel/viewmodel.js';

const ALARM_SCAN = 'organizer-scan';
const ALARM_PRUNE = 'organizer-prune';

// Progress streaming: the panel opens a port named 'scan' before requesting a
// run; runScan broadcasts {progress} to every connected scan port. Cancel is
// a simple in-memory flag flipped by the {cmd:'cancel'} handler and read
// synchronously by buildPlan's shouldCancel — the port keeps the worker alive
// for the duration of the scan so the flag is not lost to worker teardown.
const scanPorts = new Set();
let cancelRequested = false;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'scan') return;
  scanPorts.add(port);
  port.onDisconnect.addListener(() => scanPorts.delete(port));
});

function broadcastProgress(phase, done, total) {
  for (const port of scanPorts) {
    try { port.postMessage({ progress: { phase, done, total } }); } catch { /* port gone */ }
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await chrome.alarms.create(ALARM_SCAN, { periodInMinutes: settings.scanIntervalMinutes });
  await chrome.alarms.create(ALARM_PRUNE, { periodInMinutes: 1440 });
});

// Keep the scheduled-scan cadence in sync when settings change (it's otherwise
// frozen at the install-time default).
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'sync' || !changes.settings) return;
  const settings = await getSettings();
  await chrome.alarms.create(ALARM_SCAN, { periodInMinutes: settings.scanIntervalMinutes });
});

chrome.runtime.onStartup.addListener(async () => {
  const now = Date.now();
  const rawTabs = await chrome.tabs.query({});
  const { tabActivity = {} } = await chrome.storage.local.get('tabActivity');
  const { reconcile } = await import('../lib/activity-tracker.js');
  await chrome.storage.local.set({ tabActivity: reconcile(tabActivity, rawTabs, now) });
  await chrome.storage.local.remove('currentPlan'); // stale plan (see Task 6)
});

installActivityListeners(chrome);

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'run-scan') await runScan({ background: true });
  if (command === 'open-panel') {
    const win = await chrome.windows.getLastFocused();
    await chrome.sidePanel.open({ windowId: win.id });
  }
});

chrome.omnibox.onInputEntered.addListener(async (text) => {
  const { instruction } = parseOmnibox(text);
  if (!instruction) return;
  const settings = await getSettings();
  const win = await chrome.windows.getLastFocused();
  const client = createNativeClient();
  try {
    const items = await runCommand(instruction, { nativeClient: client, windowId: win.id, decisions: settings.decisions || {}, adapter: settings.adapter });
    await chrome.storage.local.set({ currentPlan: items });
    await chrome.sidePanel.open({ windowId: win.id });
  } finally {
    client.disconnect();
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const settings = await getSettings();
  if (alarm.name === ALARM_PRUNE) {
    await pruneUndo(Date.now(), settings.undoRetentionDays);
    return;
  }
  if (alarm.name === ALARM_SCAN && settings.automationMode === 'auto') {
    await runScan({ background: true });
  }
});

async function runScan(deps = {}) {
  const settings = await getSettings();
  const nativeClient = createNativeClient();
  try {
    const items = await buildPlan({ settings, nativeClient, onProgress: deps.onProgress, shouldCancel: deps.shouldCancel, features: deps.features, windowId: deps.windowId ?? null });
    const { autoApply, needsReview } = partitionForApply(items, settings);
    await chrome.storage.local.set({ currentPlan: needsReview });
    if (autoApply.length) {
      const runId = `run-${Date.now()}`;
      const res = await applyItems(autoApply, { runId, applyItem: (i) => applyItem(i, { runId }), recordUndo });
      await notify(`Applied ${res.applied.length} changes (${res.failed.length} failed). Undo available.`);
    } else if (needsReview.length && deps.background) {
      // Only notify for background/scheduled scans; a foreground run already shows the panel.
      await notify(digestText(needsReview));
    }
    return items;
  } finally {
    nativeClient.disconnect();
  }
}

// Clicking a background digest notification opens the panel.
chrome.notifications.onClicked.addListener(async () => {
  const win = await chrome.windows.getLastFocused();
  await chrome.sidePanel.open({ windowId: win.id });
});

async function notify(message) {
  try {
    await chrome.notifications.create({ type: 'basic', title: 'Browser Organizer', message });
  } catch { /* notifications are best-effort */ }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.cmd === 'run') {
        cancelRequested = false;
        const items = await runScan({ onProgress: broadcastProgress, shouldCancel: () => cancelRequested, features: message.features, windowId: message.windowId ?? null });
        sendResponse({ ok: true, items });
      } else if (message.cmd === 'cancel') {
        cancelRequested = true;
        sendResponse({ ok: true });
      } else if (message.cmd === 'ignore') {
        const settings = await getSettings();
        const next = [...new Set([...(settings.ignore || []), ...(message.keys || [])])];
        let decisions = settings.decisions || {};
        for (const item of message.items || []) decisions = recordDecision(decisions, item, 'reject');
        await setSettings({ ignore: next, decisions });
        sendResponse({ ok: true, ignore: next });
      } else if (message.cmd === 'listOpenTabs') {
        const all = await chrome.tabs.query(message.windowId ? { windowId: message.windowId } : {});
        const tabs = all.filter((t) => /^https?:/i.test(t.url || ''))
          .map((t) => ({ id: t.id, title: t.title || '', url: t.url, pinned: !!t.pinned, windowId: t.windowId }));
        sendResponse({ ok: true, tabs });
      } else if (message.cmd === 'closeTabs') {
        // Manual, explicit bulk close (no AI). Records undo so it's reversible.
        const runId = `run-${Date.now()}`;
        const entries = [];
        const validIds = [];
        for (const id of message.tabIds || []) {
          const t = await chrome.tabs.get(id).catch(() => null);
          if (!t) continue;
          validIds.push(id);
          entries.push({ undoId: `${Date.now()}-${id}-${Math.random().toString(36).slice(2)}`, runId, ts: Date.now(), action: 'closeTab', label: `Close tab: ${t.title || t.url}`, reverse: { url: t.url, windowId: t.windowId, index: t.index, pinned: t.pinned } });
        }
        if (validIds.length) {
          await chrome.tabs.remove(validIds).catch(() => {});
          await recordUndo(entries);
        }
        sendResponse({ ok: true, closed: validIds.length });
      } else if (message.cmd === 'getPlan') {
        const { currentPlan = [] } = await chrome.storage.local.get('currentPlan');
        sendResponse({ ok: true, items: currentPlan });
      } else if (message.cmd === 'updatePlan') {
        await chrome.storage.local.set({ currentPlan: message.items || [] });
        sendResponse({ ok: true });
      } else if (message.cmd === 'apply') {
        const { currentPlan = [] } = await chrome.storage.local.get('currentPlan');
        const chosen = currentPlan.filter((i) => message.itemIds.includes(i.itemId));
        const runId = `run-${Date.now()}`;
        const res = await applyItems(chosen, { runId, applyItem: (i) => applyItem(i, { runId }), recordUndo });
        const remaining = currentPlan.filter((i) => !res.applied.includes(i.itemId));
        await chrome.storage.local.set({ currentPlan: remaining });
        sendResponse({ ok: true, ...res });
      } else if (message.cmd === 'undo') {
        const log = await getUndoLog();
        const chosen = log.filter((e) => message.undoIds.includes(e.undoId));
        const undoneIds = [];
        for (const entry of chosen) {
          try { await reverseEntry(entry, chrome); undoneIds.push(entry.undoId); } catch { /* keep entry so the user can retry */ }
        }
        // Only drop entries whose reversal actually succeeded.
        const undoneSet = new Set(undoneIds);
        await chrome.storage.local.set({ undoLog: log.filter((e) => !undoneSet.has(e.undoId)) });
        sendResponse({ ok: true, undone: undoneIds.length, failed: chosen.length - undoneIds.length });
      } else if (message.cmd === 'getUndo') {
        sendResponse({ ok: true, entries: await getUndoLog() });
      } else if (message.cmd === 'command') {
        const settings = await getSettings();
        const nativeClient = createNativeClient();
        try {
          const items = await runCommand(message.instruction, { nativeClient, windowId: message.windowId ?? null, decisions: settings.decisions || {}, adapter: settings.adapter });
          await chrome.storage.local.set({ currentPlan: items });
          sendResponse({ ok: true, items });
        } finally {
          nativeClient.disconnect();
        }
      } else if (message.cmd === 'saveSession') {
        const session = await saveCurrentWindowSession(message.name, { chrome, close: message.close !== false });
        sendResponse({ ok: true, session });
      } else if (message.cmd === 'renameSession') {
        await saveSessions(renameSession(await listSessions(), message.id, message.name));
        sendResponse({ ok: true });
      } else if (message.cmd === 'listSessions') {
        sendResponse({ ok: true, sessions: await listSessions() });
      } else if (message.cmd === 'restoreSession') {
        const session = await restoreSession(message.id, { chrome });
        sendResponse({ ok: true, session });
      } else if (message.cmd === 'deleteSession') {
        await saveSessions(removeSession(await listSessions(), message.id));
        sendResponse({ ok: true });
      } else if (message.cmd === 'health') {
        const settings = await getSettings();
        const client = createNativeClient();
        try { sendResponse({ ok: true, health: await client.request({ type: 'health', adapter: settings.adapter }) }); }
        catch (err) { sendResponse({ ok: true, health: { ready: false, error: String((err && err.message) || err) } }); }
        finally { client.disconnect(); }
      } else {
        sendResponse({ ok: false, error: 'unknown command' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String((err && err.message) || err) });
    }
  })();
  return true; // async response
});
