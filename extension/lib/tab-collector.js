import { isHttpUrl } from './url-utils.js';

const DAY = 86400000;

export function toSnapshot(tab, activity, now) {
  const entry = activity[tab.id] || {};
  const lastActive = entry.lastActive ?? tab.lastAccessed ?? now;
  const firstSeen = entry.firstSeen ?? lastActive;
  return {
    tabId: tab.id,
    windowId: tab.windowId,
    index: tab.index,
    title: tab.title || '',
    url: tab.url || '',
    pinned: !!tab.pinned,
    groupId: tab.groupId ?? -1,
    lastActive,
    firstSeen,
    ageDays: Math.floor((now - firstSeen) / DAY),
    idleDays: Math.floor((now - lastActive) / DAY),
  };
}

export async function collectTabs(chromeApi = chrome, activity = {}, now = Date.now(), windowId = null) {
  const tabs = await chromeApi.tabs.query({});
  return tabs
    .filter((t) => isHttpUrl(t.url))
    .filter((t) => windowId == null || t.windowId === windowId)
    .map((t) => toSnapshot(t, activity, now));
}
