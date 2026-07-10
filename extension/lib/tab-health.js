import { normalizeUrl } from './url-utils.js';

export function findDuplicateTabs(tabs) {
  const groups = new Map();
  for (const t of tabs) {
    const key = normalizeUrl(t.url);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  const items = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    // Keep the most-recently-active; prefer keeping a pinned tab.
    const keep = group.slice().sort((a, b) => (b.pinned - a.pinned) || (b.lastActive - a.lastActive))[0];
    for (const t of group) {
      if (t.tabId === keep.tabId || t.pinned) continue;
      items.push({
        itemId: `close-${t.tabId}`,
        action: 'closeTab',
        status: 'pending',
        reason: `Duplicate of "${keep.title || keep.url}"`,
        data: { tabId: t.tabId, url: t.url, title: t.title, windowId: t.windowId, index: t.index, pinned: false, bookmarkFirst: false },
      });
    }
  }
  return items;
}
