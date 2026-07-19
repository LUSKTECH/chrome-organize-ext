import { withLock } from './mutex.js';

const DAY = 86400000;

export function markActive(activity, tabId, now) {
  const next = { ...activity };
  const cur = next[tabId] || { firstSeen: now };
  next[tabId] = { firstSeen: cur.firstSeen ?? now, lastActive: now };
  return next;
}

// Drop entries for closed tabs; add entries for tabs we have not seen.
export function reconcile(activity, tabs, now) {
  const next = {};
  for (const t of tabs) {
    const prev = activity[t.id];
    if (prev) {
      next[t.id] = prev;
    } else {
      const seed = t.lastAccessed ?? now;
      next[t.id] = { firstSeen: seed, lastActive: seed };
    }
  }
  return next;
}

export function idleDays(entry, now) {
  return Math.floor((now - (entry?.lastActive ?? now)) / DAY);
}

// Wires tab events to persist the activity map. Call once from the service worker.
export function installActivityListeners(chromeApi = chrome) {
  // Serialize the read-modify-write so two events firing together (e.g. a tab
  // activation racing an onUpdated:complete) can't each write back a snapshot
  // that drops the other's timestamp. All tabActivity writers share this key.
  const update = (tabId) => withLock('tabActivity', async () => {
    const { tabActivity = {} } = await chromeApi.storage.local.get('tabActivity');
    await chromeApi.storage.local.set({ tabActivity: markActive(tabActivity, tabId, Date.now()) });
  });
  chromeApi.tabs.onActivated.addListener(({ tabId }) => { update(tabId); });
  chromeApi.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') update(tabId);
  });
}
