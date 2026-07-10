import { getSettings, setSettings } from '../lib/storage.js';
import { installActivityListeners } from '../lib/activity-tracker.js';
import { createNativeClient } from '../lib/native-client.js';
import { buildPlan, partitionForApply, applyItems, runCommand } from '../lib/orchestrator.js';
import { applyItem } from '../lib/executor.js';
import { recordUndo, reverseEntry, pruneUndo, getUndoLog } from '../lib/undo-log.js';
import { listSessions, saveCurrentWindowSession, restoreSession, removeSession, saveSessions } from '../lib/sessions.js';

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

chrome.runtime.onStartup.addListener(async () => {
  const now = Date.now();
  const rawTabs = await chrome.tabs.query({});
  const { tabActivity = {} } = await chrome.storage.local.get('tabActivity');
  const { reconcile } = await import('../lib/activity-tracker.js');
  await chrome.storage.local.set({ tabActivity: reconcile(tabActivity, rawTabs, now) });
  await chrome.storage.local.remove('currentPlan'); // stale plan (see Task 6)
});

installActivityListeners(chrome);

chrome.alarms.onAlarm.addListener(async (alarm) => {
  const settings = await getSettings();
  if (alarm.name === ALARM_PRUNE) {
    await pruneUndo(Date.now(), settings.undoRetentionDays);
    return;
  }
  if (alarm.name === ALARM_SCAN && settings.automationMode === 'auto') {
    await runScan();
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
    } else if (needsReview.length) {
      await notify(`${needsReview.length} suggestions ready to review.`);
    }
    return items;
  } finally {
    nativeClient.disconnect();
  }
}

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
        await setSettings({ ignore: next });
        sendResponse({ ok: true, ignore: next });
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
        for (const entry of chosen) { try { await reverseEntry(entry, chrome); } catch { /* skip */ } }
        const remaining = log.filter((e) => !message.undoIds.includes(e.undoId));
        await chrome.storage.local.set({ undoLog: remaining });
        sendResponse({ ok: true, undone: chosen.length });
      } else if (message.cmd === 'getUndo') {
        sendResponse({ ok: true, entries: await getUndoLog() });
      } else if (message.cmd === 'command') {
        const nativeClient = createNativeClient();
        try {
          const items = await runCommand(message.instruction, { nativeClient, windowId: message.windowId ?? null });
          await chrome.storage.local.set({ currentPlan: items });
          sendResponse({ ok: true, items });
        } finally {
          nativeClient.disconnect();
        }
      } else if (message.cmd === 'saveSession') {
        const session = await saveCurrentWindowSession(message.name, { chrome });
        sendResponse({ ok: true, session });
      } else if (message.cmd === 'listSessions') {
        sendResponse({ ok: true, sessions: await listSessions() });
      } else if (message.cmd === 'restoreSession') {
        const session = await restoreSession(message.id, { chrome });
        sendResponse({ ok: true, session });
      } else if (message.cmd === 'deleteSession') {
        await saveSessions(removeSession(await listSessions(), message.id));
        sendResponse({ ok: true });
      } else if (message.cmd === 'health') {
        const client = createNativeClient();
        try { sendResponse({ ok: true, health: await client.request({ type: 'health' }) }); }
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
