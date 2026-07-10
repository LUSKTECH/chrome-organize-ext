import { getSettings } from '../lib/storage.js';
import { installActivityListeners } from '../lib/activity-tracker.js';
import { createNativeClient } from '../lib/native-client.js';
import { buildPlan, partitionForApply, applyItems } from '../lib/orchestrator.js';
import { applyItem } from '../lib/executor.js';
import { recordUndo, reverseEntry, pruneUndo, getUndoLog } from '../lib/undo-log.js';

const ALARM_SCAN = 'organizer-scan';
const ALARM_PRUNE = 'organizer-prune';

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  await chrome.alarms.create(ALARM_SCAN, { periodInMinutes: settings.scanIntervalMinutes });
  await chrome.alarms.create(ALARM_PRUNE, { periodInMinutes: 1440 });
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

async function runScan() {
  const settings = await getSettings();
  const nativeClient = createNativeClient();
  const items = await buildPlan({ settings, nativeClient });
  const { autoApply, needsReview } = partitionForApply(items, settings);
  await chrome.storage.local.set({ currentPlan: needsReview });
  if (autoApply.length) {
    const res = await applyItems(autoApply, { applyItem: (i) => applyItem(i, {}), recordUndo });
    await notify(`Applied ${res.applied.length} changes (${res.failed.length} failed). Undo available.`);
  } else if (needsReview.length) {
    await notify(`${needsReview.length} suggestions ready to review.`);
  }
  return items;
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
        const items = await runScan();
        sendResponse({ ok: true, items });
      } else if (message.cmd === 'getPlan') {
        const { currentPlan = [] } = await chrome.storage.local.get('currentPlan');
        sendResponse({ ok: true, items: currentPlan });
      } else if (message.cmd === 'apply') {
        const { currentPlan = [] } = await chrome.storage.local.get('currentPlan');
        const chosen = currentPlan.filter((i) => message.itemIds.includes(i.itemId));
        const res = await applyItems(chosen, { applyItem: (i) => applyItem(i, {}), recordUndo });
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
      } else {
        sendResponse({ ok: false, error: 'unknown command' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String((err && err.message) || err) });
    }
  })();
  return true; // async response
});
